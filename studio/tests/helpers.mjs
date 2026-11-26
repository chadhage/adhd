import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { command } from '../repository.mjs';
import { Studio } from '../engine.mjs';
import { FactoryController } from '../factory-controller.mjs';
import { factoryRoles } from '../factory-contracts.mjs';

export const blueprint = {
  path: 'local', name: 'Fixture product', goal: 'Write smoke.txt with studio-ready',
  factories: [{ id: 'f1', name: 'Fixture Factory', squads: [{ id: 's1', name: 'Fixture Squad', members: '1' }] }],
};
export const review = { scope: blueprint.goal, budget: 30, maxSeconds: 120, write: true, verify: true, share: true, model: 'auto', factoryId: 'f1', squadId: 's1' };

export class FixtureRunner {
  constructor({ blocked = false, failure = false } = {}) {
    this.blocked = blocked;
    this.failure = failure;
    this.calls = [];
  }
  async inspect() { return { authenticated: !this.blocked, models: [{ id: 'auto', name: 'Fixture routing entry (not live inference)' }], inference: 'test fixture, not live inference' }; }
  async execute(role, context) {
    this.calls.push(role);
    context.signal.throwIfAborted();
    if (this.failure) throw new Error('Injected provider failure');
    await context.observe('session.started', { role, sessionId: randomUUID() });
    await context.observe('assignment.accepted', { role });
    if (role === 'VOC') await context.observe('register_intake', { role });
    if (role === 'Fullstacker') await writeFile(join(context.run.directory, 'smoke.txt'), 'studio-ready\n');
  }
  async stop() {}
}

export async function fixture(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'adhd-studio-test-'));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }));
  for (const args of [
    ['init', '-b', 'main'], ['config', 'user.name', 'Studio test fixture'],
    ['config', 'user.email', 'studio-fixture@example.invalid'],
    ['config', 'core.autocrlf', 'false'],
  ]) {
    const result = await command('git', args, root);
    if (result.code !== 0) throw new Error(result.output);
  }
  await writeFile(join(root, 'acceptance.test.mjs'), "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { readFileSync } from 'node:fs';\ntest('the requested output exists', () => assert.equal(readFileSync('smoke.txt', 'utf8'), 'studio-ready\\n'));\n");
  await command('git', ['add', '.'], root);
  await command('git', ['commit', '-m', 'Initialize isolated Studio fixture'], root);
  const runner = options.runner ?? new FixtureRunner();
  const studio = await new Studio({
    workspace: root, runner, mode: options.mode ?? 'local',
    verification: { command: process.execPath, args: ['--test', 'acceptance.test.mjs'] },
  }).initialize();
  t.after(() => studio.close());
  const initial = await studio.snapshot();
  await studio.saveBlueprint({ blueprint: { ...blueprint, path: options.mode ?? 'local' }, revision: initial.revision });
  return { root, runner, studio };
}

export async function waitFor(studio, predicate, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, state) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      studio.off('state', changed);
      if (error) reject(error);
      else resolve(state);
    };
    const timeout = setTimeout(async () => {
      try {
        const state = await studio.snapshot();
        const active = state.factory?.tasks.filter((task) => ['queued', 'running'].includes(task.status)).map((task) => `${task.role}/${task.kind}`).join(', ');
        finish(new Error(`Fixture did not reach the expected state: ${state.factory?.status ?? state.runs.at(-1)?.status}; phase=${state.factory?.current?.phase ?? 'none'}; active=${active ?? 'none'}; ${state.factory?.reason ?? state.runs.at(-1)?.error ?? 'no recorded error'}.`));
      } catch (error) { finish(error); }
    }, timeoutMs);
    const changed = (state) => {
      if (predicate(state)) finish(null, state);
    };
    studio.on('state', changed);
    studio.snapshot().then(changed, (error) => finish(error));
  });
}

export async function stored(root) {
  return JSON.parse(await readFile(join(root, '.adhd', 'studio', 'records.json'), 'utf8'));
}

export const factoryDeployment = {
  version: 1, target: 'docker', topology: 'single', startup: 'studio', humanMode: 'on-loop',
  toolchains: ['node', 'dotnet', 'python', 'java', 'go', 'native', 'infrastructure'],
  factoryCloud: 'local', productCloud: 'council', redundancy: null,
  identity: 'runtime-secrets', persistence: 'volume',
  resources: { cpu: 2, memoryMiB: 4096 },
};
export const factoryMandate = {
  maxCredits: 3000, creditsPerTask: 30, maxCycles: 3, maxParallel: 12,
  taskSeconds: 120, expiresAt: '2099-01-01T00:00:00.000Z',
  maxRetries: 1, resumeOnRestart: true,
  actions: ['technical-decisions', 'replenish', 'generate', 'verify', 'integrate'],
  writePaths: ['.'], model: 'auto', cost: null,
};
export const factorySecret = 'isolated-fixture-owner-secret-not-a-real-credential';

