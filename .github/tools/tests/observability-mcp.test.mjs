import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { Readable, Writable } from 'node:stream';
import test from 'node:test';
import { createMcpHandler, serveMcp } from '../../skills/factory-observability/scripts/runtime/mcp.mjs';
import { center, fact, initialize, ready, rpc } from './observability-helpers.mjs';

test('positive: MCP handshake negotiates a supported version and exposes only read-only Factory tools/resources', async (t) => {
  const ws = await center(t);
  const handler = createMcpHandler(ws.directory);
  const negotiated = await handler({ ...initialize, params: { ...initialize.params, protocolVersion: 'future-protocol' } });
  assert.equal(negotiated.result.protocolVersion, '2025-06-18');
  await handler({ jsonrpc: '2.0', method: 'notifications/initialized' });
  const tools = (await handler(rpc(2, 'tools/list'))).result.tools;
  assert.deepEqual(tools.map((tool) => tool.name), ['factory_overview', 'factory_metadata', 'factory_events', 'factory_analytics']);
  assert.ok(tools.every((tool) => tool.annotations.readOnlyHint && !tool.annotations.destructiveHint && !tool.inputSchema.additionalProperties));
  const resources = (await handler(rpc(3, 'resources/list'))).result.resources;
  assert.ok(resources.every((resource) => resource.uri.startsWith('factory://alpha/')));
  assert.deepEqual((await handler(rpc(4, 'resources/templates/list'))).result.resourceTemplates, []);
  assert.deepEqual((await handler(rpc(5, 'ping'))).result, {});
  assert.equal(await handler({ jsonrpc: '2.0', method: 'notifications/cancelled' }), undefined);
});

test('negative: MCP reads before initialization and repeated initialization are explicit protocol errors', async (t) => {
  const ws = await center(t);
  const handler = createMcpHandler(ws.directory);
  assert.equal((await handler(rpc(0, 'tools/list'))).error.code, -32002);
  assert.equal((await handler(rpc(1, 'ping'))).result.constructor, Object);
  await handler(initialize);
  assert.equal((await handler(rpc(2, 'tools/list'))).error.code, -32002);
  await handler({ jsonrpc: '2.0', method: 'notifications/initialized' });
  assert.equal((await handler(initialize)).error.code, -32600);
});

for (const [name, message] of [
  ['batch requests', []], ['null requests', null],
  ['wrong JSON-RPC version', { jsonrpc: '1.0', id: 1, method: 'ping' }],
  ['object IDs', { jsonrpc: '2.0', id: {}, method: 'ping' }],
  ['missing method', { jsonrpc: '2.0', id: 1 }],
  ['non-finite IDs', { jsonrpc: '2.0', id: Infinity, method: 'ping' }],
]) test(`negative: MCP rejects ${name}`, async (t) => {
  const ws = await center(t);
  const response = await createMcpHandler(ws.directory)(message);
  assert.equal(response.error.code, -32600);
});

for (const [name, params] of [
  ['missing version', { capabilities: {}, clientInfo: { name: 'x', version: '1' } }],
  ['missing client identity', { protocolVersion: '2025-06-18', capabilities: {} }],
  ['array capabilities', { protocolVersion: '2025-06-18', capabilities: [], clientInfo: { name: 'x', version: '1' } }],
  ['unexpected fields', { ...initialize.params, permissions: 'allow' }],
]) test(`negative: MCP initialization rejects ${name}`, async (t) => {
  const ws = await center(t);
  assert.equal((await createMcpHandler(ws.directory)(rpc(1, 'initialize', params))).error.code, -32602);
});

test('positive: MCP text, structured results and fixed resources read the same journal', async (t) => {
  const ws = await center(t);
  await ws.store.append(fact());
  const handler = await ready(createMcpHandler(ws.directory));
  const tool = (await handler(rpc(2, 'tools/call', { name: 'factory_overview' }))).result;
  assert.deepEqual(JSON.parse(tool.content[0].text), tool.structuredContent);
  const resource = (await handler(rpc(3, 'resources/read', { uri: 'factory://alpha/overview' }))).result.contents[0];
  assert.deepEqual(JSON.parse(resource.text).latest_events, tool.structuredContent.latest_events);
  for (const name of ['events', 'analytics']) {
    const result = await handler(rpc(4, 'resources/read', { uri: `factory://alpha/${name}` }));
    assert.equal(result.result.contents[0].mimeType, 'application/json');
  }
});

