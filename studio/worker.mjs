import * as filesystem from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { containsCredential, digest, object, StudioError, text } from './contracts.mjs';
import { factoryRoles, toolchains, validateDeployment, validateWritePaths } from './factory-contracts.mjs';
import {
  bootstrapAciRoot, createRuntimeClient, createSdkDirectory, exactOrigin, integerEnvironment,
  managedDirectory, readProtectedFile, readRuntimeConfiguration, readRuntimeSecrets, runtimeToken, sanitizeRuntimeError,
} from './container.mjs';

const uuid = (value) => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const observationFields = {
  'session.started': ['sessionId', 'definitionDigest'],
  'assignment.accepted': ['definitionDigest'],
  'tool.completed': ['tool', 'toolCallId'],
  'skill.loaded': ['skill', 'sourceDigest'],
  'role.result-submitted': ['decision', 'sources'],
};
const terminal = (error) => [401, 403, 409].includes(error?.status)
  || ['WORKER_PROTOCOL', 'WORKER_SCOPE_DENIED', 'CONTROLLER_LOST'].includes(error?.code) || /^WORKER_HTTP_/.test(error?.code ?? '');

export async function validateWorkerTask(input, {
  role, workspace, configuration, fsApi = filesystem, commandFn, now = Date.now(),
} = {}) {
  object(input, ['factoryId', 'assignment', 'run', 'scope', 'sourceIds', 'requiredSource', 'protectedPaths', 'writePaths',
    'allowedToolchains', 'model', 'credits', 'timeoutMs', 'memoryBinding', 'limits', 'deployment', 'evidence', 'commandNames', 'lease']);
  if (!uuid(input.factoryId) || !uuid(input.assignment?.id) || !uuid(input.run?.id) || !uuid(input.lease)
    || input.assignment.role !== role || typeof input.assignment.writable !== 'boolean'
    || (input.assignment.writable && role !== 'Fullstacker') || !Number.isFinite(Date.parse(input.assignment.deadline))
    || Date.parse(input.assignment.deadline) <= now || !Number.isSafeInteger(input.timeoutMs) || input.timeoutMs < 1 || input.timeoutMs > 3_600_000
    || !Number.isFinite(input.credits) || input.credits < 30 || input.credits > 100
    || (input.assignment.reservedCredits !== undefined && input.assignment.reservedCredits !== input.credits)) {
    throw new StudioError('WORKER_SCOPE_DENIED', 'The claim does not contain this role’s bounded, unexpired assignment and independent credit cap.', 409);
  }
  text(input.scope, 'Assignment scope');
  text(input.model, 'Selected model', 100);
  if (!Array.isArray(input.sourceIds) || !input.sourceIds.length || input.sourceIds.length > 128
    || input.sourceIds.some((id) => typeof id !== 'string' || id.length > 100)
    || !Array.isArray(input.protectedPaths) || input.protectedPaths.length > 256
    || input.protectedPaths.some((path) => typeof path !== 'string' || path.length > 300)
    || !Array.isArray(input.allowedToolchains) || input.allowedToolchains.some((name) => !toolchains.includes(name))
    || !Array.isArray(input.commandNames) || input.commandNames.some((name) => typeof name !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(name))) {
    throw new StudioError('WORKER_SCOPE_DENIED', 'The claim has unsupported source, toolchain, command or protected-path boundaries.', 409);
  }
  validateWritePaths(input.writePaths);
  const deployment = validateDeployment(input.deployment);
  if (configuration && digest(deployment) !== digest(configuration.blueprint.deployment)) throw new StudioError('WORKER_SCOPE_DENIED', 'The controller claim differs from this worker’s configured deployment.', 409);
  const directory = await managedDirectory(workspace, ['.adhd', 'studio', 'worktrees', input.run.id], { fsApi });
  commandFn ??= (await import('./repository.mjs')).command;
  const root = await fsApi.realpath(workspace);
  for (const [args, expected] of [
    [['--show-toplevel'], directory],
    [['--path-format=absolute', '--git-common-dir'], join(root, '.git')],
  ]) {
    const proof = await commandFn('git', ['--no-pager', '-c', 'core.fsmonitor=false', 'rev-parse', ...args], directory, { signal: AbortSignal.timeout(5000) });
    if (proof.code !== 0 || await fsApi.realpath(proof.output.trim()) !== await fsApi.realpath(expected)) {
      throw new StudioError('WORKER_SCOPE_DENIED', 'The derived worktree is not registered with this worker’s own product Git repository.', 409);
    }
  }
  return { ...input, run: { ...input.run, directory }, timeoutMs: Math.min(input.timeoutMs, Date.parse(input.assignment.deadline) - now) };
}

