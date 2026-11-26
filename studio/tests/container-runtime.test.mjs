import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import * as filesystem from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  bootstrapAciRoot, createRuntimeClient, prepareWorkspace, readProtectedFile, readRuntimeConfiguration,
  readRuntimeSecrets, sdkEnvironment, startContainer, validateRuntimeConfiguration,
} from '../container.mjs';
import { launchRuntime } from '../launch.mjs';
import { FactoryWorker, validateWorkerTask } from '../worker.mjs';
import { checkHealth } from '../healthcheck.mjs';
import { loadOperations, operationEnvironment } from '../operations.mjs';

const ownerToken = `owner-fixture-${'a'.repeat(32)}`;
const copilotToken = `provider-fixture-${'b'.repeat(32)}`;
const workerToken = `role-fixture-${'c'.repeat(32)}`;
const deployment = {
  version: 1, target: 'docker', topology: 'distributed', startup: 'studio', humanMode: 'in-loop',
  toolchains: ['node'], factoryCloud: 'local', productCloud: 'local', redundancy: 1,
  identity: 'runtime-secrets', persistence: 'volume', resources: { cpu: 1, memoryMiB: 1024 },
};
const configuration = {
  version: 1, bindingKey: 'offline-runtime-fixture',
  blueprint: {
    path: 'self-hosted', name: 'Offline fixture', goal: 'Exercise runtime boundaries without inference',
    factories: [{ id: 'factory', name: 'Fixture', squads: [{ id: 'squad', name: 'Fixture', members: '1' }] }],
    deployment,
  },
  verification: { command: 'node', args: ['--test', 'acceptance.test.mjs'] },
};
const json = (value) => Buffer.from(JSON.stringify(value));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const environment = () => ({
  STUDIO_CONFIG_FILE: resolve('offline-runtime.json'), STUDIO_WORKSPACE: resolve('offline-product'),
  STUDIO_TOKEN_FILE: resolve('offline-owner.token'), STUDIO_COPILOT_TOKEN_FILE: resolve('offline-copilot.token'),
  STUDIO_CERT_FILE: resolve('offline-tls.crt'), STUDIO_KEY_FILE: resolve('offline-tls.key'), STUDIO_LEASE_FD: '9',
});
const filesFor = (env, config = configuration) => new Map([
  [env.STUDIO_CONFIG_FILE, json(config)], [env.STUDIO_TOKEN_FILE, Buffer.from(ownerToken)],
  [env.STUDIO_COPILOT_TOKEN_FILE, Buffer.from(copilotToken)],
  [env.STUDIO_CERT_FILE, Buffer.from('offline certificate fixture')], [env.STUDIO_KEY_FILE, Buffer.from('offline key fixture')],
]);
const readMap = (files) => async (path, { optional } = {}) => {
  if (path === undefined && optional) return null;
  if (!files.has(path)) throw Object.assign(new Error('Missing fixture file'), { code: 'ENOENT' });
  const bytes = files.get(path);
  return optional && !bytes.toString('utf8').trim() ? null : bytes;
};
async function localFixture(t) {
  const root = resolve(`.container-runtime-fixture-${randomUUID()}`);
  await filesystem.mkdir(root);
  t.after(() => filesystem.rm(root, { recursive: true, force: true }));
  return root;
}
function childFixture() {
  const child = new EventEmitter();
  child.kill = () => true;
  setImmediate(() => child.emit('close', 0, null));
  return child;
}
function claimedTask() {
  return {
    factoryId: randomUUID(), lease: randomUUID(),
    assignment: { id: randomUUID(), role: 'Fullstacker', writable: true, deadline: '2099-01-01T00:00:00Z', reservedCredits: 30 },
    run: { id: randomUUID(), directory: resolve('controller-supplied-untrusted-directory') },
    scope: 'Offline protocol fixture', sourceIds: ['source-fixture'], requiredSource: null,
    protectedPaths: ['acceptance.test.mjs'], writePaths: ['src'], allowedToolchains: ['node'],
    model: 'fixture-not-an-inference-model', credits: 30, timeoutMs: 1000,
    memoryBinding: {}, limits: {}, deployment, evidence: {}, commandNames: [],
  };
}
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