export class FactoryFixtureRunner {
  constructor({ block = false, unknownUsage = false, noNext = false } = {}) {
    this.block = block;
    this.unknownUsage = unknownUsage;
    this.noNext = noNext;
    this.calls = [];
    this.wave = new Map();
    this.maximumOverlap = 0;
    this.active = 0;
  }
  async execute(role, context) {
    this.calls.push({ role, kind: context.assignment.kind, id: context.assignment.id });
    const sessionId = randomUUID();
    await context.observe('session.started', { sessionId });
    await context.observe('assignment.accepted', {});
    const concurrent = ['delivery', 'replenishment-and-assurance'].includes(context.assignment.kind);
    let abort;
    if (concurrent) {
      this.active += 1;
      this.maximumOverlap = Math.max(this.active, this.maximumOverlap);
      let wave = this.wave.get(context.run.id);
      if (!wave) {
        let resolve;
        wave = { roles: new Set(), promise: new Promise((done) => { resolve = done; }), resolve };
        this.wave.set(context.run.id, wave);
      }
      wave.roles.add(role);
      if (wave.roles.size === factoryRoles.length) wave.resolve();
      await Promise.race([wave.promise, new Promise((resolve, reject) => {
        abort = () => reject(context.signal.reason);
        context.signal.addEventListener('abort', abort, { once: true });
        if (context.signal.aborted) abort();
      })]);
    }
    try {
      if (role === 'Fullstacker' && context.assignment.writable) {
        if (this.block) await new Promise((resolve, reject) => {
          context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true });
          if (context.signal.aborted) reject(context.signal.reason);
        });
        const version = context.evidence.completed.length + 1;
        await writeFile(join(context.run.directory, 'product.mjs'), `export const version = ${version};\nexport const greet = () => 'Hello from increment ${version}';\n`);
      }
      await context.observe('tool.completed', { tool: 'fixture_observed_work', toolCallId: randomUUID() });
      return {
        sessionId, usage: { reportedAiCredits: this.unknownUsage ? null : 0.02, incomplete: this.unknownUsage },
        result: {
          summary: `Isolated fixture ${role} ${context.assignment.kind}; not live AI evidence.`,
          decision: 'continue', sources: [context.requiredSource ?? context.sourceIds[0]],
          nextScope: context.assignment.kind === 'outcome-learning' && !this.noNext ? 'Improve the verified product with another observable greeting version' : null,
        },
      };
    } finally {
      if (concurrent) this.active -= 1;
      if (abort) context.signal.removeEventListener('abort', abort);
    }
  }
  async stop() {}
}

export const fixtureExecutor = {
  async inspect() { return { kind: 'explicit isolated-test fixture execution, not production sandbox proof' }; },
  async execute({ directory, verification, signal }) {
    return command(verification.command, verification.args, directory, {
      signal, env: Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'TEMP', 'TMP', 'PATHEXT'].filter((key) => process.env[key]).map((key) => [key, process.env[key]])),
    });
  },
};

export async function factoryFixture(t, { runner = new FactoryFixtureRunner(), policy = factoryMandate, humanMode = 'on-loop', execution = 'local' } = {}) {
  const { studio, root } = await fixture(t);
  await writeFile(join(root, 'acceptance.test.mjs'), "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { version, greet } from './product.mjs';\ntest('runnable product matches its declared increment', () => { assert.ok(version >= 1); assert.equal(greet(), `Hello from increment ${version}`); });\n");
  await command('git', ['add', 'acceptance.test.mjs'], root);
  await command('git', ['commit', '-m', 'Define isolated Factory acceptance criteria'], root);
  await studio.saveBlueprint({ blueprint: { ...blueprint, goal: 'Build a runnable greeting module and increment it from observed outcomes', deployment: { ...factoryDeployment, humanMode, productCloud: 'local', redundancy: 1 } }, revision: (await studio.snapshot()).revision });
  const controller = await new FactoryController(studio, { secret: factorySecret, runner, execution, executor: fixtureExecutor, observer: null }).initialize();
  studio.factory = controller;
  await controller.authorize({ mandate: policy, revision: (await studio.snapshot()).revision });
  return { studio, root, controller, runner };
}