async function responseJson(response, maximum = 512 * 1024) {
  const reader = response.body?.getReader();
  if (!reader) throw new StudioError('WORKER_PROTOCOL', 'The controller returned no bounded JSON response.', 502);
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximum) throw new StudioError('WORKER_PROTOCOL', 'Controller response exceeded the worker capture limit.', 502);
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof StudioError) throw error;
    throw new StudioError('WORKER_PROTOCOL', 'The controller returned invalid JSON.', 502);
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

export class FactoryWorker {
  constructor({
    role, workspace, origin, token, configuration, createRunner,
    fetchFn = fetch, validateTask = validateWorkerTask, heartbeatMs = 5000, requestTimeoutMs = 10_000,
    sleep = (milliseconds, signal) => delay(milliseconds, undefined, { signal }), onStatus = async () => {},
    workerId = randomUUID(),
  } = {}) {
    if (!factoryRoles.includes(role) || typeof workspace !== 'string' || !isAbsolute(workspace)
      || typeof createRunner !== 'function' || !uuid(workerId)) throw new StudioError('WORKER_CONFIGURATION', 'Configure an exact role, absolute product volume and bounded task-scoped runner factory.');
    exactOrigin(origin);
    runtimeToken(Buffer.from(token ?? ''), 'Worker authentication');
    for (const value of [heartbeatMs, requestTimeoutMs]) if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) throw new StudioError('WORKER_CONFIGURATION', 'Worker heartbeat and request windows must be bounded.');
    Object.assign(this, { role, workspace, origin, token, configuration, createRunner, fetch: fetchFn, validateTask, heartbeatMs, requestTimeoutMs, sleep, onStatus, workerId });
    this.controller = new AbortController();
    this.busy = false;
  }

  async request(path, body, signal) {
    signal?.throwIfAborted();
    const serialized = JSON.stringify(body);
    if (Buffer.byteLength(serialized) > 64 * 1024) throw new StudioError('WORKER_PROTOCOL', 'Worker request exceeds the controller body limit.', 413);
    let response;
    try {
      response = await this.fetch(`${this.origin}${path}`, {
        method: 'POST', redirect: 'error', credentials: 'omit',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: serialized, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(this.requestTimeoutMs)]) : AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (error) {
      const failure = new StudioError('CONTROLLER_LOST', `Controller connection failed; no retry or lease continuation: ${sanitizeRuntimeError(error, [this.token])}`, 503);
      failure.cause = error;
      throw failure;
    }
    const result = await responseJson(response);
    if (!response.ok) throw new StudioError(`WORKER_HTTP_${response.status}`, sanitizeRuntimeError(result.error?.message ?? `Controller returned ${response.status}.`, [this.token]), response.status);
    return result;
  }

  async runOnce(signal = this.controller.signal) {
    if (this.busy) throw new StudioError('WORKER_WIP_LIMIT', 'One worker may hold only one task at a time.', 409);
    this.busy = true;
    let heartbeat, resource, failure, outcome, task, taskController;
    const heartbeatStop = new AbortController();
    try {
      const claimed = await this.request('/api/factory/claim', { workerId: this.workerId }, signal);
      object(claimed, ['task']);
      if (claimed.task === null) {
        await this.onStatus({ state: 'idle', role: this.role, workerId: this.workerId });
        return { state: 'idle' };
      }
      if (containsCredential(JSON.stringify(claimed.task)) || JSON.stringify(claimed.task).includes(this.token)) {
        throw new StudioError('WORKER_SCOPE_DENIED', 'Credentials cannot be passed into task or model context.', 409);
      }
      task = await this.validateTask(claimed.task, { role: this.role, workspace: this.workspace, configuration: this.configuration });
      taskController = new AbortController();
      const combined = AbortSignal.any([signal, taskController.signal, AbortSignal.timeout(task.timeoutMs)]);
      const prefix = `/api/factory/tasks/${task.assignment.id}`;
      const authorize = async () => {
        combined.throwIfAborted();
        try {
          const check = await this.request(`${prefix}/check`, { lease: task.lease }, combined);
          if (check.active !== true) throw new StudioError('WORKER_PROTOCOL', 'The controller did not affirm this active task lease.', 409);
        } catch (error) { taskController.abort(error); throw error; }
      };
      await authorize();
      await this.onStatus({ state: 'running', role: this.role, workerId: this.workerId, assignmentId: task.assignment.id });
      heartbeat = (async () => {
        try {
          while (!heartbeatStop.signal.aborted && !combined.aborted) {
            await this.sleep(this.heartbeatMs, AbortSignal.any([heartbeatStop.signal, combined]));
            await authorize();
            await this.onStatus({ state: 'running', role: this.role, workerId: this.workerId, assignmentId: task.assignment.id });
          }
        } catch (error) {
          if (!heartbeatStop.signal.aborted) { failure ??= error; taskController.abort(error); }
        }
      })();
      try {
        resource = await this.createRunner(task);
        combined.throwIfAborted();
        const runner = resource.runner ?? resource;
        if (typeof runner.execute !== 'function') throw new StudioError('WORKER_CONFIGURATION', 'The task runner does not implement execute.');
        outcome = await runner.execute(this.role, {
          ...task, signal: combined, authorize,
          observe: async (type, details) => {
            combined.throwIfAborted();
            if (!observationFields[type]) throw new StudioError('WORKER_PROTOCOL', 'Only minimized role/tool provenance is durable; raw model output is not history.');
            object(details, observationFields[type]);
            if (containsCredential(JSON.stringify(details)) || JSON.stringify(details).includes(this.token)) throw new StudioError('WORKER_PROTOCOL', 'Credential material cannot enter worker observations.');
            try {
              const result = await this.request(`${prefix}/observe`, { lease: task.lease, type, details }, combined);
              if (result.recorded !== true) throw new StudioError('WORKER_PROTOCOL', 'The controller did not acknowledge the observation.');
            } catch (error) { taskController.abort(error); throw error; }
          },
          output: () => {},
        });
        combined.throwIfAborted();
      } catch (error) { failure ??= error; }
      finally {
        heartbeatStop.abort();
        await heartbeat;
        try {
          if (resource?.close) await resource.close();
          else await (resource?.runner ?? resource)?.stop?.();
        } catch (cleanup) { failure = failure ? new AggregateError([failure, cleanup], 'Task execution and cleanup failed.') : cleanup; }
      }
      if (combined.aborted || terminal(failure)) throw failure ?? combined.reason;
      if (!failure) {
        object(outcome, ['result', 'usage', 'sessionId']);
        if (!outcome.result || !outcome.usage || typeof outcome.sessionId !== 'string') throw new StudioError('WORKER_PROTOCOL', 'A complete task result, usage report and session identity are required.');
      }
      await authorize();
      const result = await this.request(`${prefix}/complete`, {
        lease: task.lease, outcome: failure ? null : outcome, error: failure ? sanitizeRuntimeError(failure, [this.token]) : null,
      }, combined);
      if (result.recorded !== true) throw new StudioError('WORKER_PROTOCOL', 'Completion was not acknowledged; its effect is uncertain and will not be replayed.');
      if (failure) throw failure;
      await this.onStatus({ state: 'idle', role: this.role, workerId: this.workerId });
      return { state: 'complete', assignmentId: task.assignment.id };
    } finally {
      heartbeatStop.abort();
      await heartbeat;
      this.busy = false;
    }
  }

  async run({ signal, maximumMillis = 3_600_000, maximumClaims = 64, maximumIdleClaims = 12, idleMillis = 5000 } = {}) {
    for (const [value, maximum] of [[maximumMillis, 3_600_000], [maximumClaims, 1000], [maximumIdleClaims, 120], [idleMillis, 60_000]]) {
      if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new StudioError('WORKER_CONFIGURATION', 'Configure explicit finite worker polling and lifetime bounds.');
    }
    const combined = AbortSignal.any([this.controller.signal, ...(signal ? [signal] : []), AbortSignal.timeout(maximumMillis)]);
    let idle = 0, completed = 0, claims = 0;
    while (claims < maximumClaims && idle < maximumIdleClaims) {
      combined.throwIfAborted();
      const result = await this.runOnce(combined);
      claims += 1;
      if (result.state === 'idle') idle += 1;
      else { completed += 1; idle = 0; }
      if (claims < maximumClaims && idle < maximumIdleClaims) await this.sleep(idleMillis, combined);
    }
    return { state: idle >= maximumIdleClaims ? 'idle-window-ended' : 'claim-window-ended', claims, completed };
  }

  stop() { this.controller.abort(new StudioError('WORKER_STOPPED', 'Worker stopped; no lease or inference is continued.', 409)); }
}

