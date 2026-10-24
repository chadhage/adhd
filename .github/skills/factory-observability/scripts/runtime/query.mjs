import { ObservationError, requireObject, severities, timestamp } from './store.mjs';

export const queryProperties = {
  after: { type: 'integer', minimum: 0 },
  before: { type: 'integer', minimum: 1 },
  order: { enum: ['asc', 'desc'] },
  limit: { type: 'integer', minimum: 1, maximum: 500 },
  agent_id: { type: 'string', minLength: 1, maxLength: 128 },
  skill: { type: 'string', minLength: 1, maxLength: 100 },
  item_id: { type: 'string', minLength: 1, maxLength: 256 },
  kind: { type: 'string', minLength: 1, maxLength: 64 },
  severity: { enum: severities },
  q: { type: 'string', minLength: 1, maxLength: 200 },
  from: { type: 'string', format: 'date-time' },
  to: { type: 'string', format: 'date-time' },
};

export function parseQuery(input = {}) {
  if (!(input instanceof URLSearchParams)) requireObject(input, Object.keys(queryProperties), 'query');
  const entries = input instanceof URLSearchParams ? [...input.entries()] : Object.entries(input);
  const result = {};
  for (const [key, value] of entries) {
    if (!Object.hasOwn(queryProperties, key) || Object.hasOwn(result, key)) throw new ObservationError('Unsupported or duplicate query parameter');
    if (['after', 'before', 'limit'].includes(key)) {
      if (!/^\d+$/.test(String(value)) || !['string', 'number'].includes(typeof value)) throw new ObservationError(`${key} must be an integer`);
      result[key] = Number(value);
      if (!Number.isSafeInteger(result[key]) || result[key] < (key === 'after' ? 0 : 1) || (key === 'limit' && result[key] > 500)) throw new ObservationError(`${key} is outside the supported range`);
    } else if (key === 'from' || key === 'to') {
      result[key] = timestamp(value, key);
    } else {
      if (typeof value !== 'string' || !value.trim() || value.length > (queryProperties[key].maxLength ?? 128)) throw new ObservationError(`Invalid ${key} filter`);
      result[key] = value.trim();
    }
  }
  if (result.severity && !severities.includes(result.severity)) throw new ObservationError('Invalid severity filter');
  if (result.order && !['asc', 'desc'].includes(result.order)) throw new ObservationError('Invalid event order');
  if (result.after !== undefined && result.before !== undefined) throw new ObservationError('Use either after or before, not both');
  if (result.from && result.to && result.from > result.to) throw new ObservationError('from must not be after to');
  return result;
}

export function matching(events, query) {
  return events.filter((event) =>
    (!query.agent_id || event.agent?.id === query.agent_id) &&
    (!query.skill || event.skill === query.skill) &&
    (!query.item_id || event.item?.id === query.item_id) &&
    (!query.kind || event.kind === query.kind) &&
    (!query.severity || event.severity === query.severity) &&
    (!query.from || event.occurred_at >= query.from) &&
    (!query.to || event.occurred_at <= query.to) &&
    (!query.q || [event.message, event.kind, event.agent?.id, event.agent?.role, event.skill, event.item?.id, event.item?.title, event.tool].filter(Boolean).join(' ').toLowerCase().includes(query.q.toLowerCase())),
  );
}

export function eventPage(events, query) {
  const after = query.after ?? 0;
  const lastSequence = events.at(-1)?.sequence ?? 0;
  if (after > lastSequence) throw new ObservationError('Cursor is beyond this Factory journal; reconnect using its current snapshot');
  if (query.before !== undefined && query.before > lastSequence + 1) throw new ObservationError('Cursor is beyond this Factory journal');
  const candidates = matching(events, query).filter((event) => event.sequence > after && (query.before === undefined || event.sequence < query.before));
  if (query.order === 'desc') candidates.reverse();
  const page = candidates.slice(0, query.limit ?? 100);
  return { events: page, next_cursor: page.at(-1)?.sequence ?? after, has_more: candidates.length > page.length, last_sequence: lastSequence };
}

