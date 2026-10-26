import assert from 'node:assert/strict';
import test from 'node:test';
import { analytics, eventPage, matching, overview, parseQuery, readModel } from '../../skills/factory-observability/scripts/runtime/query.mjs';
import { center, fact, fixedNow, records } from './observability-helpers.mjs';

const config = { factory_id: 'alpha', label: 'Synthetic verification', stale_after_ms: 60_000 };
const item = (id, state) => ({ id, type: 'card', title: `Synthetic ${id}`, ...(state ? { state } : {}) });
const events = () => records([
  fact('agent.started'),
  fact('skill.started', { skill: 'fullstack-empirical-done' }),
  fact('item.created', { item: item('CARD-1', 'todo'), occurred_at: '2026-10-23T11:00:00Z' }),
  fact('item.blocked', { item: item('CARD-1', 'blocked'), severity: 'warning', occurred_at: '2026-10-23T11:30:00Z' }),
  fact('item.completed', { item: item('CARD-1'), occurred_at: '2026-10-23T11:59:00Z' }),
  fact('skill.completed', { skill: 'fullstack-empirical-done', duration_ms: 100 }),
  fact('agent.completed'),
  fact('agent.failed', { agent: { id: 'worker-2', role: 'VOC' } }),
]);

for (const [name, input] of [
  ['unknown filters', { execute: true }], ['inherited names', { constructor: 'bad' }],
  ['duplicate query keys', new URLSearchParams('limit=1&limit=2')], ['negative cursor', { after: -1 }],
  ['fractional limit', { limit: 1.1 }], ['non-number limit', { limit: false }],
  ['too large limit', { limit: 501 }], ['zero limit', { limit: 0 }], ['unsafe cursor integer', { after: '9007199254740992' }],
  ['zero before cursor', { before: 0 }], ['conflicting cursors', { after: 1, before: 3 }],
  ['bad order', { order: 'random' }], ['empty search', { q: '' }], ['oversized search', { q: 'x'.repeat(201) }],
  ['object query values', { q: {} }], ['bad severity', { severity: 'healthy' }],
  ['array arguments', []], ['string arguments', ''], ['null arguments', null],
  ['timezone-free date', { from: '2026-10-23' }],
  ['backwards time range', { from: '2026-10-23T12:00:00Z', to: '2026-10-23T11:00:00Z' }],
]) test(`negative: fact queries reject ${name}`, () => assert.throws(() => parseQuery(input)));

test('positive: exact entity, severity, time, kind and case-insensitive text filters share one model', () => {
  const data = events();
  assert.equal(matching(data, parseQuery({ agent_id: 'worker-2', severity: 'error' })).length, 1);
  assert.equal(matching(data, parseQuery({ item_id: 'CARD-1' })).length, 3);
  assert.equal(matching(data, parseQuery({ skill: 'fullstack-empirical-done' })).length, 2);
  assert.equal(matching(data, parseQuery({ q: 'voc' })).length, 1);
  assert.equal(matching(data, parseQuery({ kind: 'item.created', from: '2026-10-23T10:00:00Z', to: '2026-10-23T11:01:00Z' })).length, 1);
  assert.deepEqual(parseQuery(new URLSearchParams('limit=2&after=0&order=desc')), { limit: 2, after: 0, order: 'desc' });
});

test('positive: cursor pages are exclusive, bounded and support descending history', () => {
  const data = events();
  const first = eventPage(data, { limit: 2 });
  assert.deepEqual(first.events.map((event) => event.sequence), [1, 2]);
  assert.equal(first.next_cursor, 2);
  assert.equal(first.has_more, true);
  assert.deepEqual(eventPage(data, { after: first.next_cursor, limit: 2 }).events.map((event) => event.sequence), [3, 4]);
  const latest = eventPage(data, { order: 'desc', limit: 2 });
  assert.deepEqual(latest.events.map((event) => event.sequence), [8, 7]);
  assert.deepEqual(eventPage(data, { order: 'desc', before: latest.next_cursor, limit: 2 }).events.map((event) => event.sequence), [6, 5]);
  assert.equal(eventPage([], {}).next_cursor, 0);
  assert.equal(eventPage(data, { after: 8 }).has_more, false);
});