test('negative: runtime configuration and protected file secrets fail closed without implicit credentials or persistence', async (t) => {
  const env = environment();
  const files = filesFor(env);
  assert.equal((await readRuntimeConfiguration(env, { readFileFn: readMap(files) })).bindingKey, configuration.bindingKey);
  assert.throws(() => validateRuntimeConfiguration({ ...configuration, token: ownerToken }), /invalid shape/);
  await assert.rejects(readRuntimeConfiguration({ ...env, STUDIO_STORE_KEY: 'other-product' }, { readFileFn: readMap(files) }), { code: 'PRODUCT_BINDING_MISMATCH' });
  await assert.rejects(readRuntimeConfiguration({ ...env, NODE_TLS_REJECT_UNAUTHORIZED: '0' }, { readFileFn: readMap(files) }), { code: 'TLS_REQUIRED' });
  env.STUDIO_DATABASE_URL_FILE = resolve('offline-database.url');
  env.STUDIO_EXECUTOR_TOKEN_FILE = resolve('offline-executor.token');
  env.STUDIO_MANDATE_FILE = resolve('offline-approved-mandate.json');
  for (const name of ['STUDIO_DATABASE_URL_FILE', 'STUDIO_EXECUTOR_TOKEN_FILE', 'STUDIO_MANDATE_FILE']) files.set(env[name], Buffer.from(' \n'));
  const secrets = await readRuntimeSecrets(env, configuration, { readFileFn: readMap(files) });
  assert.equal(secrets.databaseUrl, null);
  assert.equal(secrets.executorToken, null);
  assert.equal(secrets.mandate, null);
  files.set(env.STUDIO_COPILOT_TOKEN_FILE, Buffer.from(''));
  await assert.rejects(readRuntimeSecrets(env, configuration, { readFileFn: readMap(files) }), { code: 'AUTH_CONFIGURATION' });

  const root = await localFixture(t);
  const product = join(root, 'product');
  await filesystem.mkdir(product);
  const secret = join(root, 'runtime.token');
  await filesystem.writeFile(secret, workerToken, { mode: 0o600 });
  assert.equal((await readProtectedFile(secret, { workspace: product })).toString('utf8'), workerToken);
  await assert.rejects(readProtectedFile(join(product, 'runtime.token'), { workspace: product }), { code: 'SECRET_IN_PRODUCT' });
  const unsafeFile = {
    ...filesystem,
    lstat: async (path) => {
      const stat = await filesystem.lstat(path);
      stat.mode = 0o100644; stat.uid = 1000; stat.gid = 1000;
      return stat;
    },
  };
  await assert.rejects(readProtectedFile(secret, { workspace: product, fsApi: unsafeFile, platform: 'linux', uid: 1000, gid: 1000 }), { code: 'SECRET_PERMISSIONS' });
  let readOnly = true;
  const info = {
    mode: 0o100444, uid: 0, gid: 0, nlink: 1, ino: 1, dev: 1, size: workerToken.length, mtimeMs: 1,
    isFile: () => true, isSymbolicLink: () => false,
  };
  const projected = {
    realpath: async (path) => path,
    lstat: async () => info,
    readFile: async () => `1 0 0:1 / / rw - overlay overlay rw\n2 1 0:2 / /run/studio ${readOnly ? 'ro' : 'rw'} - tmpfs tmpfs ${readOnly ? 'ro' : 'rw'}\n`,
    open: async () => ({ stat: async () => info, readFile: async () => Buffer.from(workerToken), close: async () => {} }),
  };
  assert.equal((await readProtectedFile('/run/studio/service.token', {
    workspace: '/workspace/product', fsApi: projected, platform: 'linux', uid: 1000, gid: 1000,
  })).toString('utf8'), workerToken);
  readOnly = false;
  await assert.rejects(readProtectedFile('/run/studio/service.token', {
    workspace: '/workspace/product', fsApi: projected, platform: 'linux', uid: 1000, gid: 1000,
  }), { code: 'SECRET_PERMISSIONS' });
});

