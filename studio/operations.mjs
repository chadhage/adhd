import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { containsCredential, digest, identifier, object, StudioError, text } from './contracts.mjs';
import { readProtectedFile, runtimePath, sanitizeRuntimeError } from './container.mjs';

const actions = ['git-publish', 'merge-pull-request', 'infrastructure', 'deploy-nonproduction', 'release-production'];
const programs = new Set(['git', 'gh', 'az', 'aws', 'gcloud', 'terraform', 'bicep', 'kubectl', 'helm', 'node', 'python3', 'pwsh']);
const environmentKeys = new Set([
  'PATH', 'LANG', 'LC_ALL', 'TZ', 'HOME', 'JAVA_HOME', 'DOTNET_ROOT',
  'GH_TOKEN', 'GITHUB_TOKEN', 'AZURE_CONFIG_DIR', 'AZURE_CLIENT_ID', 'AZURE_TENANT_ID', 'AZURE_FEDERATED_TOKEN_FILE',
  'ARM_CLIENT_ID', 'ARM_TENANT_ID', 'ARM_SUBSCRIPTION_ID', 'ARM_CLIENT_SECRET', 'ARM_USE_OIDC', 'ARM_OIDC_TOKEN_FILE_PATH',
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_REGION', 'AWS_DEFAULT_REGION',
  'AWS_CONFIG_FILE', 'AWS_SHARED_CREDENTIALS_FILE', 'AWS_ROLE_ARN', 'AWS_WEB_IDENTITY_TOKEN_FILE',
  'GOOGLE_APPLICATION_CREDENTIALS', 'CLOUDSDK_CONFIG', 'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE',
]);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const safeArguments = (args) => Array.isArray(args) && args.length <= 128 && args.every((arg) => typeof arg === 'string'
  && arg.length <= 4096 && !/[\u0000-\u001f]/.test(arg)
  && !/^(?:--(?:force(?:-with-lease)?|no-verify|admin|skip-checks|bypass|insecure|no-check-certificate|skip-certificate-check)|-f)(?:=|$)/i.test(arg)
  && !/(?:core\.hooksPath|receive\.deny|http\.sslVerify\s*=\s*false)/i.test(arg)
  && !/(?:^|[-_])(?:password|secret|token|authorization|account-key)(?:=|$)/i.test(arg));

function reviewedSpec(input) {
  object(input, ['command', 'args', 'script', 'env', 'timeoutMs', 'maximumOutputBytes']);
  if (typeof input.command !== 'string' || !programs.has(input.command) || !safeArguments(input.args)
    || containsCredential(JSON.stringify(input))) throw new StudioError('OPERATION_CONFIGURATION', 'Use a supported installed command with literal non-credential arguments; shells and protection/TLS bypass flags are denied.');
  const invocation = `${input.command} ${input.args.join(' ')}`;
  if (/^(?:gh auth (?:login|refresh)|aws (?:configure|sso login)|terraform login|git credential|gcloud auth (?:login|application-default login))(?:\s|$)/.test(invocation)
    || (input.command === 'az' && input.args[0] === 'login' && !input.args.includes('--identity'))) {
    throw new StudioError('OPERATION_CONFIGURATION', 'Interactive CLI authentication remains human-only. Configure an existing credential or explicitly selected noninteractive workload identity; adapters never answer consent.');
  }
  const env = input.env ?? [];
  if (!Array.isArray(env) || env.length > environmentKeys.size || new Set(env).size !== env.length || env.some((key) => !environmentKeys.has(key))) {
    throw new StudioError('OPERATION_CONFIGURATION', 'Use an explicit supported environment whitelist, never controller or SDK secrets.');
  }
  if (input.script !== undefined && (typeof input.script !== 'string' || !isAbsolute(input.script))) throw new StudioError('OPERATION_CONFIGURATION', 'Reviewed adapter scripts require an absolute protected path outside the product.');
  if (['node', 'python3', 'pwsh'].includes(input.command) && !input.script) throw new StudioError('OPERATION_CONFIGURATION', 'Interpreters must execute an explicitly reviewed external script, never inline code.');
  if (input.script && !['node', 'python3', 'pwsh'].includes(input.command)) throw new StudioError('OPERATION_CONFIGURATION', 'Script adapters support only Node, isolated Python or noninteractive PowerShell.');
  const timeoutMs = input.timeoutMs ?? 30_000;
  const maximumOutputBytes = input.maximumOutputBytes ?? 64 * 1024;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000
    || !Number.isSafeInteger(maximumOutputBytes) || maximumOutputBytes < 1024 || maximumOutputBytes > 512 * 1024) {
    throw new StudioError('OPERATION_CONFIGURATION', 'Reviewed commands require bounded time and output.');
  }
  return { command: input.command, args: input.args, ...(input.script ? { script: input.script } : {}), env, timeoutMs, maximumOutputBytes };
}

