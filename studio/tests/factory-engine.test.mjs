import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { FactoryController } from '../factory-controller.mjs';
import { Studio } from '../engine.mjs';
import { command } from '../repository.mjs';
import { FactoryFixtureRunner, factoryFixture, factoryMandate as mandate, factorySecret as secret, fixtureExecutor, FixtureRunner, waitFor as watchState } from './helpers.mjs';

const waitFor = (studio, predicate) => watchState(studio, predicate, 120_000);

test('positive: one mandate produces a working product and two continuations with nine independent concurrent roles', async (t) => {
  const { studio, controller, runner, root } = await factoryFixture(t);
  await controller.start();
  const state = await waitFor(studio, (current) => current.factory?.status === 'checkpoint');
  assert.equal(state.factory.cycles.length, 3);
  assert.equal(runner.maximumOverlap, 9);
  assert.equal(new Set(state.factory.tasks.map((task) => task.sessionId)).size, state.factory.tasks.length);
  assert.equal(state.factory.accounting.reservedCredits, 0);
  assert.equal(state.completed.filter((entry) => entry.factoryId).length, 3);
  assert.equal(state.factory.tasks.filter((task) => task.kind === 'outcome-learning').length, 2);
  assert.match(await readFile(join(root, 'product.mjs'), 'utf8'), /version = 3/);
  assert.equal((await command(process.execPath, ['--test', 'acceptance.test.mjs'], root)).code, 0);
  const log = await command('git', ['log', '--format=%s'], root);
  assert.equal(log.output.split('\n').filter((line) => line.startsWith('Integrate Studio card')).length, 3);
});

test('negative: unknown billing consumes escrow and blocks an unfunded concurrent wave before any partial delivery', async (t) => {
  const runner = new FactoryFixtureRunner({ unknownUsage: true });
  const { studio, controller } = await factoryFixture(t, { runner, policy: { ...mandate, maxCredits: 270 } });
  await controller.start();
  const state = await waitFor(studio, (current) => current.factory?.status === 'restricted');
  assert.match(state.factory.reason, /credit escrow/);
  assert.equal(runner.calls.filter((call) => call.kind === 'delivery').length, 0);
  assert.equal(state.factory.accounting.chargedCredits, 150);
  assert.equal(state.factory.accounting.incomplete, true);
  assert.equal(state.factory.cycles.length, 0);
});

test('negative: a stored approval or edited accounting state cannot manufacture authority', async (t) => {
  const { studio, controller, runner } = await factoryFixture(t);
  await studio.records.update((data) => { data.factory.mandate.maxCycles = 100; });
  await assert.rejects(controller.start(), /could not be verified/);
  assert.equal(runner.calls.length, 0);
});

test('negative: absent VOC evidence does not invent another card or shut down the unresolved Factory', async (t) => {
  const { studio, controller } = await factoryFixture(t, { runner: new FactoryFixtureRunner({ noNext: true }) });
  await controller.start();
  const state = await waitFor(studio, (current) => current.factory?.status === 'restricted');
  assert.equal(state.factory.cycles.length, 1);
  assert.match(state.factory.reason, /no demand or continuation was invented/);
  assert.ok(state.factory.current);
});

test('positive: human-in-the-loop gates remain explicit while reusing completed readiness and generation', async (t) => {
  const { studio, controller, runner } = await factoryFixture(t, { policy: { ...mandate, maxCycles: 1 }, humanMode: 'in-loop' });
  await controller.start();
  await waitFor(studio, (current) => current.factory?.current?.pendingGate === 'deliver');
  await controller.loop;
  await controller.control('resume');
  await waitFor(studio, (current) => current.factory?.current?.pendingGate === 'verify');
  await controller.loop;
  await controller.control('resume');
  await waitFor(studio, (current) => current.factory?.current?.pendingGate === 'integrate');
  await controller.loop;
  await controller.control('resume');
  const state = await waitFor(studio, (current) => current.factory?.status === 'checkpoint');
  assert.equal(state.factory.cycles.length, 1);
  assert.equal(runner.calls.filter((call) => call.kind === 'delivery').length, 1);
});

test('negative: owner revocation aborts ongoing work and prevents automatic restart', async (t) => {
  const { studio, controller } = await factoryFixture(t, { runner: new FactoryFixtureRunner({ block: true }) });
  await controller.start();
  await waitFor(studio, (current) => current.factory?.tasks.filter((task) => task.kind === 'delivery' && task.acceptedAt).length === 1);
  await controller.control('revoke');
  assert.equal((await studio.snapshot()).factory.status, 'revoked');
  await assert.rejects(controller.start(), /revoked/);
  assert.equal((await studio.snapshot()).factory.cycles.length, 0);
});

test('positive: restart preserves the same identity, readiness, failed reservation and Git worktree', async (t) => {
  let resumed;
  t.after(() => resumed?.close());
  const { studio, controller, root } = await factoryFixture(t, { runner: new FactoryFixtureRunner({ block: true }), policy: { ...mandate, maxCycles: 1 } });
  await controller.start();
  await waitFor(studio, (current) => current.factory?.tasks.some((task) => task.kind === 'delivery' && task.acceptedAt));
  const original = (await studio.snapshot()).factory;
  await studio.close();
  resumed = await new Studio({ workspace: root, runner: new FixtureRunner(), verification: { command: process.execPath, args: ['--test', 'acceptance.test.mjs'] } }).initialize();
  const runner = new FactoryFixtureRunner();
  resumed.factory = await new FactoryController(resumed, { secret, runner, executor: fixtureExecutor, observer: null }).initialize();
  await resumed.factory.start();
  const state = await waitFor(resumed, (current) => current.factory?.status === 'checkpoint');
  assert.equal(state.factory.id, original.id);
  assert.equal(state.factory.cycles[0].run.id, original.current.run.id);
  assert.equal(runner.calls.filter((call) => call.kind === 'readiness').length, 0);
  assert.equal(state.factory.restarts, 1);
  assert.ok(state.factory.tasks.some((task) => task.status === 'failed'));
});