test('negative: SDK clients receive file-only authentication and an empty environment, never ambient authority or a TLS downgrade', async () => {
  const constructed = [];
  const sdk = {
    RuntimeConnection: { forStdio: () => ({ kind: 'stdio' }), forUri: (url, options) => ({ kind: 'uri', url, ...options }) },
    CopilotClient: class { constructor(options) { constructed.push(options); } },
  };
  const env = { ...environment(), PATH: '/approved/bin', HOME: '/credentialed-home', STUDIO_OWNER_SECRET: ownerToken,
    GITHUB_TOKEN: 'ambient-provider-token', AWS_SECRET_ACCESS_KEY: 'ambient-cloud-secret', NODE_OPTIONS: '--require untrusted.cjs',
    COPILOT_CLI_URL: 'http://ambient-runtime.example:9000', STUDIO_COPILOT_RUNTIME_URL: 'http://not-selected.example:9000' };
  const clean = sdkEnvironment(env, { home: resolve('offline-sdk') });
  assert.equal(clean.STUDIO_OWNER_SECRET, undefined);
  assert.equal(clean.GITHUB_TOKEN, undefined);
  assert.equal(clean.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(clean.NODE_OPTIONS, undefined);
  await createRuntimeClient({ configuration, env, secrets: { copilotToken, caFile: null }, baseDirectory: resolve('offline-sdk'), sdk });
  assert.equal(constructed[0].gitHubToken, copilotToken);
  assert.equal(constructed[0].mode, 'empty');
  assert.equal(constructed[0].useLoggedInUser, false);
  assert.equal(constructed[0].connection.kind, 'stdio');
  assert.equal(constructed[0].env.STUDIO_OWNER_SECRET, undefined);
  const hosted = structuredClone(configuration);
  hosted.blueprint.deployment.identity = 'hosted-connector';
  const connectorEnv = { ...env, STUDIO_CONNECTOR_TOKEN_FILE: resolve('offline-connector.token') };
  const files = filesFor(connectorEnv, hosted);
  files.delete(connectorEnv.STUDIO_COPILOT_TOKEN_FILE);
  files.set(connectorEnv.STUDIO_CONNECTOR_TOKEN_FILE, Buffer.from(workerToken));
  const connectorSecrets = await readRuntimeSecrets(connectorEnv, hosted, { readFileFn: readMap(files) });
  assert.equal(connectorSecrets.connectorToken, workerToken);
  assert.equal(connectorSecrets.copilotToken, null);
  const options = { configuration: hosted, secrets: connectorSecrets, baseDirectory: resolve('offline-sdk'), sdk };
  await assert.rejects(createRuntimeClient({ ...options, env: { STUDIO_COPILOT_RUNTIME_URL: 'http://remote.example:9000' } }), { code: 'TLS_REQUIRED' });
  await assert.rejects(createRuntimeClient({ ...options, env: { STUDIO_COPILOT_RUNTIME_URL: 'https://remote.example:9000' } }), { code: 'CONNECTOR_TLS_UNSUPPORTED' });
  assert.equal(constructed.length, 1);
  await createRuntimeClient({ ...options, env: { STUDIO_COPILOT_RUNTIME_URL: 'http://127.0.0.1:9000' } });
  assert.equal(constructed[1].connection.connectionToken, workerToken);
  assert.equal(constructed[1].gitHubToken, undefined);
  assert.equal(constructed[1].useLoggedInUser, undefined);
});

test('positive: ACI root bootstrap copies only configured runtime files and demotes before starting a fresh Node process', async () => {
  const env = { ...environment(), STUDIO_ALLOW_ACI_ROOT_BOOTSTRAP: 'true', NODE_EXTRA_CA_CERTS: resolve('offline-ca.crt'), UNCONFIGURED_SECRET_FILE: '/never-read' };
  const aci = structuredClone(configuration);
  aci.blueprint.deployment.target = 'aci';
  const files = filesFor(env, aci);
  files.set(env.NODE_EXTRA_CA_CERTS, Buffer.from('offline CA fixture'));
  const calls = [], reads = [], copies = [];
  let uid = 0, gid = 0, spawned = 0;
  const processApi = Object.assign(new EventEmitter(), {
    platform: 'linux', execPath: process.execPath,
    getuid: () => uid, getgid: () => gid,
    setgroups: (groups) => calls.push(['groups', groups]),
    setgid: (value) => { calls.push(['gid', value]); gid = value; },
    setuid: (value) => { calls.push(['uid', value]); uid = value; },
  });
  const fsApi = {
    mkdir: async () => {}, chown: async () => {}, chmod: async (path, mode) => assert.equal(mode, 0o400), rm: async () => {},
    writeFile: async (path, bytes, options) => { copies.push({ path, bytes, options }); },
  };
  const readFileFn = async (path, options) => { reads.push(path); return readMap(files)(path, options); };
  const spawnFn = (executable, args, options) => {
    spawned += 1;
    assert.equal(uid, 1000); assert.equal(gid, 1000);
    assert.equal(executable, process.execPath);
    assert.equal(args.length, 1);
    assert.notEqual(options.env.NODE_EXTRA_CA_CERTS, env.NODE_EXTRA_CA_CERTS);
    assert.equal(options.env.STUDIO_ALLOW_ACI_ROOT_BOOTSTRAP, 'false');
    return childFixture();
  };
  assert.deepEqual(await bootstrapAciRoot(env, { processApi, fsApi, readFileFn, spawnFn }), { bootstrapped: true, code: 0 });
  assert.deepEqual(calls, [['groups', []], ['gid', 1000], ['uid', 1000]]);
  assert.equal(spawned, 1);
  assert.equal(reads.includes('/never-read'), false);
  assert.equal(copies.length, 6);
  assert.ok(copies.every(({ options }) => options.flag === 'wx' && options.mode === 0o400));
  uid = 0; gid = 0;
  await assert.rejects(bootstrapAciRoot({ ...env, STUDIO_ALLOW_ACI_ROOT_BOOTSTRAP: undefined }, { processApi, fsApi, readFileFn, spawnFn }), { code: 'ROOT_DENIED' });
  files.set(env.STUDIO_CONFIG_FILE, json(configuration));
  await assert.rejects(bootstrapAciRoot(env, { processApi, fsApi, readFileFn, spawnFn }), { code: 'ROOT_DENIED' });
  assert.equal(spawned, 1);
});

test('positive: volume launcher hands custody to child fd9, closes its copy and rejects redirected managed parents', async (t) => {
  const root = await localFixture(t);
  const env = { ...environment(), STUDIO_WORKSPACE: root };
  const processApi = Object.assign(new EventEmitter(), { execPath: process.execPath });
  let closed = 0, spawned = 0, stdio;
  const fsApi = {
    ...filesystem,
    open: async (path) => {
      const handle = await filesystem.open(path, 'a+');
      return { fd: handle.fd, stat: () => handle.stat(), close: async () => { closed += 1; await handle.close(); } };
    },
  };
  const dependencies = {
    fsApi, processApi, platform: 'linux', flags: { ...constants, O_NOFOLLOW: 0x20000 },
    readConfiguration: async () => configuration, prepare: async () => root,
    spawnFn: (executable, args, options) => { spawned += 1; stdio = options.stdio; assert.equal(options.env.STUDIO_LEASE_FD, '9'); return childFixture(); },
  };
  assert.deepEqual(await launchRuntime(env, dependencies), { code: 0 });
  assert.equal(spawned, 1);
  assert.equal(closed, 1);
  assert.equal(stdio.length, 10);
  assert.equal(typeof stdio[9], 'number');
  const redirected = {
    ...fsApi,
    lstat: async (path) => path === join(root, '.adhd') ? { isDirectory: () => true, isSymbolicLink: () => true } : filesystem.lstat(path),
  };
  await assert.rejects(launchRuntime(env, { ...dependencies, fsApi: redirected }), { code: 'MANAGED_PATH_DENIED' });
  assert.equal(spawned, 1);
  const nonempty = join(root, 'existing');
  await filesystem.mkdir(nonempty);
  await filesystem.writeFile(join(nonempty, 'existing.txt'), 'Existing work remains intact');
  let gitCalls = 0;
  await prepareWorkspace({ STUDIO_WORKSPACE: nonempty, STUDIO_BOOTSTRAP_EMPTY_PRODUCT: 'true' }, {
    framework: root, fsApi: { ...filesystem, realpath: async (path) => path === root ? resolve('separate-framework-fixture') : filesystem.realpath(path) },
    commandFn: async () => { gitCalls += 1; throw new Error('No Git initialization is allowed'); },
  });
  assert.equal(gitCalls, 0);
  assert.equal(await filesystem.readFile(join(nonempty, 'existing.txt'), 'utf8'), 'Existing work remains intact');
});

test('positive: workers derive their own registered worktree and never initialize inference while bounded idle polling', async (t) => {
  const root = await localFixture(t);
  const task = claimedTask();
  const directory = join(root, '.adhd', 'studio', 'worktrees', task.run.id);
  await filesystem.mkdir(directory, { recursive: true });
  await filesystem.mkdir(join(root, '.git'));
  const proofs = [];
  const commandFn = async (command, args, cwd) => {
    proofs.push({ command, args, cwd });
    return { code: 0, output: args.includes('--git-common-dir') ? join(root, '.git') : directory };
  };
  const validated = await validateWorkerTask(task, { workspace: root, role: 'Fullstacker', configuration, commandFn });
  assert.equal(validated.run.directory, directory);
  assert.ok(proofs.every(({ cwd }) => cwd !== task.run.directory));
  await assert.rejects(validateWorkerTask({ ...task, assignment: { ...task.assignment, role: 'VOC' } }, {
    workspace: root, role: 'Fullstacker', configuration, commandFn,
  }), { code: 'WORKER_SCOPE_DENIED' });
  await assert.rejects(validateWorkerTask({ ...task, assignment: { ...task.assignment, deadline: '2000-01-01T00:00:00Z' } }, {
    workspace: root, role: 'Fullstacker', configuration, commandFn,
  }), { code: 'WORKER_SCOPE_DENIED' });
  let claims = 0, sdk = 0;
  const worker = new FactoryWorker({
    role: 'Fullstacker', workspace: root, origin: 'https://controller.example', token: workerToken,
    createRunner: async () => { sdk += 1; throw new Error('Idle must not initialize the SDK'); },
    fetchFn: async (url, options) => {
      claims += 1; assert.ok(url.endsWith('/api/factory/claim'));
      assert.equal(options.headers.Authorization, `Bearer ${workerToken}`);
      assert.equal(options.redirect, 'error');
      return response({ task: null });
    },
    sleep: async () => {},
  });
  assert.deepEqual(await worker.run({ maximumIdleClaims: 3, maximumClaims: 5 }), { state: 'idle-window-ended', claims: 3, completed: 0 });
  assert.equal(claims, 3); assert.equal(sdk, 0);
});

test('positive: worker protocol rechecks custom tools, minimizes observations and completes only the exact accepted lease', async () => {
  const task = claimedTask(), requests = [];
  let initialized = 0, cleaned = 0, startedAfterCheck = false;
  const outcome = { result: { summary: 'Offline role result', decision: 'continue', sources: ['source-fixture'], nextScope: null }, usage: { reportedAiCredits: 0, incomplete: false }, sessionId: 'offline-session-fixture' };
  const worker = new FactoryWorker({
    role: 'Fullstacker', workspace: resolve('offline-product'), origin: 'https://controller.example', token: workerToken,
    validateTask: async (input) => input,
    fetchFn: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url, body, headers: options.headers });
      if (url.endsWith('/claim')) return response({ task });
      assert.equal(body.lease, task.lease);
      if (url.endsWith('/check')) { startedAfterCheck = true; return response({ active: true }); }
      return response({ recorded: true });
    },
    createRunner: async () => {
      initialized += 1; assert.equal(startedAfterCheck, true);
      return {
        runner: {
          execute: async (role, context) => {
            assert.equal(role, 'Fullstacker');
            await context.authorize();
            await context.observe('session.started', { sessionId: 'offline-session-fixture', definitionDigest: 'offline-definition-digest' });
            await context.observe('assignment.accepted', { definitionDigest: 'offline-definition-digest' });
            context.output(role, 'RAW_MODEL_OUTPUT_MUST_NOT_BE_DURABLE');
            return outcome;
          },
        },
        close: async () => { cleaned += 1; },
      };
    },
  });
  assert.deepEqual(await worker.runOnce(), { state: 'complete', assignmentId: task.assignment.id });
  assert.equal(initialized, 1); assert.equal(cleaned, 1);
  assert.ok(requests.filter(({ url }) => url.endsWith('/check')).length >= 3);
  assert.equal(requests.filter(({ url }) => url.endsWith('/complete')).length, 1);
  assert.deepEqual(requests.at(-1).body, { lease: task.lease, outcome, error: null });
  assert.equal(JSON.stringify(requests).includes('RAW_MODEL_OUTPUT_MUST_NOT_BE_DURABLE'), false);
  assert.ok(requests.every(({ url, headers }) => !url.includes('/api/state') && headers.Authorization === `Bearer ${workerToken}`));
});