for (const [name, method, params, code] of [
  ['unknown controls', 'factory/resume', {}, -32601],
  ['unknown tools', 'tools/call', { name: 'factory_execute', arguments: {} }, -32602],
  ['other Factory resources', 'resources/read', { uri: 'factory://beta/overview' }, -32602],
  ['arbitrary files', 'resources/read', { uri: 'file:///private' }, -32602],
  ['raw action parameters', 'tools/call', { name: 'factory_overview', command: 'execute' }, -32602],
]) test(`negative: MCP cannot access ${name}`, async (t) => {
  const ws = await center(t);
  const handler = await ready(createMcpHandler(ws.directory));
  assert.equal((await handler(rpc(5, method, params))).error.code, code);
});

for (const [tool, args] of [
  ['factory_events', { factory_id: 'beta' }],
  ['factory_events', { after: 99 }],
  ['factory_analytics', { from: '2020-01-01T00:00:00Z' }],
  ['factory_overview', { q: 'ignored' }],
  ['factory_events', []],
  ['factory_events', null],
  ['factory_analytics', ''],
  ['factory_analytics', { order: 'desc' }],
]) test(`negative: ${tool} reports invalid query arguments as tool errors`, async (t) => {
  const ws = await center(t);
  const diagnostics = [];
  const handler = await ready(createMcpHandler(ws.directory, { log: (message) => diagnostics.push(message) }));
  const response = await handler(rpc(2, 'tools/call', { name: tool, arguments: args }));
  assert.equal(response.result.isError, true);
  assert.equal(response.result.structuredContent, undefined);
  assert.ok(diagnostics.length);
});

test('negative: MCP does not turn corrupt records into successful empty results', async (t) => {
  const ws = await center(t);
  await writeFile(ws.path('events.jsonl'), 'corrupt\n');
  const handler = await ready(createMcpHandler(ws.directory, { log: () => {} }));
  assert.equal((await handler(rpc(2, 'tools/call', { name: 'factory_events' }))).result.isError, true);
  assert.equal((await handler(rpc(3, 'resources/read', { uri: 'factory://alpha/events' }))).error.code, -32603);
});

async function stdio(directory, chunks, options = {}) {
  let text = '';
  const output = new Writable({ highWaterMark: 1, write(chunk, encoding, done) { text += chunk.toString(); setImmediate(done); } });
  await serveMcp(directory, Readable.from(chunks), output, options);
  return text.trim().split('\n').map((line) => JSON.parse(line));
}

test('positive: actual stdio framing honors chunk boundaries, notifications, output backpressure and EOF', async (t) => {
  const ws = await center(t);
  const input = [initialize, { jsonrpc: '2.0', method: 'notifications/initialized' }, rpc(2, 'tools/list')].map((entry) => JSON.stringify(entry)).join('\n');
  const responses = await stdio(ws.directory, [input.slice(0, 13), input.slice(13)]);
  assert.equal(responses.length, 2);
  assert.equal(responses[0].id, 1);
  assert.equal(responses[1].result.tools.length, 4);
});

test('negative: malformed and oversized stdio frames fail explicitly and the following valid message still works', async (t) => {
  const ws = await center(t);
  const responses = await stdio(ws.directory, ['not json\n', 'x'.repeat(70_000), '\n\n', JSON.stringify(rpc(7, 'ping')) + '\n']);
  assert.equal(responses[0].error.code, -32700);
  assert.equal(responses[1].error.code, -32700);
  assert.equal(responses[2].id, 7);
  const unfinished = await stdio(ws.directory, ['x'.repeat(70_000)]);
  assert.equal(unfinished[0].error.code, -32700);
});
