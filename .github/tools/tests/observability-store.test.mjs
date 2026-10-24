import assert from 'node:assert/strict';
import { mkdir, readFile, rm, truncate, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { createStore, eventSchema, loadConfig, MAX_EVENT_BYTES, MAX_JOURNAL_BYTES, normalizeEvent, redact, requireObject } from '../../skills/factory-observability/scripts/runtime/store.mjs';
import { center, fact, fixedNow, records } from './observability-helpers.mjs';

const invalid = [
  ['cross-Factory identity', (event) => { event.factory_id = 'beta'; }, /different Factory/],
  ['unknown fields', (event) => { event.prompt = 'do not capture'; }, /unsupported fields/],
  ['future schema version', (event) => { event.schema_version = 2; }, /schema_version/],
  ['unknown kind', (event) => { event.kind = 'factory.execute'; }, /kind/],
  ['unknown severity', (event) => { event.severity = 'healthy'; }, /severity/],
  ['missing timezone', (event) => { event.occurred_at = '2026-10-23T10:00:00'; }, /timestamp/],
  ['invalid timestamp', (event) => { event.occurred_at = 'not a date'; }, /timestamp/],
  ['invalid calendar day', (event) => { event.occurred_at = '2026-02-30T00:00:00Z'; }, /calendar/],
  ['future source clock', (event) => { event.occurred_at = '2099-01-01T00:00:00Z'; }, /future/],
  ['unsafe event identity', (event) => { event.event_id = '../escape'; }, /event_id/],
  ['empty message', (event) => { event.message = ' '; }, /message/],
  ['oversized message', (event) => { event.message = 'x'.repeat(501); }, /message/],
  ['missing agent for lifecycle', (event) => { delete event.agent; }, /agent is required/],
  ['unknown agent fields', (event) => { event.agent.prompt = 'raw'; }, /unsupported/],
  ['invalid actor identity', (event) => { event.agent.id = '\n'; }, /agent.id/],
  ['invalid source kind', (event) => { event.source.kind = 'approval'; }, /source kind/],
  ['raw source content', (event) => { event.source.content = 'raw'; }, /unsupported/],
  ['credential source path', (event) => { event.source.ref = '.env.local'; }, /Sensitive/],
  ['missing skill', (event) => { event.kind = 'skill.started'; }, /skill is required/],
  ['unsafe skill name', (event) => { event.skill = '../method'; }, /skill/],
  ['missing product item', (event) => { event.kind = 'item.created'; }, /item is required/],
  ['unsupported item type', (event) => { event.item = { id: 'a', title: 'a', type: 'secret' }; }, /item type/],
  ['unsupported item state', (event) => { event.item = { id: 'a', title: 'a', type: 'card', state: 'approved-for-release' }; }, /item state/],
  ['sensitive artifact path', (event) => { event.item = { id: 'config\\credentials\\a.json', title: 'a', type: 'artifact' }; }, /Sensitive/],
  ['malformed trace ID', (event) => { event.trace_id = 'zero'; }, /trace_id/],
  ['zero span ID', (event) => { event.span_id = '0000000000000000'; }, /span_id/],
  ['span without trace', (event) => { event.span_id = 'abcdef1234567890'; }, /requires trace/],
  ['negative duration', (event) => { event.duration_ms = -1; }, /duration_ms/],
  ['non-finite duration', (event) => { event.duration_ms = Infinity; }, /duration_ms/],
  ['producer-assigned sequence', (event) => { event.sequence = 1; }, /unsupported/],
  ['producer-assigned collection time', (event) => { event.recorded_at = event.occurred_at; }, /unsupported/],
];
for (const [name, change, error] of invalid) test(`negative: emissions reject ${name}`, () => {
  const event = fact();
  change(event);
  assert.throws(() => normalizeEvent(event, 'alpha', fixedNow), error);
});

test('negative: null and array events are not objects and no unknown metadata is accepted', () => {
  for (const value of [null, [], 'text']) assert.throws(() => normalizeEvent(value, 'alpha', fixedNow), /object/);
  assert.throws(() => requireObject({ raw: true }, [], 'sample'), /unsupported/);
});

test('positive: normalized facts preserve attributable trace and item metadata with an explicit schema', () => {
  const input = fact('item.created', {
    item: { id: 'CARD-1', title: 'Vertical outcome', type: 'card' },
    trace_id: '1234567890abcdef1234567890abcdef', span_id: '1234567890abcdef', correlation_id: 'assignment-1',
    duration_ms: 0, skill: 'fullstack-empirical-done', tool: 'functions.view',
  });
  const result = normalizeEvent(input, 'alpha', fixedNow);
  assert.equal(result.item.state, 'unknown');
  assert.equal(result.source.revision, null);
  assert.equal(result.duration_ms, 0);
  assert.equal(eventSchema.additionalProperties, false);
  assert.equal(normalizeEvent(fact('agent.failed'), 'alpha', fixedNow).severity, 'error');
});

test('positive: emitted summaries redact common credential forms, URL credentials/query and control bytes', () => {
  const message = 'Bearer abc123 password="private value" api_key=private https://user:pass@example.test/path?token=hidden#secret \u0000';
  const result = normalizeEvent(fact('agent.progress', { message }), 'alpha', fixedNow);
  assert.ok(!JSON.stringify(result).includes('private'));
  assert.ok(!JSON.stringify(result).includes('hidden'));
  assert.ok(result.message.includes('[REDACTED]'));
  assert.equal(redact('-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----'), '[REDACTED]');
  assert.equal(redact('ghp_abcdefghijklmnop'), '[REDACTED]');
  assert.equal(redact('https://['), '[REDACTED URL]');
});

test('positive: durable append is ordered, idempotent, readable from another store and safe under concurrent writers', async (t) => {
  const ws = await center(t);
  const first = fact();
  const record = await ws.store.append(first);
  assert.equal((await ws.store.append(first)).sequence, record.sequence);
  const other = createStore(ws.directory);
  await Promise.all(Array.from({ length: 8 }, (_, index) => (index % 2 ? other : ws.store).append(fact())));
  const saved = await ws.store.read();
  assert.deepEqual(saved.map((entry) => entry.sequence), Array.from({ length: 9 }, (_, index) => index + 1));
  assert.deepEqual(await ws.store.read(), saved);
  assert.deepEqual(await other.read(), saved);
  assert.ok(saved.every((entry) => entry.recorded_at.endsWith('Z')));
});

test('negative: a reused ID with changed content cannot overwrite evidence', async (t) => {
  const ws = await center(t);
  const event = fact();
  await ws.store.append(event);
  await assert.rejects(ws.store.append({ ...event, message: 'Changed assertion' }), /different content/);
  await assert.rejects(ws.store.append({ ...fact(), factory_id: 'beta' }), /different Factory/);
  assert.equal((await ws.store.read()).length, 1);
});

for (const [name, content] of [
  ['truncated final record', '{"partial":true}'],
  ['malformed record', 'not JSON\n'],
  ['skipped sequence', JSON.stringify({ ...records([fact()])[0], sequence: 2 }) + '\n'],
]) {
  test(`negative: ${name} fails visibly without skipping records`, async (t) => {
    const ws = await center(t);
    await writeFile(ws.path('events.jsonl'), content);
    await assert.rejects(ws.store.read(), /incomplete|invalid record/);
  });
}

test('negative: duplicate journal IDs fail even when sequence numbers are contiguous', async (t) => {
  const ws = await center(t);
  const [event] = records([fact()]);
  await writeFile(ws.path('events.jsonl'), `${JSON.stringify(event)}\n${JSON.stringify({ ...event, sequence: 2 })}\n`);
  await assert.rejects(ws.store.read(), /invalid record/);
});

test('negative: non-file and oversized journals are not read or silently truncated', async (t) => {
  const ws = await center(t);
  await truncate(ws.path('events.jsonl'), MAX_JOURNAL_BYTES + 1);
  await assert.rejects(ws.store.read(), /32 MiB/);
  await rm(ws.path('events.jsonl'));
  await mkdir(ws.path('events.jsonl'));
  await assert.rejects(ws.store.read(), /regular files/);
});

test('negative: a held writer lock is reported and never broken automatically', async (t) => {
  const ws = await center(t);
  await writeFile(ws.path('.write.lock'), 'writer ownership');
  await assert.rejects(ws.store.append(fact()), /locked/);
  assert.equal(await readFile(ws.path('.write.lock'), 'utf8'), 'writer ownership');
});

test('positive: valid inbox facts persist before acknowledgement and ignored inbox directories can be recreated', async (t) => {
  const ws = await center(t);
  await rm(ws.path('inbox'), { recursive: true });
  assert.deepEqual(await ws.store.drain(), []);
  const input = fact();
  await writeFile(ws.path(join('inbox', 'event-1.json')), JSON.stringify(input));
  assert.deepEqual(await ws.store.drain(), []);
  assert.equal((await ws.store.read()).length, 1);
  await assert.rejects(readFile(ws.path(join('inbox', 'event-1.json'))), { code: 'ENOENT' });
  assert.equal((await ws.store.coverage()).bound_sessions, 1);
});

test('negative: rejected, malformed, oversized and unsafe inbox entries remain visible and never leak contents', async (t) => {
  const ws = await center(t);
  await writeFile(ws.path(join('inbox', 'invalid.json')), '{"secret":"DO-NOT-PRINT"');
  await writeFile(ws.path(join('inbox', '.unsafe.json')), '{}');
  await writeFile(ws.path(join('inbox', 'huge.json')), 'x'.repeat(MAX_EVENT_BYTES + 1));
  await mkdir(ws.path(join('inbox', 'directory.json')));
  const errors = await ws.store.drain();
  assert.equal(errors.length, 4);
  assert.ok(!JSON.stringify(errors).includes('DO-NOT-PRINT'));
  assert.equal((await ws.store.read()).length, 0);
});

test('negative: a missing journal during inbox drain is an I/O gap, not a successful empty read', async (t) => {
  const ws = await center(t);
  await writeFile(ws.path(join('inbox', 'event.json')), JSON.stringify(fact()));
  await rm(ws.path('events.jsonl'));
  assert.match((await ws.store.drain())[0].error, /I\/O failed/);
});

test('positive: bounded inbox batches retain backlog and drain it on subsequent passes', async (t) => {
  const ws = await center(t);
  await Promise.all(Array.from({ length: 102 }, (_, index) => writeFile(ws.path(join('inbox', `event-${index}.json`)), JSON.stringify(fact()))));
  assert.ok((await ws.store.drain()).some((error) => error.error.includes('100 pending')));
  assert.equal((await ws.store.read()).length, 100);
  assert.deepEqual(await ws.store.drain(), []);
  assert.equal((await ws.store.read()).length, 102);
});

test('negative: wrong configuration identity, label, threshold, version, time and layout fail explicitly', async (t) => {
  const ws = await center(t);
  for (const patch of [
    { version: 2 }, { runtime_version: '999' }, { factory_id: '../alpha' }, { label: '' },
    { stale_after_ms: 0 }, { created_at: 'yesterday' }, { extra: true },
  ]) {
    await writeFile(ws.path('center.json'), JSON.stringify({ ...ws.config, ...patch }));
    assert.throws(() => createStore(ws.directory));
  }
  await writeFile(ws.path('center.json'), JSON.stringify(ws.config));
  const elsewhere = join(ws.root, 'elsewhere');
  await mkdir(elsewhere);
  await writeFile(join(elsewhere, 'center.json'), JSON.stringify(ws.config));
  assert.throws(() => loadConfig(elsewhere), /product-owned/);
});

test('negative: malformed capture registry is not treated as verified source coverage', async (t) => {
  const ws = await center(t);
  await writeFile(join(ws.base, 'registry.json'), JSON.stringify({ version: 2, factories: {} }));
  await assert.rejects(ws.store.coverage(), /invalid/);
});