test('negative: workers stop on revoked, denied or lost controller leases without retries or unauthorized completion', async () => {
  for (const status of [401, 403, 409]) {
    let requests = 0, initialized = 0;
    const worker = new FactoryWorker({
      role: 'VOC', workspace: resolve('offline-product'), origin: 'https://controller.example', token: workerToken,
      fetchFn: async () => { requests += 1; return response({ error: { message: 'Offline denied fixture' } }, status); },
      createRunner: async () => { initialized += 1; },
    });
    await assert.rejects(worker.run({ maximumClaims: 5 }), (error) => error.status === status);
    assert.equal(requests, 1); assert.equal(initialized, 0);
  }
  const task = claimedTask();
  let release, checks = 0, completions = 0, cleaned = 0;
  const worker = new FactoryWorker({
    role: 'Fullstacker', workspace: resolve('offline-product'), origin: 'https://controller.example', token: workerToken,
    validateTask: async (input) => input,
    sleep: async () => new Promise((resolveSleep) => { release = resolveSleep; }),
    fetchFn: async (url) => {
      if (url.endsWith('/claim')) return response({ task });
      if (url.endsWith('/check')) {
        checks += 1;
        return checks === 1 ? response({ active: true }) : response({ error: { message: 'Revoked lease fixture' } }, 409);
      }
      if (url.endsWith('/complete')) completions += 1;
      return response({ recorded: true });
    },
    createRunner: async () => ({
      runner: {
        execute: async (role, context) => {
          release();
          await new Promise((resolveExecution, reject) => context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true }));
        },
      },
      close: async () => { cleaned += 1; },
    }),
  });
  await assert.rejects(worker.runOnce(), (error) => error.status === 409);
  assert.equal(checks, 2); assert.equal(completions, 0); assert.equal(cleaned, 1);
  let lostCalls = 0;
  const disconnected = new FactoryWorker({
    role: 'VOC', workspace: resolve('offline-product'), origin: 'https://controller.example', token: workerToken,
    createRunner: async () => { throw new Error('Must not initialize'); },
    fetchFn: async () => { lostCalls += 1; throw new Error('Offline connection loss'); },
  });
  await assert.rejects(disconnected.run(), { code: 'CONTROLLER_LOST' });
  assert.equal(lostCalls, 1);
});

