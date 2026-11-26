import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { digest } from '../contracts.mjs';
import { fixture, FixtureRunner, review, stored, waitFor } from './helpers.mjs';

async function start(studio, request = review) {
  const state = await studio.snapshot();
  const ready = await studio.check({ review: request, blueprintDigest: digest(state.blueprint) });
  return { ready, state: await studio.start({ authorizationId: ready.authorizationId, idempotencyKey: randomUUID() }) };
}

test('positive: a real Git-backed candidate is not completed until verified and explicitly integrated', async (t) => {
  const { root, studio, runner } = await fixture(t);
  const { state } = await start(studio);
  const id = state.runs.at(-1).id;
  const generated = await waitFor(studio, (snapshot) => snapshot.runs.at(-1).status === 'review-required');
  assert.deepEqual(runner.calls, ['VOC', 'Factory', 'Squad', 'Fullstacker']);
  assert.equal(generated.completed.length, 0);
  assert.match(generated.runs.at(-1).diff, /studio-ready/);
  const verified = await studio.control(id, 'verify');
  assert.equal(verified.runs.at(-1).status, 'verified');
  assert.equal(verified.completed.length, 0);
  const accepted = await studio.control(id, 'accept');
  assert.equal(accepted.runs.at(-1).status, 'complete');
  assert.equal(accepted.completed.length, 1);
  assert.equal(await readFile(join(root, 'smoke.txt'), 'utf8'), 'studio-ready\n');
  assert.equal((await stored(root)).demands[0].custody, 'Acknowledged by VOC');
  studio.transient.clear();
  assert.match((await studio.snapshot()).runs.at(-1).diff, /studio-ready/);
});

test('negative: stale blueprint revisions and missing source access cannot authorize a run', async (t) => {
  const { studio } = await fixture(t);
  const state = await studio.snapshot();
  await assert.rejects(studio.saveBlueprint({ blueprint: state.blueprint, revision: 'sha256:stale' }), /Records changed/);
  await assert.rejects(studio.check({ review: { ...review, share: false }, blueprintDigest: digest(state.blueprint) }), /Authorize/);
  await assert.rejects(studio.start({ authorizationId: randomUUID(), idempotencyKey: randomUUID() }), /Check the current scope/);
});

test('negative: a disconnected provider remains blocked instead of returning successful demo readiness', async (t) => {
  const { studio } = await fixture(t, { runner: new FixtureRunner({ blocked: true }) });
  const state = await studio.snapshot();
  const result = await studio.check({ review, blueprintDigest: digest(state.blueprint) });
  assert.equal(result.ready, false);
  assert.equal(result.authorizationId, null);
});

test('negative: changed candidates and foreign product edits prevent integration', async (t) => {
  const { root, studio } = await fixture(t);
  const { state } = await start(studio);
  const id = state.runs.at(-1).id;
  await waitFor(studio, (snapshot) => snapshot.runs.at(-1).status === 'review-required');
  await assert.rejects(studio.control(id, 'accept'), /verified candidate/);
  await studio.control(id, 'verify');
  await writeFile(join(root, 'unrelated.txt'), 'unrelated user work');
  await assert.rejects(studio.control(id, 'accept'), /existing product changes/);
  assert.equal((await studio.snapshot()).completed.length, 0);
});

test('negative: a provider failure preserves its demand and never manufactures completion', async (t) => {
  const { studio } = await fixture(t, { runner: new FixtureRunner({ failure: true }) });
  await start(studio);
  const result = await waitFor(studio, (state) => state.runs.at(-1).status === 'failed');
  assert.equal(result.demands.length, 1);
  assert.equal(result.completed.length, 0);
  assert.match(result.runs.at(-1).error, /Injected provider failure/);
});

test('negative: external record edits cannot become execution authority through a fresh snapshot', async (t) => {
  const { root, studio } = await fixture(t);
  const path = join(root, '.adhd', 'studio', 'records.json');
  const original = await readFile(path, 'utf8');
  await writeFile(path, `${original} `);
  await assert.rejects(studio.snapshot(), /outside the designated writer/);
  await writeFile(path, original);
  assert.equal((await studio.snapshot()).runs.length, 0);
});

test('positive: hosted and self-hosted use the same persisted product workflow with explicit mode matching', async (t) => {
  for (const mode of ['hosted', 'self-hosted']) {
    const { studio } = await fixture(t, { mode });
    const state = await studio.snapshot();
    assert.equal(state.mode, mode);
    assert.equal(state.blueprint.path, mode);
    await assert.rejects(studio.saveBlueprint({ blueprint: { ...state.blueprint, path: 'local' }, revision: state.revision }), /service runs in/);
  }
});
