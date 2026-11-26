import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import test from 'node:test';
import { createStudioServer } from '../server.mjs';
import { FactoryController } from '../factory-controller.mjs';
import { factoryFixture, factorySecret, factoryMandate, fixtureExecutor } from './helpers.mjs';

const request = async (url, token, path, body) => {
  const response = await fetch(`${url}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, data: await response.json() };
};

test('negative: role credentials cannot read owner state, authorize production or impersonate another role', async (t) => {
  const { studio } = await factoryFixture(t, { policy: { ...factoryMandate, maxCycles: 1 } });
  const service = await createStudioServer({ studio, token: factorySecret, port: 0 });
  t.after(() => service.close());
  const keys = (await request(service.url, factorySecret, '/api/factory/worker-credentials')).data.credentials;
  assert.equal((await request(service.url, keys.Fullstacker, '/api/state')).status, 403);
  assert.equal((await request(service.url, keys.Fullstacker, '/api/factory/authorize', { mandate: factoryMandate, revision: studio.records.revision })).status, 403);
  assert.equal((await request(service.url, keys.Fullstacker, '/api/factory/worker-credentials')).status, 403);
  assert.equal((await request(service.url, factorySecret, '/api/factory/claim', { workerId: randomUUID() })).status, 403);
  assert.equal((await request(service.url, keys.Fullstacker, `/api/factory/tasks/${randomUUID()}/check`, { lease: randomUUID() })).status, 409);
});

test('positive: HTTP export returns a Git-tracked package without creating operating authority', async (t) => {
  const { studio, controller } = await factoryFixture(t);
  const service = await createStudioServer({ studio, token: factorySecret, port: 0 });
  t.after(() => service.close());
  const revision = (await studio.snapshot()).revision;
  const response = await request(service.url, factorySecret, '/api/factory/package', {
    image: `ghcr.io/fixture/runtime@sha256:${'a'.repeat(64)}`,
    verification: { command: 'node', args: ['--test', 'acceptance.test.mjs'] }, revision,
  });
  assert.equal(response.status, 200, JSON.stringify(response.data));
  assert.equal(response.data.saved, true);
  assert.ok(response.data.package.files['kubernetes.json']);
  assert.equal((await studio.snapshot()).factory.status, 'authorized');
  assert.equal(controller.loop, null);
  const tracked = await studio.repository.git(['ls-files', `.adhd/studio/deployments/${response.data.package.digest}/Dockerfile`]);
  assert.ok(tracked.trim());
});

test('negative: unsigned or cross-product startup files cannot manufacture a mandate', async (t) => {
  const { controller, studio } = await factoryFixture(t);
  const envelope = await controller.exportMandate();
  await assert.rejects(controller.importMandate({ ...envelope, mandate: { ...envelope.mandate, maxCredits: 100000 } }), /not a mandate signed/);
  await assert.rejects(controller.importMandate({ ...envelope, authoritySignature: '0'.repeat(64) }), /not a mandate signed/);
  assert.equal((await studio.snapshot()).factory.mandate.maxCredits, factoryMandate.maxCredits);
});

test('negative: owner revocation wins over pending asynchronous startup and concurrent starts share one executor', async (t) => {
  const { studio, controller } = await factoryFixture(t);
  const inspect = studio.runner.inspect.bind(studio.runner);
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  studio.runner.inspect = async (...args) => { await pending; return inspect(...args); };
  const starting = controller.start();
  const duplicate = controller.start();
  await new Promise((resolve) => setImmediate(resolve));
  await controller.control('revoke');
  release();
  await assert.rejects(starting, /changed or revoked/);
  await assert.rejects(duplicate, /changed or revoked/);
  assert.equal((await studio.snapshot()).factory.status, 'revoked');
  assert.equal(controller.loop, null);
});

test('negative: trusted HTTPS ingress must match its configured origin and cannot authenticate worker control as owner', async (t) => {
  const { studio } = await factoryFixture(t);
  await assert.rejects(createStudioServer({ studio, token: factorySecret, mode: 'hosted', proxyOrigin: 'http://example.invalid' }), /HTTPS/);
  const service = await createStudioServer({ studio, token: factorySecret, mode: 'hosted', proxyOrigin: 'https://owned.example', port: 0 });
  t.after(() => service.close());
  assert.equal((await request(service.url, factorySecret, '/api/state')).status, 403);
  const accepted = await new Promise((resolve, reject) => {
    const incoming = httpRequest(`${service.url}/api/state`, { headers: { Authorization: `Bearer ${factorySecret}`, Host: 'owned.example', Origin: 'https://owned.example' } }, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    incoming.on('error', reject);
    incoming.end();
  });
  assert.equal(accepted.status, 200, accepted.body);
});

test('positive: a large state frame does not disconnect a fast event-stream consumer at the socket high-water mark', async (t) => {
  const { studio } = await factoryFixture(t);
  const service = await createStudioServer({ studio, token: factorySecret, port: 0 });
  const abort = new AbortController();
  t.after(async () => { abort.abort(); await service.close(); });
  const response = await fetch(`${service.url}/api/events`, { headers: { Authorization: `Bearer ${factorySecret}` }, signal: abort.signal });
  const reader = response.body.getReader();
  await reader.read();
  const payload = 'x'.repeat(64 * 1024);
  studio.emit('state', { ...await studio.snapshot(), largeTransportFixture: payload });
  let text = '';
  while (!text.includes(payload)) {
    const chunk = await reader.read();
    assert.equal(chunk.done, false, 'state transport closed before the bounded frame was delivered');
    text += new TextDecoder().decode(chunk.value);
  }
  assert.ok(text.includes(payload));
  await reader.cancel();
});

test('negative: restart cannot replace the approved executor policy without an explicit owner amendment', async (t) => {
  const { studio, runner } = await factoryFixture(t);
  const changed = await new FactoryController(studio, {
    secret: factorySecret, runner, observer: null,
    executor: { ...fixtureExecutor, policyDigest: 'changed-executor-fixture' },
  }).initialize();
  studio.factory = changed;
  assert.equal((await studio.snapshot()).factory.status, 'restricted');
  await assert.rejects(changed.start(), /executor or reviewed operation targets changed/);
  await changed.authorize({ mandate: factoryMandate, revision: (await studio.snapshot()).revision });
  assert.equal((await studio.snapshot()).factory.status, 'authorized');
});