test('negative: cursors cannot silently traverse a different or reset Factory journal', () => {
  assert.throws(() => eventPage(events(), { after: 100 }), /beyond/);
  assert.throws(() => eventPage(events(), { before: 100 }), /beyond/);
});

test('positive: overview exposes observed entities and source freshness without inventing agent identities', () => {
  const snapshot = overview(events(), config, { coverage: { bound_sessions: 2 }, now: fixedNow });
  assert.equal(snapshot.counts.agents, 2);
  assert.equal(snapshot.counts.skills, 1);
  assert.equal(snapshot.counts.items, 1);
  assert.equal(snapshot.counts.errors, 1);
  assert.equal(snapshot.agents[0].state, 'completed');
  assert.equal(snapshot.items[0].state, 'completed');
  assert.equal(snapshot.freshness.state, 'recent');
  assert.equal(snapshot.coverage.host_hooks, 'configured-not-observed');
  assert.equal(snapshot.latest_events[0].sequence, 8);
});

test('negative: center installation, late imports and server uptime never fake fresh Factory progress', () => {
  const data = records([fact('center.installed', { agent: undefined }), fact('capture.gap', { agent: undefined })]);
  const empty = overview(data, config, { now: fixedNow });
  assert.equal(empty.freshness.state, 'unknown');
  assert.equal(empty.coverage.host_hooks, 'unbound');
  assert.equal(empty.coverage.gap_events, 1);
  const late = records([
    fact('agent.completed', { occurred_at: '2020-01-01T00:00:00Z' }),
    fact('agent.started', { occurred_at: '2019-01-01T00:00:00Z', source: { kind: 'import', ref: 'authorized-export' } }),
  ]);
  const snapshot = overview(late, config, { now: fixedNow });
  assert.equal(snapshot.agents[0].state, 'completed');
  assert.equal(snapshot.freshness.state, 'stale');
  assert.equal(snapshot.freshness.last_source_at, '2020-01-01T00:00:00.000Z');
});

test('negative: tool metadata does not prove an agent or skill completed its assignment', () => {
  const data = records([
    fact('tool.observed', { agent: undefined, source: { kind: 'host-hook', ref: 'actual-host-id' } }),
    fact('skill.loaded', { skill: 'fullstack-empirical-done' }),
    fact('agent.returned'),
    fact('item.created', { item: item('CARD-1', 'todo') }),
    fact('item.updated', { item: item('CARD-1') }),
  ]);
  const snapshot = overview(data, config, { now: fixedNow });
  assert.equal(snapshot.skills[0].loaded, 1);
  assert.equal(snapshot.skills[0].completed, 0);
  assert.equal(snapshot.agents[0].state, 'returned');
  assert.equal(snapshot.items[0].state, 'todo');
  assert.equal(snapshot.coverage.unattributed_events, 1);
  assert.equal(snapshot.coverage.host_hooks, 'observed');
});

test('positive: analytics uses real reported counts, equal buckets and matched lead time with sample size', () => {
  const data = analytics(events(), config, {}, fixedNow);
  assert.equal(data.counts.events, 8);
  assert.equal(data.counts.errors, 1);
  assert.equal(data.counts.reported_completions, 1);
  assert.equal(data.lead_time.median_ms, 59 * 60_000);
  assert.equal(data.lead_time.sample_size, 1);
  assert.equal(data.buckets.reduce((sum, bucket) => sum + bucket.events, 0), 8);
  assert.equal(data.buckets.reduce((sum, bucket) => sum + bucket.errors, 0), 1);
  assert.ok(data.by_role.some((entry) => entry.name === 'VOC'));
  assert.ok(data.by_skill.some((entry) => entry.name === 'fullstack-empirical-done'));
  assert.ok(data.insights.some((entry) => entry.level === 'error'));
});