export const workerHealthFile = '/tmp/adhd-worker-health/health.json';

export async function writeWorkerHealth(path, state, { fsApi = filesystem, now = Date.now(), expiresMs = 30_000, pid = process.pid } = {}) {
  const directory = dirname(path);
  try { await fsApi.mkdir(directory, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const info = await fsApi.lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || await fsApi.realpath(directory) !== directory
    || (process.platform !== 'win32' && (info.uid !== process.getuid() || (info.mode & 0o077)))) {
    throw new StudioError('WORKER_HEALTH_DENIED', 'Worker transport health needs a private, unlinked ephemeral directory.');
  }
  const pending = join(directory, `.health-${randomUUID()}`);
  try {
    await fsApi.writeFile(pending, JSON.stringify({ version: 1, ...state, pid, updatedAt: now, expiresAt: now + expiresMs }), { flag: 'wx', mode: 0o600 });
    await fsApi.rename(pending, path);
  } finally { await fsApi.rm(pending, { force: true }); }
}

export async function main(args = process.argv.slice(2), env = process.env) {
  if (args.length) throw new StudioError('INVALID_ARGUMENTS', 'Worker configuration and credentials are runtime environment/file inputs only.');
  const root = await bootstrapAciRoot(env);
  if (root.bootstrapped) { process.exitCode = root.code; return root; }
  const configuration = await readRuntimeConfiguration(env);
  if (configuration.blueprint.deployment?.topology !== 'distributed' || !factoryRoles.includes(env.STUDIO_WORKER_ROLE)) {
    throw new StudioError('WORKER_CONFIGURATION', 'Worker startup requires a configured distributed deployment and exact role.');
  }
  const token = runtimeToken(await readProtectedFile(env.STUDIO_WORKER_TOKEN_FILE, { workspace: env.STUDIO_WORKSPACE }), 'Worker authentication');
  const heartbeatMs = integerEnvironment(env, 'STUDIO_WORKER_HEARTBEAT_MS', 5000, 1000, 60_000);
  const idleMillis = integerEnvironment(env, 'STUDIO_WORKER_IDLE_MS', 5000, 1000, 60_000);
  const worker = new FactoryWorker({
    role: env.STUDIO_WORKER_ROLE, workspace: env.STUDIO_WORKSPACE, origin: env.STUDIO_CONTROLLER_ORIGIN, token, configuration, heartbeatMs,
    onStatus: (state) => writeWorkerHealth(workerHealthFile, state, { expiresMs: Math.max(heartbeatMs, idleMillis) * 3 + 10_000 }),
    createRunner: async () => {
      const secrets = await readRuntimeSecrets(env, configuration, { worker: true });
      const directory = await createSdkDirectory();
      let client;
      try {
        client = await createRuntimeClient({ configuration, secrets, env, baseDirectory: directory.directory });
        const { FactoryRunner } = await import('./factory-runner.mjs');
        const runner = new FactoryRunner({ client });
        return {
          runner,
          async close() {
            const outcomes = await Promise.allSettled([runner.stop(), client.stop()]);
            await directory.close();
            const errors = outcomes.filter((result) => result.status === 'rejected').map((result) => result.reason);
            if (errors.length) throw new AggregateError(errors, 'Worker SDK cleanup failed.');
          },
        };
      } catch (error) {
        const outcomes = await Promise.allSettled([client?.stop(), directory.close()]);
        const failures = outcomes.filter((result) => result.status === 'rejected').map((result) => result.reason);
        if (failures.length) throw new AggregateError([error, ...failures], 'Worker initialization and cleanup failed.');
        throw error;
      }
    },
  });
  const stop = () => worker.stop();
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  try {
    return await worker.run({
      maximumMillis: integerEnvironment(env, 'STUDIO_WORKER_MAX_SECONDS', 3600, 1, 3600) * 1000,
      maximumClaims: integerEnvironment(env, 'STUDIO_WORKER_MAX_CLAIMS', 64, 1, 1000),
      maximumIdleClaims: integerEnvironment(env, 'STUDIO_WORKER_MAX_IDLE_CLAIMS', 12, 1, 120), idleMillis,
    });
  } finally {
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
    await writeWorkerHealth(workerHealthFile, { state: 'stopped', role: worker.role, workerId: worker.workerId }, { expiresMs: 0 });
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().then((result) => console.log(`Worker bounded window ended: ${result.state ?? result.code}; no implicit next assignment.`),
    (error) => { console.error(sanitizeRuntimeError(error)); process.exitCode = 1; });
}