export function operationEnvironment(spec, env) {
  const clean = Object.fromEntries(spec.env.filter((key) => typeof env[key] === 'string').map((key) => [key, env[key]]));
  // PATH is fixed to image toolchains; product-local executables cannot replace an adapter.
  clean.PATH = runtimePath;
  Object.assign(clean, {
    CI: 'true', GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1',
    CLOUDSDK_CORE_DISABLE_PROMPTS: '1', AZURE_CORE_ONLY_SHOW_ERRORS: 'true',
    AWS_PAGER: '', PAGER: '', TF_INPUT: '0',
  });
  return clean;
}

export async function executeReviewedCommand(spec, input, { workspace, env = process.env, signal } = {}) {
  spec = reviewedSpec(spec);
  signal?.throwIfAborted();
  const payload = JSON.stringify(input);
  if (Buffer.byteLength(payload) > 512 * 1024 || containsCredential(payload)) throw new StudioError('OPERATION_INPUT_DENIED', 'Adapter stdin is bounded plan data, not credentials.');
  const args = spec.script ? [
    ...(spec.command === 'pwsh' ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-File'] : spec.command === 'python3' ? ['-I'] : []),
    spec.script, ...spec.args,
  ] : spec.args;
  const clean = operationEnvironment(spec, env);
  const timeout = AbortSignal.timeout(spec.timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  return new Promise((resolveCommand, reject) => {
    const child = spawn(spec.command, args, { cwd: workspace, env: clean, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', failure, killTimer;
    const terminate = () => {
      child.kill('SIGTERM');
      killTimer ??= setTimeout(() => child.kill('SIGKILL'), 1000);
    };
    const abort = () => { failure ??= combined.reason; terminate(); };
    const collect = (name, chunk) => {
      const previous = name === 'stdout' ? stdout : stderr;
      const next = previous + chunk.toString('utf8');
      if (Buffer.byteLength(next) > spec.maximumOutputBytes) {
        failure ??= new StudioError('OPERATION_OUTPUT_LIMIT', 'The reviewed command exceeded its bounded output capture.');
        terminate();
      } else if (name === 'stdout') stdout = next;
      else stderr = next;
    };
    child.stdout.on('data', (chunk) => collect('stdout', chunk));
    child.stderr.on('data', (chunk) => collect('stderr', chunk));
    child.stdin.on('error', (error) => { failure ??= error; terminate(); });
    child.once('error', (error) => { failure ??= error; });
    combined.addEventListener('abort', abort, { once: true });
    if (combined.aborted) abort();
    child.once('close', (code, terminationSignal) => {
      clearTimeout(killTimer);
      combined.removeEventListener('abort', abort);
      if (failure || code !== 0) {
        const error = new StudioError('OPERATION_COMMAND_FAILED',
          sanitizeRuntimeError(`${failure?.message ?? `Reviewed command exited ${code ?? terminationSignal}`}\n${stderr}\n${stdout}`,
            Object.entries(clean).filter(([key]) => /(?:TOKEN|SECRET|PASSWORD)$/.test(key)).map(([, value]) => value)), 422);
        error.cause = failure;
        error.exitCode = code;
        error.terminationSignal = terminationSignal;
        reject(error);
      } else resolveCommand({ code, stdout, stderr });
    });
    child.stdin.end(`${payload}\n`);
  });
}

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export async function loadOperations(path, {
  workspace, env = process.env, readFileFn = readProtectedFile, commandFn = executeReviewedCommand,
} = {}) {
  if (path === undefined) return { commands: {}, operations: {} };
  const read = (file, maximum = 512 * 1024) => readFileFn(file, { workspace, maximum, publicFile: true });
  const source = await read(path);
  let configuration;
  try { configuration = JSON.parse(source.toString('utf8')); } catch { throw new StudioError('OPERATION_CONFIGURATION', 'Reviewed operation configuration must be valid JSON.'); }
  object(configuration, ['version', 'commands', 'operations']);
  if (configuration.version !== 1 || containsCredential(source.toString('utf8'))) throw new StudioError('OPERATION_CONFIGURATION', 'Use version 1 reviewed command configuration without embedded credentials.');
  const commands = configuration.commands ?? {};
  if (!commands || typeof commands !== 'object' || Array.isArray(commands) || Object.keys(commands).length > 32) throw new StudioError('OPERATION_CONFIGURATION', 'Configure at most 32 named isolated build programs.');
  for (const [name, program] of Object.entries(commands)) {
    identifier(name);
    object(program, ['command', 'args']);
    if (typeof program.command !== 'string' || !/^[a-zA-Z0-9_.+-]+$/.test(program.command)
      || ['sh', 'bash', 'cmd', 'powershell'].includes(program.command.toLowerCase()) || !safeArguments(program.args)
      || containsCredential(JSON.stringify(program))) throw new StudioError('OPERATION_CONFIGURATION', 'Build programs require literal, non-shell, non-credential arguments; execution is delegated only to an isolated executor.');
  }
  const specs = configuration.operations ?? {};
  object(specs, actions);
  const sourceDigest = sha256(source);
  const operations = {};
  for (const [action, input] of Object.entries(specs)) {
    object(input, ['target', 'artifactFile', 'plan', 'validate', 'apply']);
    const target = text(input.target, 'Reviewed operation target', 300);
    if (containsCredential(target) || typeof input.artifactFile !== 'string' || !isAbsolute(input.artifactFile)) {
      throw new StudioError('OPERATION_CONFIGURATION', 'Bind an explicit reviewed target and a protected immutable plan/artifact file outside the product.');
    }
    const stages = Object.fromEntries(['plan', 'validate', 'apply'].map((phase) => [phase, reviewedSpec(input[phase])]));
    const scripts = {};
    for (const spec of Object.values(stages)) if (spec.script && !scripts[spec.script]) scripts[spec.script] = sha256(await read(spec.script));
    const policyDigest = digest({ sourceDigest, action, target, artifactFile: input.artifactFile, stages, scripts });
    const plans = new WeakMap();
    const checkPolicy = async () => {
      if (sha256(await read(path)) !== sourceDigest) throw new StudioError('OPERATION_POLICY_CHANGED', 'Reviewed operation configuration changed; prior plans are invalid.', 409);
      for (const [file, hash] of Object.entries(scripts)) if (sha256(await read(file)) !== hash) throw new StudioError('OPERATION_POLICY_CHANGED', 'Reviewed adapter code changed; prior plans are invalid.', 409);
    };
    const artifactDigest = async () => sha256(await read(input.artifactFile, 16 * 1024 * 1024));
    const run = async (phase, data, signal) => {
      signal?.throwIfAborted();
      await checkPolicy();
      const result = await commandFn(stages[phase], { version: 1, action, phase, policyDigest, input: data }, { workspace, env, signal });
      if (result.code !== 0) throw new StudioError('OPERATION_COMMAND_FAILED', sanitizeRuntimeError(result.stderr ?? result.output ?? `Reviewed command exited ${result.code}.`), 422);
      if (typeof result.stdout !== 'string' || containsCredential(result.stdout)) throw new StudioError('OPERATION_RESULT_DENIED', 'Reviewed commands must return bounded credential-free JSON, not log claims.');
      try { return JSON.parse(result.stdout); } catch { throw new StudioError('OPERATION_RESULT_INVALID', 'Reviewed command output must be one JSON result. No success fallback is permitted.', 422); }
    };
    const assertPlan = async (plan) => {
      const registered = plans.get(plan);
      if (!registered || registered.fingerprint !== digest(plan) || plan.policyDigest !== policyDigest) throw new StudioError('PLAN_CHANGED', 'This exact immutable plan was not produced by the current reviewed adapter.', 409);
      await checkPolicy();
      if (await artifactDigest() !== plan.artifactDigest) throw new StudioError('PLAN_CHANGED', 'The original plan/artifact file changed.', 409);
      return registered;
    };
    const validate = async (plan, { signal } = {}) => {
      await assertPlan(plan);
      const result = await run('validate', plan, signal);
      object(result, ['valid', 'planDigest']);
      if (typeof result.valid !== 'boolean' || result.planDigest !== plan.digest) throw new StudioError('PLAN_CHANGED', 'The validation receipt does not refer to the original plan.', 409);
      await assertPlan(plan);
      return result.valid;
    };
    operations[action] = {
      policyDigest,
      async plan({ head, cycleId, signal }) {
        if (typeof head !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(head)) throw new StudioError('OPERATION_CONFIGURATION', 'Plan against an explicit immutable Git head.');
        identifier(cycleId);
        const result = await run('plan', { head, cycleId }, signal);
        object(result, ['head', 'maximumCost', 'currency', 'costSource', 'target', 'artifactDigest', 'details']);
        if (result.head !== head || result.target !== target || !Number.isFinite(result.maximumCost) || result.maximumCost < 0
          || typeof result.currency !== 'string' || !/^[A-Z]{3}$/.test(result.currency)
          || typeof result.artifactDigest !== 'string' || !/^[a-f0-9]{64}$/.test(result.artifactDigest)) {
          throw new StudioError('UNVERIFIED_OPERATION_PLAN', 'The command must report the exact head/target/artifact and an explicit sourced maximum cost and currency.', 409);
        }
        const costSource = text(result.costSource, 'Observed operation cost source', 400);
        if (result.details !== undefined) object(result.details, Object.keys(result.details ?? {}));
        await checkPolicy();
        if (await artifactDigest() !== result.artifactDigest) throw new StudioError('PLAN_CHANGED', 'Observed plan/artifact bytes do not match the reported digest.', 409);
        const payload = { ...result, costSource, cycleId, policyDigest };
        const plan = freeze({ ...payload, digest: digest(payload) });
        plans.set(plan, { fingerprint: digest(plan), phase: 'planned' });
        return plan;
      },
      validate,
      async apply(plan, options = {}) {
        const registered = await assertPlan(plan);
        if (registered.phase !== 'planned') throw new StudioError('OPERATION_RECONCILIATION_REQUIRED', 'Apply was already attempted. Its effect must be reconciled; uncertain operations are never replayed.', 409);
        if (!await validate(plan, options)) throw new StudioError('PLAN_CHANGED', 'The trusted validator rejected the unchanged plan.', 409);
        registered.phase = 'applying';
        const result = await run('apply', plan, options.signal);
        object(result, ['success', 'planDigest', 'receipt']);
        if (result.success !== true || result.planDigest !== plan.digest) throw new StudioError('OPERATION_UNVERIFIED', 'Apply did not return an observed success receipt for the original plan digest.', 409);
        registered.phase = 'applied';
        return result;
      },
    };
  }
  return { commands: freeze(commands), operations, policyDigest: sourceDigest };
}