test('negative: analytics does not replace unmatched completions or absent telemetry with zero-duration or health claims', () => {
  const data = analytics(records([fact('item.completed', { item: item('CARD-2'), agent: undefined })]), config, {}, fixedNow);
  assert.equal(data.lead_time.median_ms, null);
  assert.equal(data.lead_time.sample_size, 0);
  assert.equal(data.lead_time.unmatched_completions, 1);
  assert.equal(data.by_role[0].name, 'unattributed');
  assert.ok(data.insights.some((insight) => insight.text.includes('unknown')));
  assert.ok(data.insights.some((insight) => insight.text.includes('not a health')));
  const empty = analytics([], config, {}, fixedNow);
  assert.equal(empty.counts.events, 0);
  assert.ok(empty.insights.some((insight) => insight.text.includes('not proof')));
});

test('negative: analytics rejects unbounded or inverted windows and excludes outside-window facts', () => {
  assert.throws(() => analytics(events(), config, { from: '2020-01-01T00:00:00Z' }, fixedNow), /365 days/);
  assert.throws(() => analytics(events(), config, { from: '2026-10-24T00:00:00Z' }, fixedNow), /ordered/);
  assert.equal(analytics(events(), config, { from: '2026-10-23T11:59:20Z', to: '2026-10-23T12:00:00Z' }, fixedNow).counts.reported_completions, 0);
});

test('positive: analytics accepts a 1-year window and superimposes Live and Historical stocks', () => {
  const data = analytics(events(), config, { from: '2025-10-23T12:00:00Z', facet: 'metadata' }, fixedNow);
  assert.equal(data.facet, 'metadata');
  assert.equal(data.overlay.metric, 'active_agents');
  assert.equal(data.overlay.live.buckets.length, 24);
  assert.equal(data.overlay.historical.buckets.length, 24);
  assert.equal(data.overlay.historical.snapshot.internals.squads_observed, null);
  assert.ok(data.overlay.live.buckets.every((bucket) => Number.isInteger(bucket.value)));
});

test('positive: value-stream facet overlays in-progress cards and keeps assignments evidence-backed', () => {
  const data = analytics(records([
    fact('agent.started'),
    fact('item.created', { item: item('CARD-9', 'todo'), occurred_at: '2026-10-23T11:00:00Z' }),
    fact('item.updated', { item: item('CARD-9', 'in-progress'), occurred_at: '2026-10-23T11:10:00Z' }),
  ]), config, { facet: 'value-stream' }, fixedNow);
  assert.equal(data.overlay.metric, 'in_progress_items');
  assert.equal(data.overlay.historical.snapshot.value_stream.in_progress, 1);
  assert.equal(data.overlay.historical.snapshot.value_stream.assignments[0].item_id, 'CARD-9');
});

test('negative: event pages reject a mode facet instead of ignoring it', () => {
  assert.throws(() => eventPage(events(), { facet: 'metadata' }), /facet/);
  assert.throws(() => parseQuery({ facet: 'live' }), /facet/);
});

test('positive: even matched samples use the actual median and critical facts appear in error buckets', () => {
  const data = records([
    fact('item.created', { item: item('A'), occurred_at: '2026-10-23T11:00:00Z' }),
    fact('item.completed', { item: item('A'), occurred_at: '2026-10-23T11:10:00Z', severity: 'critical' }),
    fact('item.created', { item: item('B'), occurred_at: '2026-10-23T11:00:00Z' }),
    fact('item.completed', { item: item('B'), occurred_at: '2026-10-23T11:20:00Z' }),
  ]);
  assert.equal(analytics(data, config, {}, fixedNow).lead_time.median_ms, 15 * 60_000);
  assert.equal(overview(data, config, { now: fixedNow }).counts.errors, 1);
});

test('positive: API and MCP read model drains the same inbox and exposes explicit coverage', async (t) => {
  const ws = await center(t);
  await ws.store.append(fact('item.blocked', { item: item('CARD-1', 'blocked') }));
  const model = await readModel(ws.store);
  assert.equal(model.events.length, 1);
  assert.equal(model.snapshot.counts.blocked_items, 1);
  assert.equal(model.snapshot.coverage.bound_sessions, 1);
});
