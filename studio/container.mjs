import * as filesystem from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { containsCredential, digest, object, redact, StudioError, validateBlueprint } from './contracts.mjs';

export const runtimeFileKeys = Object.freeze([
  'STUDIO_CONFIG_FILE', 'STUDIO_TOKEN_FILE', 'STUDIO_COPILOT_TOKEN_FILE',
  'STUDIO_WORKER_TOKEN_FILE', 'STUDIO_EXECUTOR_TOKEN_FILE', 'STUDIO_DATABASE_URL_FILE',
  'STUDIO_CERT_FILE', 'STUDIO_KEY_FILE', 'STUDIO_MANDATE_FILE',
  'STUDIO_CONNECTOR_TOKEN_FILE', 'STUDIO_OPERATIONS_FILE', 'NODE_EXTRA_CA_CERTS',
]);
export const runtimePath = '/usr/local/bin:/usr/bin:/bin:/opt/dotnet:/usr/local/go/bin:/opt/google-cloud-sdk/bin:/opt/powershell';
const frameworkRoot = fileURLToPath(new URL('..', import.meta.url));
const inside = (root, path) => {
  const pathWithin = relative(root, path);
  return !pathWithin || (!isAbsolute(pathWithin) && pathWithin !== '..' && !pathWithin.startsWith(`..${sep}`));
};

export function sanitizeRuntimeError(error, secrets = []) {
  let message = error instanceof AggregateError
    ? `${error.message}: ${error.errors.map((failure) => sanitizeRuntimeError(failure, secrets)).join('; ')}`
    : String(error?.message ?? error);
  for (const secret of secrets) if (typeof secret === 'string' && secret) message = message.split(secret).join('[REDACTED]');
  return redact(message).slice(0, 2000);
}