const countBy = (events, key) => {
  const counts = new Map();
  for (const event of events) {
    const value = key(event);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};

export function overview(events, config, { errors = [], coverage = { bound_sessions: 0 }, now = Date.now() } = {}) {
  const agents = new Map();
  const skills = new Map();
  const items = new Map();
  const ordered = [...events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.sequence - b.sequence);
  for (const event of ordered) {
    if (event.agent) {
      const agent = agents.get(event.agent.id) ?? { id: event.agent.id, role: event.agent.role, state: 'unknown', events: 0 };
      agent.role = event.agent.role;
      agent.events += 1;
      agent.last_seen = event.occurred_at;
      if (event.kind.startsWith('agent.')) agent.state = ({ started: 'active', progress: 'active', returned: 'returned', completed: 'completed', failed: 'failed' })[event.kind.split('.')[1]];
      agents.set(agent.id, agent);
    }
    if (event.skill) {
      const skill = skills.get(event.skill) ?? { name: event.skill, requested: 0, loaded: 0, started: 0, completed: 0, failed: 0 };
      if (event.kind.startsWith('skill.')) skill[event.kind.split('.')[1]] += 1;
      skill.last_seen = event.occurred_at;
      skills.set(skill.name, skill);
    }
    if (event.item) {
      const item = items.get(event.item.id) ?? { ...event.item, events: 0 };
      const state = event.kind === 'item.completed' ? 'completed' : event.kind === 'item.blocked' ? 'blocked' : event.item.state;
      Object.assign(item, event.item, { state: state === 'unknown' ? item.state : state, last_seen: event.occurred_at, events: item.events + 1 });
      items.set(item.id, item);
    }
  }
  const facts = ordered.filter((event) => !event.kind.startsWith('center.') && event.kind !== 'capture.gap');
  const lastFact = facts.at(-1);
  const age = lastFact ? Math.max(0, now - Date.parse(lastFact.occurred_at)) : null;
  const lastHost = ordered.filter((event) => event.source.kind === 'host-hook').at(-1);
  return {
    factory: { id: config.factory_id, label: config.label },
    observed_at: new Date(now).toISOString(),
    last_sequence: events.at(-1)?.sequence ?? 0,
    freshness: {
      state: age === null ? 'unknown' : age > config.stale_after_ms ? 'stale' : 'recent',
      age_ms: age, threshold_ms: config.stale_after_ms,
      last_source_at: lastFact?.occurred_at ?? null,
      last_collected_at: events.at(-1)?.recorded_at ?? null,
    },
    coverage: {
      ...coverage,
      host_hooks: lastHost ? 'observed' : coverage.bound_sessions ? 'configured-not-observed' : 'unbound',
      last_host_fact_at: lastHost?.occurred_at ?? null,
      gap_events: events.filter((event) => event.kind === 'capture.gap').length,
      unattributed_events: facts.filter((event) => !event.agent).length,
      ingestion_errors: errors,
      claim: 'Observed emissions only. Completeness, authority, and product acceptance are not inferred.',
    },
    counts: {
      events: events.length, agents: agents.size, skills: skills.size, items: items.size,
      errors: events.filter((event) => ['error', 'critical'].includes(event.severity)).length,
      blocked_items: [...items.values()].filter((item) => item.state === 'blocked').length,
    },
    agents: [...agents.values()],
    skills: [...skills.values()],
    items: [...items.values()],
    latest_events: events.slice(-100).reverse(),
  };
}

export function analytics(events, config, query = {}, now = Date.now()) {
  if (['after', 'before', 'limit', 'order'].some((key) => query[key] !== undefined)) throw new ObservationError('Analytics does not accept event pagination parameters');
  const to = query.to ? Date.parse(query.to) : now;
  const from = query.from ? Date.parse(query.from) : to - 86_400_000;
  if (from > to || to - from > 31 * 86_400_000) throw new ObservationError('Analytics window must be ordered and at most 31 days');
  const selected = matching(events, { ...query, from: new Date(from).toISOString(), to: new Date(to).toISOString() });
  const buckets = Array.from({ length: 24 }, (_, index) => ({
    from: new Date(from + (to - from) * index / 24).toISOString(), events: 0, errors: 0,
  }));
  for (const event of selected) {
    const index = Math.min(23, Math.floor((Date.parse(event.occurred_at) - from) / Math.max(1, (to - from) / 24)));
    buckets[index].events += 1;
    if (['error', 'critical'].includes(event.severity)) buckets[index].errors += 1;
  }
  const failures = selected.filter((event) => ['error', 'critical'].includes(event.severity)).length;
  const completions = selected.filter((event) => event.kind === 'item.completed');
  const leadTimes = [];
  for (const completion of completions) {
    const creation = events.filter((event) => event.kind === 'item.created' && event.item.id === completion.item.id && event.occurred_at <= completion.occurred_at)
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))[0];
    if (creation) leadTimes.push(Date.parse(completion.occurred_at) - Date.parse(creation.occurred_at));
  }
  leadTimes.sort((a, b) => a - b);
  const median = leadTimes.length ? (leadTimes[Math.floor((leadTimes.length - 1) / 2)] + leadTimes[Math.floor(leadTimes.length / 2)]) / 2 : null;
  const state = overview(events, config, { now });
  const insights = [];
  if (!selected.length) insights.push({ level: 'warning', text: 'No emitted facts in this window. Empty telemetry is not proof of an idle or healthy Factory.' });
  if (failures) insights.push({ level: 'error', text: `${failures} error/critical facts in this window. Inspect their source evidence; no cause is inferred.` });
  if (state.freshness.state !== 'recent') insights.push({ level: 'warning', text: 'Factory telemetry is stale or unknown. The center being online does not prove Factory progress.' });
  if (!selected.some((event) => event.kind.startsWith('skill.'))) insights.push({ level: 'warning', text: 'No skill lifecycle emissions in this window. Tool calls alone do not establish skill execution or outcome.' });
  if (completions.length > leadTimes.length) insights.push({ level: 'warning', text: `${completions.length - leadTimes.length} completion reports have no matching creation timestamp; their lead time is unknown.` });
  if (!failures && selected.length) insights.push({ level: 'info', text: 'No error/critical facts reported in this window. This is not a health or quality certification.' });
  return {
    factory_id: config.factory_id, window: { from: new Date(from).toISOString(), to: new Date(to).toISOString() },
    counts: { events: selected.length, errors: failures, reported_completions: completions.length },
    lead_time: { sample_size: leadTimes.length, median_ms: median, unmatched_completions: completions.length - leadTimes.length },
    buckets,
    by_kind: countBy(selected, (event) => event.kind),
    by_role: countBy(selected, (event) => event.agent?.role ?? 'unattributed'),
    by_skill: countBy(selected.filter((event) => event.skill), (event) => event.skill),
    insights,
    limitations: 'Descriptive emitted facts, not causal inference, agent utilization, verified Done Done, or realized customer value.',
  };
}

export async function readModel(store) {
  const errors = await store.drain();
  const events = await store.read();
  const coverage = await store.coverage();
  return { events, snapshot: overview(events, store.config, { errors, coverage }) };
}