test('positive: reviewed operation adapters bind cost/head/artifact/policy and never replay an uncertain apply', async () => {
  const path = resolve('offline-reviewed-operations.json'), artifactFile = resolve('offline-reviewed-plan.bin'), script = resolve('offline-reviewed-adapter.mjs');
  const spec = { command: 'node', script, args: [], env: ['GH_TOKEN'] };
  const config = { version: 1, commands: {}, operations: { 'git-publish': { target: 'owner-reviewed-fixture-target', artifactFile, plan: spec, validate: spec, apply: spec } } };
  const files = new Map([[path, json(config)], [artifactFile, Buffer.from('offline immutable artifact')], [script, Buffer.from('offline reviewed code fixture')]]);
  const head = 'a'.repeat(40), cycleId = randomUUID();
  let applyCalls = 0, failApply = false, missingCost = false;
  const commandFn = async (program, envelope) => {
    const { phase, input } = envelope;
    if (phase === 'plan') return {
      code: 0, stdout: JSON.stringify({
        head: input.head, target: config.operations['git-publish'].target, artifactDigest: hash(files.get(artifactFile)),
        ...(missingCost ? {} : { maximumCost: 0 }), currency: 'USD', costSource: 'Explicit offline zero-cost fixture, not a real price',
      }),
    };
    if (phase === 'validate') return { code: 0, stdout: JSON.stringify({ valid: true, planDigest: input.digest }) };
    applyCalls += 1;
    if (failApply) throw new Error('Offline uncertain apply failure');
    return { code: 0, stdout: JSON.stringify({ success: true, planDigest: input.digest, receipt: 'Offline observed fixture only' }) };
  };
  const adapter = (await loadOperations(path, { workspace: resolve('offline-product'), readFileFn: readMap(files), commandFn })).operations['git-publish'];
  const plan = await adapter.plan({ head, cycleId });
  assert.equal(plan.maximumCost, 0);
  assert.equal(plan.head, head);
  assert.equal(plan.artifactDigest, hash(files.get(artifactFile)));
  assert.equal(plan.policyDigest, adapter.policyDigest);
  await assert.rejects(adapter.validate({ ...plan }), { code: 'PLAN_CHANGED' });
  assert.equal(await adapter.validate(plan), true);
  assert.equal((await adapter.apply(plan)).planDigest, plan.digest);
  await assert.rejects(adapter.apply(plan), { code: 'OPERATION_RECONCILIATION_REQUIRED' });
  assert.equal(applyCalls, 1);
  const uncertain = await adapter.plan({ head, cycleId });
  failApply = true;
  await assert.rejects(adapter.apply(uncertain), /Offline uncertain apply failure/);
  await assert.rejects(adapter.apply(uncertain), { code: 'OPERATION_RECONCILIATION_REQUIRED' });
  assert.equal(applyCalls, 2);
  missingCost = true;
  await assert.rejects(adapter.plan({ head, cycleId }), { code: 'UNVERIFIED_OPERATION_PLAN' });
  missingCost = false;
  const drift = await adapter.plan({ head, cycleId });
  files.set(artifactFile, Buffer.from('Changed artifact'));
  await assert.rejects(adapter.validate(drift), { code: 'PLAN_CHANGED' });
  files.set(script, Buffer.from('Changed reviewed code'));
  await assert.rejects(adapter.validate(drift), { code: 'OPERATION_POLICY_CHANGED' });
  const clean = operationEnvironment(spec, { GH_TOKEN: 'explicit-operation-fixture', STUDIO_TOKEN: ownerToken, COPILOT_SDK_AUTH_TOKEN: copilotToken, GITHUB_TOKEN: 'ambient-not-whitelisted' });
  assert.equal(clean.GH_TOKEN, 'explicit-operation-fixture');
  assert.equal(clean.STUDIO_TOKEN, undefined);
  assert.equal(clean.COPILOT_SDK_AUTH_TOKEN, undefined);
  assert.equal(clean.GITHUB_TOKEN, undefined);
  for (const unsafe of [{ ...spec, args: ['--force'] }, { ...spec, env: ['STUDIO_TOKEN'] }, { ...spec, command: 'bash' },
    { command: 'gh', args: ['auth', 'login'], env: [] }]) {
    files.set(path, json({ ...config, operations: { 'git-publish': { ...config.operations['git-publish'], apply: unsafe } } }));
    await assert.rejects(loadOperations(path, { workspace: resolve('offline-product'), readFileFn: readMap(files), commandFn }), { code: 'OPERATION_CONFIGURATION' });
  }
});

