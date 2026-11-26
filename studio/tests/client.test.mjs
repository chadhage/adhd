import assert from 'node:assert/strict';
import test from 'node:test';
import clientModule from '../../prototype/service.js';
const blueprint = { path: 'local', name: 'Client fixture', goal: 'One scoped card', factories: [{ id: 'f1', name: 'Factory', squads: [{ id: 's1', name: 'Squad', members: '1' }] }] };
const review = { scope: 'One scoped card', budget: 30, maxSeconds: 120, share: true, write: true, verify: true, model: 'auto', factoryId: 'f1', squadId: 's1' };

const { StudioClient } = clientModule;
const token = 'isolated-unit-fixture-token-not-a-production-secret';
const state = () => ({ version: 1, revision: 'fixture-revision', mode: 'local', runs: [], blueprint, repository: { workspace: 'fixture', branch: 'main' } });
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('positive: connection uses an authorization header, never a URL credential, and disconnect clears it', async () => {
  const requests = [];
  const client = new StudioClient({ fetchFn: async (url, options) => {
    requests.push({ url, options });
    return response(url.endsWith('/api/runtime') ? { models: [{ id: 'auto' }] } : state());
  } });
  assert.equal(await client.connect('http://127.0.0.1:4319', token, 'local'), true);
  assert.ok(requests.every(({ url, options }) => !url.includes(token) && options.headers.Authorization === `Bearer ${token}` && options.redirect === 'error'));
  client.disconnect();
  assert.equal(client.token, '');
  assert.equal(client.state, null);
});

test('positive: the default browser fetch retains its required global receiver', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = function (url) {
    assert.equal(this, globalThis);
    return Promise.resolve(response(url.endsWith('/api/runtime') ? { models: [{ id: 'auto' }] } : state()));
  };
  try {
    const client = new StudioClient();
    assert.equal(await client.connect('http://127.0.0.1:4319', token, 'local'), true);
  } finally {
    globalThis.fetch = original;
  }
});

test('negative: credential-bearing and insecure remote service origins cannot receive a token', async () => {
  const client = new StudioClient({ fetchFn: () => { throw new Error('No fetch should occur'); } });
  for (const url of ['https://user:password@example.invalid', 'http://example.invalid', 'https://example.invalid/?token=x', 'https://example.invalid/path']) {
    await assert.rejects(client.connect(url, token, 'hosted'));
  }
});

test('negative: out-of-order connection responses cannot restore a disconnected session', async () => {
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const client = new StudioClient({ fetchFn: async (url) => url.endsWith('/api/runtime') ? pending : response(state()) });
  const connect = client.connect('http://127.0.0.1:4319', token, 'local');
  await new Promise((resolve) => setImmediate(resolve));
  client.disconnect();
  finish(response({ models: [{ id: 'auto' }] }));
  assert.equal(await connect, false);
  assert.equal(client.connection, 'idle');
});

test('negative: malformed success responses cannot turn unknown server state into an idle success', async () => {
  const client = new StudioClient({ fetchFn: async () => response({ ok: true }) });
  client.endpoint = 'http://127.0.0.1:4319';
  client.token = token;
  client.state = state();
  await assert.rejects(client.saveBlueprint(blueprint), /invalid state/);
});

test('negative: a pending Factory response cannot restore a disconnected product session', async () => {
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const client = new StudioClient({ fetchFn: async () => pending });
  client.endpoint = 'http://127.0.0.1:4319';
  client.token = token;
  client.state = state();
  const control = client.factoryControl('pause');
  client.disconnect();
  finish(response(state()));
  await assert.rejects(control, /connection changed/);
  assert.equal(client.state, null);
  assert.equal(client.connection, 'idle');
});

test('negative: an old blueprint response cannot replace the newly connected product', async () => {
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const client = new StudioClient({ fetchFn: async (url, options) => {
    if (options.method === 'PUT') return pending;
    return response(url.endsWith('/api/runtime') ? { models: [{ id: 'auto' }] } : {
      ...state(), repository: { workspace: new URL(url).origin, branch: 'main' },
    });
  } });
  await client.connect('http://127.0.0.1:4319', token, 'local');
  const save = client.saveBlueprint(blueprint);
  await client.connect('http://127.0.0.1:4320', token, 'local');
  finish(response(state()));
  await assert.rejects(save, /connection changed/);
  assert.equal(client.state.repository.workspace, 'http://127.0.0.1:4320');
  assert.equal(client.connection, 'connected');
});

test('negative: an in-flight stream frame cannot revive state after disconnect', async () => {
  let producer;
  const body = new ReadableStream({ start(controller) { producer = controller; } });
  const client = new StudioClient({ fetchFn: async () => new Response(body) });
  const observed = [];
  const streaming = client.stream((value) => observed.push(value), () => {}, (error) => { throw error; });
  await new Promise((resolve) => setImmediate(resolve));
  client.disconnect();
  producer.enqueue(new TextEncoder().encode(`event: state\ndata: ${JSON.stringify(state())}\n\n`));
  producer.close();
  await streaming;
  assert.equal(client.state, null);
  assert.equal(observed.length, 0);
});

test('negative: stale asynchronous readiness cannot authorize newly changed scope', async () => {
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const client = new StudioClient({ fetchFn: async () => pending });
  client.endpoint = 'http://127.0.0.1:4319';
  client.token = token;
  client.state = state();
  client.setReview(review);
  const check = client.check();
  await new Promise((resolve) => setTimeout(resolve, 20));
  client.setReview({ ...review, scope: 'A different authorized card' });
  finish(response({ ready: true, checks: [], authorizationId: 'stale', runtime: { models: [] } }));
  await assert.rejects(check, /Scope or connection changed/);
  assert.equal(client.authorizationId, null);
  assert.equal(client.readiness, 'unchecked');
});

test('positive: Factory controls and package export use owner headers and refresh authoritative state', async () => {
  const calls = [];
  const client = new StudioClient({ fetchFn: async (url, options) => {
    calls.push({ url, options });
    return response(url.endsWith('/package')
      ? { package: { files: { Dockerfile: 'fixture' }, digest: 'fixture-digest' }, saved: true, state: state() }
      : state());
  } });
  client.endpoint = 'https://owned.example';
  client.token = token;
  client.state = state();
  await client.authorizeFactory({ fixture: 'owner policy input' });
  await client.factoryControl('pause');
  const exported = await client.factoryPackage('fixture-image', { command: 'node', args: [] });
  assert.equal(exported.digest, 'fixture-digest');
  assert.ok(calls.every(({ options }) => options.headers.Authorization === `Bearer ${token}`));
  await assert.rejects(client.factoryControl('administrator-bypass'), /Unsupported/);
});

test('negative: invalid Factory checkpoints and unpersisted packages are not accepted as success', async () => {
  const client = new StudioClient({ fetchFn: async () => response({ package: { files: {}, digest: 'not-persisted' }, saved: false, state: state() }) });
  client.endpoint = 'https://owned.example';
  client.token = token;
  client.state = state();
  assert.throws(() => client.acceptState({ ...state(), factory: { version: 1, tasks: 'not-an-array' } }), /invalid Factory/);
  await assert.rejects(client.factoryPackage('fixture', { command: 'node', args: [] }), /durably saved/);
});