export function integerEnvironment(env, name, fallback, minimum, maximum) {
  const raw = env[name];
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < minimum || Number(raw) > maximum) {
    throw new StudioError('RUNTIME_CONFIGURATION', `${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return Number(raw);
}

export function exactOrigin(value, { loopbackHttp = false } = {}) {
  let url;
  try { url = new URL(value); } catch { throw new StudioError('TLS_REQUIRED', 'Configure an exact authenticated HTTPS origin.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.origin !== value || url.username || url.password || (url.protocol !== 'https:' && !(loopbackHttp && local && url.protocol === 'http:'))) {
    throw new StudioError('TLS_REQUIRED', 'Configure an exact HTTPS origin; plaintext is permitted only for an explicitly chosen loopback connector.');
  }
  return url;
}

export function sdkEnvironment(env, { home, caFile } = {}) {
  const allowed = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'PATHEXT', 'LANG', 'LC_ALL', 'TZ',
    'DOTNET_ROOT', 'JAVA_HOME', 'GOROOT'];
  const clean = Object.fromEntries(allowed.filter((key) => typeof env[key] === 'string').map((key) => [key, env[key]]));
  clean.PATH ??= runtimePath;
  if (home) {
    clean.HOME = home;
    clean.TMPDIR = home;
    clean.TEMP = home;
    clean.TMP = home;
    clean.XDG_CONFIG_HOME = join(home, 'config');
    clean.XDG_CACHE_HOME = join(home, 'cache');
  }
  if (caFile) clean.NODE_EXTRA_CA_CERTS = caFile;
  clean.GIT_TERMINAL_PROMPT = '0';
  clean.CI = 'true';
  return clean;
}

async function readOnlySecretMount(path, fsApi, platform) {
  if (platform !== 'linux' || !inside('/run/studio', path)) return false;
  const source = await fsApi.readFile('/proc/self/mountinfo', 'utf8');
  if (source.length > 1024 * 1024) return false;
  let selected;
  for (const line of source.split('\n')) {
    const fields = line.split(' ');
    if (fields.length < 7) continue;
    const mount = fields[4].replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
    if (inside(mount, path) && (!selected || mount.length > selected.mount.length)) selected = { mount, options: fields[5].split(',') };
  }
  return selected?.options.includes('ro') === true;
}

export async function readProtectedFile(path, {
  workspace, optional = false, maximum = 256 * 1024, publicFile = false,
  fsApi = filesystem, platform = process.platform, uid = process.getuid?.(), gid = process.getgid?.(),
} = {}) {
  if (path === undefined && optional) return null;
  if (typeof path !== 'string' || !isAbsolute(path) || /[\u0000-\u001f]/.test(path)) {
    throw new StudioError('SECRET_CONFIGURATION', 'Runtime files require explicit absolute paths outside the product repository.');
  }
  if (workspace && inside(resolve(workspace), resolve(path))) throw new StudioError('SECRET_IN_PRODUCT', 'Runtime configuration and credentials cannot be read from the product repository.', 403);
  let handle;
  try {
    const actual = await fsApi.realpath(path);
    let product = workspace && resolve(workspace);
    if (workspace) {
      try { product = await fsApi.realpath(workspace); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    if (product && inside(product, actual)) throw new StudioError('SECRET_IN_PRODUCT', 'A linked runtime file resolves into the product repository.', 403);
    const before = await fsApi.lstat(actual);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > maximum) {
      throw new StudioError('SECRET_CONFIGURATION', 'Runtime files must be bounded, ordinary, singly linked files.');
    }
    if (platform !== 'win32') {
      if ((before.mode & 0o022) || (before.uid !== 0 && before.uid !== uid)) {
        throw new StudioError('SECRET_PERMISSIONS', 'Runtime files require trusted ownership and no group/world write permissions.', 403);
      }
      const broadRead = !publicFile && ((before.mode & 0o007) || ((before.mode & 0o040) && before.gid !== gid));
      // ACA/ACI secret projections may be root-owned 0444; accept only an observed read-only, private runtime mount.
      if (broadRead && !(before.uid === 0 && await readOnlySecretMount(actual, fsApi, platform))) {
        throw new StudioError('SECRET_PERMISSIONS', 'Runtime secrets require restricted read permissions or an observed read-only /run/studio secret mount.', 403);
      }
    }
    // Resolve projected Kubernetes secrets, then open the actual file without following a replacement link.
    handle = await fsApi.open(actual, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const held = await handle.stat();
    if (!held.isFile() || held.ino !== before.ino || held.dev !== before.dev || held.size > maximum) {
      throw new StudioError('SECRET_CHANGED', 'A runtime file changed while it was being opened.', 409);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (bytes.length > maximum || after.size !== held.size || after.mtimeMs !== held.mtimeMs
      || await fsApi.realpath(path) !== actual) throw new StudioError('SECRET_CHANGED', 'A runtime file changed while it was being read.', 409);
    if (optional && !bytes.toString('utf8').trim()) return null;
    return bytes;
  } catch (error) {
    if (optional && error.code === 'ENOENT') return null;
    throw error;
  } finally { await handle?.close(); }
}

export function validateRuntimeConfiguration(input) {
  object(input, ['version', 'blueprint', 'verification', 'bindingKey']);
  if (input.version !== 1 || typeof input.bindingKey !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.bindingKey)) {
    throw new StudioError('RUNTIME_CONFIGURATION', 'Use runtime configuration version 1 with a stable product binding key.');
  }
  if (containsCredential(JSON.stringify(input))) throw new StudioError('CREDENTIAL_IN_CONFIGURATION', 'Credentials belong in runtime secret files, never a blueprint.');
  object(input.verification, ['command', 'args']);
  if (typeof input.verification.command !== 'string' || !input.verification.command.trim()
    || /[\u0000-\u001f]/.test(input.verification.command) || !Array.isArray(input.verification.args)
    || input.verification.args.length > 128 || input.verification.args.some((arg) => typeof arg !== 'string' || /[\u0000-\u001f]/.test(arg))) {
    throw new StudioError('VERIFICATION_REQUIRED', 'Configure an owner-reviewed executable and bounded string arguments.');
  }
  return { version: 1, blueprint: validateBlueprint(input.blueprint), verification: input.verification, bindingKey: input.bindingKey };
}

export async function readRuntimeConfiguration(env = process.env, { readFileFn = readProtectedFile } = {}) {
  if (typeof env.STUDIO_WORKSPACE !== 'string' || !isAbsolute(env.STUDIO_WORKSPACE)) {
    throw new StudioError('WORKSPACE_REQUIRED', 'Configure an explicit absolute product volume directory.');
  }
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new StudioError('TLS_REQUIRED', 'Disabling runtime TLS verification is not supported.');
  const bytes = await readFileFn(env.STUDIO_CONFIG_FILE, { workspace: env.STUDIO_WORKSPACE, publicFile: true });
  let input;
  try { input = JSON.parse(bytes.toString('utf8')); } catch { throw new StudioError('RUNTIME_CONFIGURATION', 'The runtime file must contain valid JSON.'); }
  const configuration = validateRuntimeConfiguration(input);
  if (env.STUDIO_STORE_KEY !== undefined && env.STUDIO_STORE_KEY !== configuration.bindingKey) {
    throw new StudioError('PRODUCT_BINDING_MISMATCH', 'The runtime and external store binding keys differ.', 409);
  }
  return configuration;
}

export function runtimeToken(bytes, label) {
  const token = bytes?.toString('utf8').trim();
  if (!token || token.length < 32 || token.length > 256 || /[\s\u0000-\u001f]/.test(token)) {
    throw new StudioError('AUTH_CONFIGURATION', `${label} requires a protected 32-256 character runtime token; interactive login is not attempted.`);
  }
  return token;
}

export async function readRuntimeSecrets(env, configuration, { worker = false, readFileFn = readProtectedFile } = {}) {
  const read = (key, optional = false, publicFile = false) => readFileFn(env[key], { workspace: env.STUDIO_WORKSPACE, optional, publicFile });
  const connector = configuration.blueprint.deployment?.identity === 'hosted-connector';
  const secrets = {
    token: runtimeToken(await read(worker ? 'STUDIO_WORKER_TOKEN_FILE' : 'STUDIO_TOKEN_FILE'), worker ? 'Worker authentication' : 'Owner authentication'),
    copilotToken: connector ? null : runtimeToken(await read('STUDIO_COPILOT_TOKEN_FILE'), 'GitHub Copilot authentication'),
    connectorToken: connector ? runtimeToken(await read('STUDIO_CONNECTOR_TOKEN_FILE'), 'Hosted connector authentication') : null,
    caFile: null,
  };
  if (env.NODE_EXTRA_CA_CERTS) {
    await read('NODE_EXTRA_CA_CERTS', false, true);
    secrets.caFile = env.NODE_EXTRA_CA_CERTS;
  }
  if (worker) return secrets;
  const cert = await read('STUDIO_CERT_FILE', true, true);
  const key = await read('STUDIO_KEY_FILE', true);
  if (Boolean(cert) !== Boolean(key)) throw new StudioError('TLS_REQUIRED', 'Provide both a TLS certificate and private key, or explicit trusted HTTPS ingress.');
  secrets.tls = cert ? { cert, key } : undefined;
  const executor = await read('STUDIO_EXECUTOR_TOKEN_FILE', true);
  secrets.executorToken = executor ? runtimeToken(executor, 'Executor authentication') : null;
  if (secrets.token === secrets.copilotToken || (secrets.executorToken
    && (secrets.executorToken === secrets.token || secrets.executorToken === secrets.copilotToken))) {
    throw new StudioError('AUTH_CONFIGURATION', 'Owner, provider and executor credentials must be distinct.');
  }
  secrets.databaseUrl = (await read('STUDIO_DATABASE_URL_FILE', true))?.toString('utf8').trim() ?? null;
  const mandate = await read('STUDIO_MANDATE_FILE', true);
  try { secrets.mandate = mandate ? JSON.parse(mandate.toString('utf8')) : null; }
  catch { throw new StudioError('INVALID_MANDATE', 'The optional mandate file must contain a signed JSON envelope, not an approval claim.'); }
  return secrets;
}

export async function createRuntimeClient({ configuration, secrets, env, baseDirectory, sdk }) {
  sdk ??= await import('@github/copilot-sdk');
  const options = { mode: 'empty', baseDirectory, logLevel: 'none', autoStart: false, autoRestart: false };
  if (configuration.blueprint.deployment?.identity === 'hosted-connector') {
    const url = exactOrigin(env.STUDIO_COPILOT_RUNTIME_URL, { loopbackHttp: true });
    if (url.protocol === 'https:') {
      throw new StudioError('CONNECTOR_TLS_UNSUPPORTED', 'Copilot SDK 1.0.34 uses raw TCP for URI connections and does not support HTTPS. Supply an owner-managed authenticated TLS tunnel with an explicit loopback endpoint; no TLS downgrade is performed.', 503);
    }
    options.connection = sdk.RuntimeConnection.forUri(url.origin, { connectionToken: secrets.connectorToken });
  } else {
    options.connection = sdk.RuntimeConnection.forStdio();
    options.gitHubToken = secrets.copilotToken;
    options.useLoggedInUser = false;
    options.env = sdkEnvironment(env, { home: baseDirectory, caFile: secrets.caFile });
  }
  return new sdk.CopilotClient(options);
}

export async function managedDirectory(root, parts, { fsApi = filesystem, create = false } = {}) {
  let current = await fsApi.realpath(root);
  const rootInfo = await fsApi.lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new StudioError('MANAGED_PATH_DENIED', 'The configured product volume cannot be a symbolic link.', 403);
  for (const part of parts) {
    current = join(current, part);
    let info;
    try { info = await fsApi.lstat(current); } catch (error) {
      if (error.code !== 'ENOENT' || !create) throw error;
      try { await fsApi.mkdir(current, { mode: 0o700 }); } catch (creation) { if (creation.code !== 'EEXIST') throw creation; }
      info = await fsApi.lstat(current);
    }
    if (!info.isDirectory() || info.isSymbolicLink() || await fsApi.realpath(current) !== current) {
      throw new StudioError('MANAGED_PATH_DENIED', 'Managed product parents must be ordinary, unredirected directories.', 403);
    }
  }
  return current;
}

export async function prepareWorkspace(env, {
  fsApi = filesystem, commandFn, framework = frameworkRoot,
} = {}) {
  const path = env.STUDIO_WORKSPACE;
  if (typeof path !== 'string' || !isAbsolute(path)) throw new StudioError('WORKSPACE_REQUIRED', 'Configure an absolute product directory.');
  let info;
  try { info = await fsApi.lstat(path); } catch (error) {
    if (error.code !== 'ENOENT' || env.STUDIO_BOOTSTRAP_EMPTY_PRODUCT !== 'true') throw error;
    await fsApi.mkdir(path, { mode: 0o700 });
    info = await fsApi.lstat(path);
  }
  if (!info.isDirectory() || info.isSymbolicLink()) throw new StudioError('WORKSPACE_REQUIRED', 'The product volume must be an ordinary directory.');
  const root = await fsApi.realpath(path);
  const source = await fsApi.realpath(framework);
  if (inside(source, root) || inside(root, source)) throw new StudioError('FRAMEWORK_WORKSPACE', 'The product repository must not overlap the framework.', 403);
  const entries = await fsApi.readdir(root);
  if (entries.length) return root;
  if (env.STUDIO_BOOTSTRAP_EMPTY_PRODUCT !== 'true') throw new StudioError('INITIAL_COMMIT_REQUIRED', 'Mount an existing product Git repository, or explicitly enable empty-product bootstrap.');
  // Reserving the new Git directory prevents two empty-volume bootstrappers from both initializing it.
  await fsApi.mkdir(join(root, '.git'), { mode: 0o700 });
  if ((await fsApi.readdir(root)).some((entry) => entry !== '.git')) throw new StudioError('BOOTSTRAP_CONFLICT', 'The empty product changed; existing work is not overwritten.', 409);
  commandFn ??= (await import('./repository.mjs')).command;
  const gitEnv = {
    ...sdkEnvironment(env, { home: root }), GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
  };
  for (const args of [
    ['init', '--initial-branch=main'],
    ['config', 'user.name', 'ADHD container'],
    ['config', 'user.email', 'adhd-container@users.noreply.github.com'],
    ['commit', '--allow-empty', '-m', 'Initialize empty product repository',
      '-m', 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>'],
  ]) {
    const result = await commandFn('git', ['--no-pager', ...args], root, { env: gitEnv, signal: AbortSignal.timeout(30_000) });
    if (result.code !== 0) throw new StudioError('BOOTSTRAP_FAILED', `Empty-product initialization failed: ${sanitizeRuntimeError(result.output)}. Reconcile the partial repository; nothing is overwritten.`, 409);
  }
  return root;
}

export async function waitForChild(child, { processApi = process } = {}) {
  const forward = (signal) => () => child.kill(signal);
  const handlers = new Map(['SIGTERM', 'SIGINT'].map((signal) => [signal, forward(signal)]));
  for (const [signal, handler] of handlers) processApi.on(signal, handler);
  try {
    return await new Promise((resolveChild, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolveChild(code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1)));
    });
  } finally {
    for (const [signal, handler] of handlers) processApi.removeListener(signal, handler);
  }
}

export async function bootstrapAciRoot(env, {
  processApi = process, fsApi = filesystem, spawnFn = spawn,
  readFileFn = (path, options) => readProtectedFile(path, { ...options, fsApi, uid: 0, gid: 0 }),
  entrypoint = fileURLToPath(new URL('./launch.mjs', import.meta.url)),
} = {}) {
  if (processApi.getuid?.() !== 0) return { bootstrapped: false };
  if (processApi.platform !== 'linux' || env.STUDIO_ALLOW_ACI_ROOT_BOOTSTRAP !== 'true') {
    throw new StudioError('ROOT_DENIED', 'Run as UID/GID 1000. Root is allowed only for explicitly approved ACI Azure Files secret staging.', 403);
  }
  const configuration = await readRuntimeConfiguration(env, { readFileFn });
  if (configuration.blueprint.deployment?.target !== 'aci') throw new StudioError('ROOT_DENIED', 'Root bootstrap is exclusively an ACI Azure Files exception.', 403);
  const staging = `/tmp/adhd-runtime-secrets-${randomUUID()}`;
  await fsApi.mkdir(staging, { mode: 0o700 });
  const remapped = { ...env };
  try {
    await fsApi.chown(staging, 1000, 1000);
    for (const name of runtimeFileKeys) {
      if (env[name] === undefined) continue;
      const bytes = await readFileFn(env[name], {
        workspace: env.STUDIO_WORKSPACE, optional: name !== 'STUDIO_CONFIG_FILE',
        publicFile: ['STUDIO_CONFIG_FILE', 'STUDIO_OPERATIONS_FILE', 'STUDIO_CERT_FILE', 'NODE_EXTRA_CA_CERTS'].includes(name),
      });
      if (!bytes) { delete remapped[name]; continue; }
      const destination = join(staging, name);
      await fsApi.writeFile(destination, bytes, { flag: 'wx', mode: 0o400 });
      await fsApi.chown(destination, 1000, 1000);
      await fsApi.chmod(destination, 0o400);
      remapped[name] = destination;
    }
    remapped.STUDIO_ALLOW_ACI_ROOT_BOOTSTRAP = 'false';
    processApi.setgroups([]);
    processApi.setgid(1000);
    processApi.setuid(1000);
    if (processApi.getuid() !== 1000 || processApi.getgid() !== 1000) throw new StudioError('ROOT_DENIED', 'ACI privilege demotion was not observed.', 403);
    // A fresh Node process reads the remapped NODE_EXTRA_CA_CERTS at startup, after privilege demotion.
    const child = spawnFn(processApi.execPath, [entrypoint], { env: remapped, stdio: 'inherit', shell: false });
    return { bootstrapped: true, code: await waitForChild(child, { processApi }) };
  } finally { await fsApi.rm(staging, { recursive: true, force: true }); }
}

export async function createSdkDirectory({ fsApi = filesystem } = {}) {
  const directory = `/tmp/adhd-sdk-${randomUUID()}`;
  await fsApi.mkdir(directory, { mode: 0o700 });
  return { directory, close: () => fsApi.rm(directory, { recursive: true, force: true }) };
}

export async function startContainer(env = process.env, dependencies = {}) {
  const configuration = await readRuntimeConfiguration(env, dependencies);
  const deployment = configuration.blueprint.deployment;
  const secrets = await readRuntimeSecrets(env, configuration, dependencies);
  const protectedValues = [secrets.token, secrets.copilotToken, secrets.connectorToken, secrets.executorToken, secrets.databaseUrl];
  let studio, service, client, lease, sdkDirectory, store;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    const outcomes = await Promise.allSettled([
      service ? service.close() : studio ? studio.close() : Promise.resolve(),
    ]);
    outcomes.push(...await Promise.allSettled([client?.stop(), store?.close(), lease?.close()]));
    outcomes.push(...await Promise.allSettled([sdkDirectory?.close()]));
    const failures = outcomes.filter((outcome) => outcome.status === 'rejected').map((outcome) => outcome.reason);
    if (failures.length) throw new AggregateError(failures, 'Container cleanup failed; reconciliation is required.');
  };
  try {
    if (deployment?.persistence === 'postgres') {
      if (!secrets.databaseUrl) throw new StudioError('STORE_CONFIGURATION', 'PostgreSQL persistence requires its protected connection file; volume fallback is prohibited.');
      const Store = dependencies.PostgresStore ?? (await import('./postgres-store.mjs')).PostgresStore;
      store = new Store({ connectionString: secrets.databaseUrl, key: configuration.bindingKey });
    } else {
      const leaseFn = dependencies.leaseFn ?? (await import('./lease.mjs')).inheritedContainerLease;
      lease = await leaseFn(env.STUDIO_WORKSPACE, env.STUDIO_LEASE_FD);
    }
    if (!secrets.tls && !env.STUDIO_PROXY_ORIGIN) throw new StudioError('TLS_REQUIRED', 'Container services require TLS or explicit trusted HTTPS ingress.');
    if (env.STUDIO_PROXY_ORIGIN) exactOrigin(env.STUDIO_PROXY_ORIGIN);
    sdkDirectory = await (dependencies.createSdkDirectory ?? createSdkDirectory)();
    client = await (dependencies.createClient ?? createRuntimeClient)({ configuration, secrets, env, baseDirectory: sdkDirectory.directory });
    const Runner = dependencies.CopilotRunner ?? (await import('./copilot.mjs')).CopilotRunner;
    const Engine = dependencies.Studio ?? (await import('./engine.mjs')).Studio;
    studio = new Engine({
      workspace: env.STUDIO_WORKSPACE, mode: configuration.blueprint.path,
      runner: new Runner({ client, baseDirectory: sdkDirectory.directory }),
      verification: configuration.verification, recordStore: store, leaseGuard: lease,
    });
    await studio.initialize();
    let snapshot = await studio.snapshot();
    if (!snapshot.blueprint) snapshot = await studio.saveBlueprint({ blueprint: configuration.blueprint, revision: snapshot.revision });
    else if (digest(snapshot.blueprint) !== digest(configuration.blueprint)) throw new StudioError('STALE_BLUEPRINT', 'Mounted product and image blueprints differ. Existing product work and approvals are not overwritten.', 409);
    const load = dependencies.loadOperations ?? (await import('./operations.mjs')).loadOperations;
    const reviewed = await load(env.STUDIO_OPERATIONS_FILE, { workspace: env.STUDIO_WORKSPACE, env });
    let executor;
    if (env.STUDIO_EXECUTOR_ORIGIN) {
      if (!secrets.executorToken) throw new StudioError('EXECUTOR_CONFIGURATION', 'Remote verification requires a distinct protected executor credential.');
      const Remote = dependencies.RemoteExecutor ?? (await import('./executor.mjs')).RemoteExecutor;
      executor = new Remote({ origin: env.STUDIO_EXECUTOR_ORIGIN, token: secrets.executorToken });
    } else if (env.STUDIO_VERIFICATION_IMAGE) {
      const Docker = dependencies.DockerExecutor ?? (await import('./executor.mjs')).DockerExecutor;
      executor = new Docker({
        image: env.STUDIO_VERIFICATION_IMAGE, context: env.STUDIO_DOCKER_CONTEXT ?? 'default',
        cpu: deployment?.resources.cpu ?? 1, memoryMiB: deployment?.resources.memoryMiB ?? 1024,
      });
    }
    if (deployment && deployment.humanMode !== 'in-loop' && !executor) {
      throw new StudioError('ISOLATED_EXECUTOR_REQUIRED', 'On-loop/out-of-loop operation needs an isolated executor. Generated code cannot run beside controller credentials.', 409);
    }
    const Factory = dependencies.FactoryRunner ?? (await import('./factory-runner.mjs')).FactoryRunner;
    const serve = dependencies.createStudioServer ?? (await import('./server.mjs')).createStudioServer;
    service = await serve({
      studio, token: secrets.token, mode: configuration.blueprint.path, container: true,
      hostname: '0.0.0.0', port: integerEnvironment(env, 'STUDIO_PORT', 4319, 1, 65535),
      tls: secrets.tls, proxyOrigin: env.STUDIO_PROXY_ORIGIN,
      executorToken: env.STUDIO_VERIFICATION_IMAGE && !env.STUDIO_EXECUTOR_ORIGIN ? secrets.executorToken : undefined,
      factoryOptions: {
        runner: new Factory({ client }), execution: deployment?.topology === 'distributed' ? 'workers' : 'local',
        commands: reviewed.commands, operations: reviewed.operations, executor,
      },
    });
    if (secrets.mandate) await studio.factory.importMandate(secrets.mandate);
    if (deployment?.startup === 'automatic') {
      const current = await studio.snapshot();
      if (!current.factory) throw new StudioError('MANDATE_REQUIRED', 'Automatic startup requires an approved signed stored/imported mandate. A runtime file is not authority.', 409);
      await studio.factory.start({ automatic: true });
    }
    return { studio, service, configuration, close };
  } catch (error) {
    try { await close(); } catch (cleanup) { throw new AggregateError([error, cleanup], sanitizeRuntimeError(error, protectedValues)); }
    if (error instanceof StudioError) error.message = sanitizeRuntimeError(error, protectedValues);
    throw error;
  }
}

export async function main(args = process.argv.slice(2), env = process.env) {
  if (args.length) throw new StudioError('INVALID_ARGUMENTS', 'Container configuration and secret paths are supplied only through runtime environment variables.');
  const root = await bootstrapAciRoot(env, { entrypoint: fileURLToPath(new URL('./launch.mjs', import.meta.url)) });
  if (root.bootstrapped) { process.exitCode = root.code; return root; }
  const runtime = await startContainer(env);
  const stop = () => {
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
    runtime.close().catch((error) => { console.error(sanitizeRuntimeError(error)); process.exitCode = 1; });
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  console.log(`Studio transport ready (${runtime.configuration.blueprint.deployment?.startup ?? 'studio'}); production authority is independently checked.`);
  return runtime;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => { console.error(sanitizeRuntimeError(error)); process.exitCode = 1; });
}