test('negative: container boot preserves existing blueprints and never treats automatic configuration or missing PostgreSQL credentials as authority', async () => {
  let clientCreates = 0, starts = 0, saves = 0, closed = 0;
  const env = environment();
  const automatic = structuredClone(configuration);
  automatic.blueprint.deployment.startup = 'automatic';
  let selected = automatic;
  const files = filesFor(env, automatic);
  class Engine {
    constructor() { this.runner = { stop: async () => {} }; }
    async initialize() { return this; }
    async snapshot() { return { revision: 'offline-revision', blueprint: selected.blueprint, factory: null }; }
    async saveBlueprint() { saves += 1; throw new Error('Existing blueprint cannot be overwritten'); }
    async close() { closed += 1; }
  }
  const dependencies = {
    readFileFn: readMap(files), leaseFn: async (workspace, fd) => { assert.equal(fd, '9'); return { close: async () => {} }; },
    createSdkDirectory: async () => ({ directory: resolve('offline-sdk'), close: async () => {} }),
    createClient: async () => { clientCreates += 1; return { stop: async () => {} }; },
    CopilotRunner: class {}, Studio: Engine, FactoryRunner: class {},
    loadOperations: async () => ({ commands: {}, operations: {} }),
    createStudioServer: async ({ studio }) => {
      studio.factory = { start: async () => { starts += 1; }, importMandate: async () => { throw new Error('No imported claim is authority'); } };
      return { close: () => studio.close() };
    },
  };
  await assert.rejects(startContainer(env, dependencies), { code: 'MANDATE_REQUIRED' });
  assert.equal(starts, 0); assert.equal(saves, 0); assert.equal(closed, 1);
  selected = structuredClone(configuration);
  selected.blueprint.goal = 'An existing changed product goal';
  files.set(env.STUDIO_CONFIG_FILE, json(configuration));
  await assert.rejects(startContainer(env, dependencies), { code: 'STALE_BLUEPRINT' });
  assert.equal(saves, 0);
  const postgres = structuredClone(configuration);
  postgres.blueprint.deployment.persistence = 'postgres';
  files.set(env.STUDIO_CONFIG_FILE, json(postgres));
  const before = clientCreates;
  await assert.rejects(startContainer(env, dependencies), { code: 'STORE_CONFIGURATION' });
  assert.equal(clientCreates, before);
});

