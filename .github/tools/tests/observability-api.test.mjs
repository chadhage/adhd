import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { join } from 'node:path';
import test from 'node:test';
import { createCenterServer } from '../../skills/factory-observability/scripts/runtime/http.mjs';
import { createMcpHandler } from '../../skills/factory-observability/scripts/runtime/mcp.mjs';
import { center, fact, ready, rpc } from './observability-helpers.mjs';

async function service(t) {
  const ws = await center(t);
  const diagnostics = [];
  const app = createCenterServer(ws.directory, { intervalMs: 20, log: (message) => diagnostics.push(message) });
  const url = await app.listen();
  t.after(() => app.close());
  return { ...ws, app, url, diagnostics };
}

async function readUntil(reader, predicate) {
  let text = '';
  const timeout = setTimeout(() => reader.cancel(), 5000);
  try {
    while (!predicate(text)) {
      const chunk = await reader.read();
      if (chunk.done) break;
      text += new TextDecoder().decode(chunk.value);
    }
    assert.ok(predicate(text), 'Expected SSE fact was not delivered before the bounded deadline');
    return text;
  } finally { clearTimeout(timeout); }
}

test('positive: standalone UI assets and service readiness are served with safe local headers', async (t) => {
  const ws = await service(t);
  for (const path of ['/', '/app.js', '/style.css', '/favicon.svg']) {
    const response = await fetch(ws.url + path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(response.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
    assert.ok((await response.text()).length > 20);
  }
  const health = await (await fetch(ws.url + '/healthz')).json();
  assert.equal(health.status, 'ready');
  assert.equal(health.factory_freshness, 'unknown');
  assert.equal(health.factory_id, 'alpha');
  assert.equal(ws.app.server.address().address, '127.0.0.1');
  assert.equal((await (await fetch(ws.url + '/api/v1/schema')).json()).additionalProperties, false);
});

test('positive: API and MCP read identical sanitized Factory facts, entities and analytics', async (t) => {
  const ws = await service(t);
  await ws.store.append(fact('skill.started', { skill: 'fullstack-empirical-done' }));
  await ws.store.append(fact('item.created', { item: { id: 'CARD-1', type: 'card', title: '<script>inert text</script>', state: 'todo' } }));
  const mcp = await ready(createMcpHandler(ws.directory));
  const httpOverview = await (await fetch(ws.url + '/api/v1/overview')).json();
  const mcpOverview = (await mcp(rpc(2, 'tools/call', { name: 'factory_overview', arguments: {} }))).result.structuredContent;
  for (const field of ['factory', 'counts', 'agents', 'skills', 'items', 'latest_events', 'last_sequence']) assert.deepEqual(httpOverview[field], mcpOverview[field]);
  const query = { order: 'desc', limit: 1, q: 'CARD-1' };
  const apiEvents = await (await fetch(`${ws.url}/api/v1/events?${new URLSearchParams(query)}`)).json();
  assert.deepEqual(apiEvents, (await mcp(rpc(3, 'tools/call', { name: 'factory_events', arguments: query }))).result.structuredContent);
  const window = { from: '2026-10-23T11:00:00Z', to: '2026-10-23T12:00:00Z' };
  const apiAnalytics = await (await fetch(`${ws.url}/api/v1/analytics?${new URLSearchParams(window)}`)).json();
  assert.deepEqual(apiAnalytics, (await mcp(rpc(4, 'tools/call', { name: 'factory_analytics', arguments: window }))).result.structuredContent);
});

for (const [name, headers] of [
  ['cross-site origin', { Origin: 'https://untrusted.example' }],
  ['rebinding Host', { Host: 'untrusted.example' }],
  ['cross-site fetch metadata', { 'Sec-Fetch-Site': 'cross-site' }],
  ['same-site different origin', { 'Sec-Fetch-Site': 'same-site' }],
]) test(`negative: loopback service rejects ${name}`, async (t) => {
  const ws = await service(t);
  const response = await new Promise((done, fail) => {
    request(ws.url + '/api/v1/overview', { headers }, (result) => {
      result.resume();
      result.once('end', () => done(result));
    }).on('error', fail).end();
  });
  assert.equal(response.statusCode, 403);
  assert.equal(response.headers['access-control-allow-origin'], undefined);
});

for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) test(`negative: ${method} cannot control a Factory or mutate its records`, async (t) => {
  const ws = await service(t);
  const before = await readFile(ws.path('events.jsonl'), 'utf8');
  const response = await fetch(ws.url + '/api/v1/overview', { method });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET');
  assert.equal(await readFile(ws.path('events.jsonl'), 'utf8'), before);
});

for (const path of [
  '/api/v1/control', '/api/v1/other-factory/overview', '/center.json', '/events.jsonl', '/.env', '/../../.git/config',
]) test(`negative: non-allowlisted route ${path} cannot expose files or cross-Factory controls`, async (t) => {
  const ws = await service(t);
  assert.equal((await fetch(ws.url + path)).status, 404);
});

for (const path of [
  '/api/v1/schema?q=ignored', '/api/v1/overview?agent_id=x', '/healthz?limit=1',
  '/api/v1/events?limit=501', '/api/v1/events?after=99', '/api/v1/events?limit=1&limit=2',
  '/api/v1/analytics?from=2020-01-01T00:00:00Z', '/api/v1/analytics?limit=1', '/api/v1/stream?before=1',
  '/api/v1/stream?order=desc', '/api/v1/stream?limit=2', '/api/v1/stream?after=99',
]) test(`negative: invalid API parameters fail explicitly for ${path}`, async (t) => {
  const ws = await service(t);
  assert.equal((await fetch(ws.url + path)).status, 400);
  assert.ok(ws.diagnostics.length > 0);
});

test('negative: rejected inbox facts degrade readiness instead of hiding capture loss', async (t) => {
  const ws = await service(t);
  await writeFile(ws.path(join('inbox', 'bad.json')), '{"message":"SECRET-RAW"');
  const response = await fetch(ws.url + '/healthz');
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.ok(body.includes('degraded'));
  assert.ok(!body.includes('SECRET-RAW'));
  const overview = await (await fetch(ws.url + '/api/v1/overview')).json();
  assert.equal(overview.coverage.ingestion_errors.length, 1);
});

test('negative: corrupt source records are explicit API failures, not empty success-shaped snapshots', async (t) => {
  const ws = await service(t);
  await writeFile(ws.path('events.jsonl'), 'corrupt\n');
  const response = await fetch(ws.url + '/api/v1/overview');
  assert.equal(response.status, 503);
  assert.ok((await response.json()).error.includes('invalid record'));
});

test('positive: SSE replays its cursor, streams real new facts and uses Last-Event-ID on reconnect', async (t) => {
  const ws = await service(t);
  const first = await ws.store.append(fact());
  const second = await ws.store.append(fact());
  const controller = new AbortController();
  const response = await fetch(ws.url + '/api/v1/stream?after=0', { headers: { 'Last-Event-ID': String(first.sequence) }, signal: controller.signal });
  assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  const reader = response.body.getReader();
  try {
    const replay = await readUntil(reader, (text) => text.includes(second.event_id));
    const factFrames = replay.split('event: fact').slice(1).join('');
    assert.ok(!factFrames.includes(first.event_id));
    assert.ok(factFrames.includes(second.event_id));
    const third = await ws.store.append(fact('agent.failed'));
    const live = await readUntil(reader, (text) => text.includes(third.event_id));
    assert.ok(live.includes(`id: ${third.sequence}`));
  } finally { controller.abort(); await reader.cancel().catch(() => {}); }
});

test('positive: no-cursor stream tails, filters facts, and reports collector errors without replacing observations', async (t) => {
  const ws = await service(t);
  await ws.store.append(fact());
  const response = await fetch(ws.url + '/api/v1/stream?severity=error');
  const reader = response.body.getReader();
  try {
    await readUntil(reader, (text) => text.includes('event: snapshot'));
    await ws.store.append(fact());
    const failure = await ws.store.append(fact('agent.failed'));
    const frames = await readUntil(reader, (text) => text.includes(failure.event_id));
    assert.ok(frames.includes('event: fact'));
    await writeFile(ws.path('events.jsonl'), 'invalid\n');
    const degraded = await readUntil(reader, (text) => text.includes('event: capture-error'));
    assert.ok(degraded.includes('invalid record'));
  } finally { await reader.cancel(); }
});

test('negative: invalid reconnect cursors are rejected before establishing a stream', async (t) => {
  const ws = await service(t);
  const response = await fetch(ws.url + '/api/v1/stream', { headers: { 'Last-Event-ID': 'not-an-integer' } });
  assert.equal(response.status, 400);
});

test('negative: public binding and invalid ports are not configurable escape hatches', async (t) => {
  const ws = await center(t);
  const app = createCenterServer(ws.directory);
  for (const port of [-1, 65536, 1.5]) await assert.rejects(app.listen(port), /Port/);
  await app.close();
});
