import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { scopedPath, validateBlueprint } from '../contracts.mjs';
import { createStudioServer } from '../server.mjs';
import { blueprint, fixture } from './helpers.mjs';

test('negative: parent, absolute, credential, and linked paths cannot escape the product tool boundary', async (t) => {
  const { root } = await fixture(t);
  for (const path of ['../outside.txt', '.git/config', '.env', 'secrets/key.txt', 'node_modules/a.js', 'a/../b', 'C:\\outside.txt']) {
    await assert.rejects(scopedPath(root, path), /path|Protected/i);
  }
  const outside = join(root, 'outside');
  await mkdir(outside);
  await writeFile(join(outside, 'value.txt'), 'not exposed through links');
  await symlink(outside, join(root, 'redirect'), 'junction');
  await assert.rejects(scopedPath(root, 'redirect/value.txt'), /Linked files/);
});

test('negative: malformed or duplicated team records cannot be persisted as a valid blueprint', () => {
  for (const value of [null, { ...blueprint, unexpected: true }, { ...blueprint, path: 'cli' }, { ...blueprint, factories: [] }, { ...blueprint, factories: [...blueprint.factories, ...blueprint.factories] }]) {
    assert.throws(() => validateBlueprint(value));
  }
});

test('negative: API authentication, origin, host, body and URL boundaries fail explicitly', async (t) => {
  const { studio } = await fixture(t);
  const token = randomBytes(32).toString('hex');
  const service = await createStudioServer({ studio, token, port: 0 });
  t.after(() => service.close());
  const auth = { Authorization: `Bearer ${token}` };
  assert.equal((await fetch(`${service.url}/api/state`)).status, 401);
  assert.equal((await fetch(`${service.url}/api/state`, { headers: { ...auth, Origin: 'https://unapproved.example' } })).status, 403);
  assert.equal((await fetch(`${service.url}/api/state?token=not-a-secret`, { headers: auth })).status, 400);
  assert.equal((await fetch(`${service.url}/api/blueprint`, { method: 'PUT', headers: auth, body: '{}' })).status, 415);
  assert.equal((await fetch(`${service.url}/.adhd/studio/records.json`, { headers: auth })).status, 404);
  const state = await (await fetch(`${service.url}/api/state`, { headers: auth })).json();
  assert.equal(state.version, 1);
  assert.equal(JSON.stringify(state).includes(token), false);
  const index = await (await fetch(service.url)).text();
  assert.match(index, /service\.js/);
  assert.doesNotMatch(index, /script src="demo\.js"/);
});

test('negative: remote services cannot start without TLS, and local mode cannot expose the control API on all interfaces', async (t) => {
  const { studio } = await fixture(t);
  const token = randomBytes(32).toString('hex');
  await assert.rejects(createStudioServer({ studio, token, mode: 'hosted' }), /require configured TLS/);
  await assert.rejects(createStudioServer({ studio, token, mode: 'self-hosted' }), /require configured TLS/);
  await assert.rejects(createStudioServer({ studio, token, hostname: '0.0.0.0' }), /loopback/);
  await assert.rejects(createStudioServer({ studio, token: 'weak' }), /secret store/);
});