test('negative: health probes report only responsive transport and reject stale or role-mismatched worker heartbeats', async () => {
  let probes = 0, reads = 0;
  const result = await checkHealth({ STUDIO_PROXY_ORIGIN: 'https://trusted-aca.example', STUDIO_TOKEN_FILE: '/never-read' }, {
    readFileFn: async () => { reads += 1; throw new Error('Health never reads owner credentials'); },
    requestFn: async ({ port, cert }) => { probes += 1; assert.equal(port, 4319); assert.equal(cert, undefined); return { status: 'responsive' }; },
  });
  assert.equal(result.status, 'responsive'); assert.equal(probes, 1); assert.equal(reads, 0);
  let health = { version: 1, role: 'VOC', state: 'idle', pid: 12345, updatedAt: 1000, expiresAt: 2000 };
  const dependencies = { readFileFn: async () => json(health), processApi: { kill: (pid, signal) => { assert.equal(pid, 12345); assert.equal(signal, 0); } }, now: 1500 };
  assert.equal((await checkHealth({ STUDIO_WORKER_ROLE: 'VOC' }, dependencies)).status, 'responsive');
  health = { ...health, expiresAt: 1499 };
  await assert.rejects(checkHealth({ STUDIO_WORKER_ROLE: 'VOC' }, dependencies), { code: 'HEALTH_UNAVAILABLE' });
  health = { ...health, expiresAt: 2000, role: 'Fullstacker' };
  await assert.rejects(checkHealth({ STUDIO_WORKER_ROLE: 'VOC' }, dependencies), { code: 'HEALTH_UNAVAILABLE' });
});
