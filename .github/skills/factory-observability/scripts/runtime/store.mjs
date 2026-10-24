import { randomUUID } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { lstat, mkdir, open, readdir, readFile, stat, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export const VERSION = '1.2.0';
export const MAX_EVENT_BYTES = 16 * 1024;
export const MAX_JOURNAL_BYTES = 32 * 1024 * 1024;
export const kinds = [
  'center.installed', 'center.revalidated', 'capture.gap',
  'factory.started', 'factory.resumed', 'factory.progress', 'factory.stopped',
  'agent.started', 'agent.progress', 'agent.returned', 'agent.completed', 'agent.failed',
  'skill.requested', 'skill.loaded', 'skill.started', 'skill.completed', 'skill.failed',
  'tool.requested', 'tool.observed', 'tool.started', 'tool.completed', 'tool.failed',
  'item.created', 'item.updated', 'item.blocked', 'item.completed',
  'decision.recorded', 'evidence.recorded', 'incident.opened', 'incident.resolved',
];
export const severities = ['info', 'warning', 'error', 'critical'];
export const factoryIdPattern = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const itemStates = ['todo', 'in-progress', 'blocked', 'completed', 'generated', 'updated', 'unknown'];
export const sensitivePath = /(?:^|[\\/])(?:\.env(?:\.[^\\/]*)?|secrets?|credentials?|tokens?|[^\\/]*\.(?:pem|pfx|p12|key))(?:[\\/]|$)/i;

export class ObservationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ObservationError';
    this.status = status;
  }
}

export function requireObject(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ObservationError(`${label} must be an object`);
  if (Object.keys(value).some((key) => !fields.includes(key))) throw new ObservationError(`${label} contains unsupported fields`);
}

export function redact(value) {
  return value
    .replace(/-----BEGIN [\s\S]*?-----END [^-]+-----/g, '[REDACTED]')
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_.=~-]+/gi, '[REDACTED]')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]{12,}|AKIA[A-Z0-9]{16})\b/g, '[REDACTED]')
    .replace(/\b(password|api[_-]?key|token|secret|authorization|connection[_-]?string)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=[REDACTED]')
    .replace(/\b[a-z][a-z\d+.-]*:\/\/[^\s]+/gi, (text) => {
      try {
        const url = new URL(text);
        url.username = '';
        url.password = '';
        url.search = '';
        url.hash = '';
        return url.href;
      } catch {
        return '[REDACTED URL]';
      }
    })
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
}

function text(value, label, max = 128, pattern) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || (pattern && !pattern.test(value))) {
    throw new ObservationError(`${label} must be a non-empty string of at most ${max} characters${pattern ? ' in the documented format' : ''}`);
  }
  return redact(value.trim());
}

export function timestamp(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new ObservationError(`${label} must be an ISO 8601 timestamp with a timezone`);
  }
  const [year, month, day, hour, minute, second] = value.slice(0, 19).split(/[-T:]/).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59) {
    throw new ObservationError(`${label} contains an invalid calendar date or time`);
  }
  return new Date(value).toISOString();
}

export const eventSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Factory operational fact (emission, not authority)',
  type: 'object',
  additionalProperties: false,
  required: ['event_id', 'factory_id', 'occurred_at', 'kind', 'message', 'source'],
  properties: {
    schema_version: { const: 1 },
    event_id: { type: 'string', pattern: idPattern.source },
    factory_id: { type: 'string', pattern: factoryIdPattern.source },
    occurred_at: { type: 'string', format: 'date-time' },
    kind: { enum: kinds },
    severity: { enum: severities },
    message: { type: 'string', minLength: 1, maxLength: 500 },
    agent: {
      type: 'object', additionalProperties: false, required: ['id', 'role'],
      properties: { id: { type: 'string', pattern: idPattern.source }, role: { type: 'string', minLength: 1, maxLength: 64 } },
    },
    skill: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,99}$' },
    item: {
      type: 'object', additionalProperties: false, required: ['id', 'type', 'title'],
      properties: {
        id: { type: 'string', minLength: 1, maxLength: 256 },
        type: { enum: ['card', 'artifact', 'increment', 'research', 'decision'] },
        title: { type: 'string', minLength: 1, maxLength: 200 },
        state: { enum: itemStates },
      },
    },
    source: {
      type: 'object', additionalProperties: false, required: ['kind', 'ref'],
      properties: {
        kind: { enum: ['agent-report', 'host-hook', 'import'] },
        ref: { type: 'string', minLength: 1, maxLength: 256 },
        revision: { type: ['string', 'null'], maxLength: 128 },
      },
    },
    correlation_id: { type: 'string', pattern: idPattern.source },
    trace_id: { type: 'string', pattern: '^(?!0+$)[a-f0-9]{32}$' },
    span_id: { type: 'string', pattern: '^(?!0+$)[a-f0-9]{16}$' },
    duration_ms: { type: 'number', minimum: 0, maximum: 2592000000 },
    tool: { type: 'string', minLength: 1, maxLength: 128 },
  },
  allOf: [
    ...['agent', 'skill', 'item'].map((field) => ({
      if: { properties: { kind: { pattern: `^${field}\\.` } } },
      then: { required: [field] },
    })),
    { if: { required: ['span_id'] }, then: { required: ['trace_id'] } },
  ],
};

export function normalizeEvent(input, factoryId, now = Date.now()) {
  requireObject(input, Object.keys(eventSchema.properties), 'event');
  if (input.schema_version !== undefined && input.schema_version !== 1) throw new ObservationError('Unsupported event schema_version');
  if (input.factory_id !== factoryId) throw new ObservationError('Event belongs to a different Factory');
  if (!kinds.includes(input.kind)) throw new ObservationError('Unsupported event kind');
  if (input.severity !== undefined && !severities.includes(input.severity)) throw new ObservationError('Unsupported severity');
  const occurredAt = timestamp(input.occurred_at, 'occurred_at');
  if (Date.parse(occurredAt) > now + 300_000) throw new ObservationError('occurred_at is more than five minutes in the future');
  requireObject(input.source, ['kind', 'ref', 'revision'], 'source');
  if (!['agent-report', 'host-hook', 'import'].includes(input.source.kind)) throw new ObservationError('Unsupported source kind');
  if (sensitivePath.test(input.source.ref)) throw new ObservationError('Sensitive source references are not accepted');
  const event = {
    schema_version: 1,
    event_id: text(input.event_id, 'event_id', 128, idPattern),
    factory_id: factoryId,
    occurred_at: occurredAt,
    kind: input.kind,
    severity: input.severity ?? (/\.(failed)$/.test(input.kind) ? 'error' : 'info'),
    message: text(input.message, 'message', 500),
    source: {
      kind: input.source.kind,
      ref: text(input.source.ref, 'source.ref', 256),
      revision: input.source.revision == null ? null : text(input.source.revision, 'source.revision'),
    },
  };
  if (input.agent !== undefined) {
    requireObject(input.agent, ['id', 'role'], 'agent');
    event.agent = { id: text(input.agent.id, 'agent.id', 128, idPattern), role: text(input.agent.role, 'agent.role', 64) };
  }
  if (input.skill !== undefined) event.skill = text(input.skill, 'skill', 100, /^[a-z0-9][a-z0-9-]{0,99}$/);
  if (input.item !== undefined) {
    requireObject(input.item, ['id', 'type', 'title', 'state'], 'item');
    if (!eventSchema.properties.item.properties.type.enum.includes(input.item.type)) throw new ObservationError('Unsupported item type');
    if (input.item.state !== undefined && !itemStates.includes(input.item.state)) throw new ObservationError('Unsupported item state');
    if (sensitivePath.test(input.item.id)) throw new ObservationError('Sensitive item paths are not accepted');
    event.item = {
      id: text(input.item.id, 'item.id', 256), type: input.item.type,
      title: text(input.item.title, 'item.title', 200), state: input.item.state ?? 'unknown',
    };
  }
  for (const field of ['agent', 'skill', 'item']) {
    if (event.kind.startsWith(`${field}.`) && !event[field]) throw new ObservationError(`${field} is required for this event kind`);
  }
  if (input.correlation_id !== undefined) event.correlation_id = text(input.correlation_id, 'correlation_id', 128, idPattern);
  for (const [field, length] of [['trace_id', 32], ['span_id', 16]]) {
    if (input[field] !== undefined) {
      if (typeof input[field] !== 'string' || !new RegExp(`^(?!0+$)[a-f0-9]{${length}}$`).test(input[field])) throw new ObservationError(`Invalid ${field}`);
      event[field] = input[field];
    }
  }
  if (event.span_id && !event.trace_id) throw new ObservationError('span_id requires trace_id');
  if (input.duration_ms !== undefined) {
    if (!Number.isFinite(input.duration_ms) || input.duration_ms < 0 || input.duration_ms > 2_592_000_000) throw new ObservationError('Invalid duration_ms');
    event.duration_ms = input.duration_ms;
  }
  if (input.tool !== undefined) event.tool = text(input.tool, 'tool');
  if (Buffer.byteLength(JSON.stringify(event)) > MAX_EVENT_BYTES) throw new ObservationError('Event exceeds the byte limit', 413);
  return event;
}

export function normalizeConfig(config) {
  requireObject(config, ['version', 'runtime_version', 'factory_id', 'label', 'created_at', 'stale_after_ms'], 'center config');
  if (config.version !== 1 || config.runtime_version !== VERSION || !factoryIdPattern.test(config.factory_id)) throw new ObservationError('Unsupported center configuration');
  if (typeof config.label !== 'string' || !config.label.trim() || config.label.length > 100) throw new ObservationError('Invalid Factory label');
  timestamp(config.created_at, 'created_at');
  if (!Number.isInteger(config.stale_after_ms) || config.stale_after_ms < 1000 || config.stale_after_ms > 86_400_000) throw new ObservationError('Invalid freshness threshold');
  return { ...config, label: redact(config.label) };
}

export function loadConfig(directory) {
  const config = normalizeConfig(JSON.parse(readFileSync(join(directory, 'center.json'), 'utf8')));
  const actual = realpathSync(directory);
  if (basename(actual) !== config.factory_id || basename(dirname(actual)) !== 'observability' || basename(dirname(dirname(actual))) !== '.factory') {
    throw new ObservationError('Center must live in the product-owned .factory/observability/<factory-id> directory');
  }
  return config;
}

export function newFact(factoryId, kind, message, extra = {}) {
  return {
    event_id: randomUUID(), factory_id: factoryId, occurred_at: new Date().toISOString(),
    kind, message, source: { kind: 'agent-report', ref: 'explicit-emission' }, ...extra,
  };
}

export function createStore(directory) {
  const config = loadConfig(directory);
  const journal = join(directory, 'events.jsonl');
  let cache = null;
  let signature = null;

  async function regularFile(path) {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new ObservationError('Operational records must be regular files, not links', 503);
    return info;
  }

  async function read({ reload = false } = {}) {
    const info = await regularFile(journal);
    if (info.size > MAX_JOURNAL_BYTES) throw new ObservationError('Journal exceeds 32 MiB; archive under the product retention policy before resuming capture', 503);
    const nextSignature = `${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
    if (!reload && signature === nextSignature) return cache;
    const content = await readFile(journal, 'utf8');
    if (content && !content.endsWith('\n')) throw new ObservationError('Journal has an incomplete final record; preserve it and repair explicitly', 503);
    const ids = new Set();
    const events = content === '' ? [] : content.slice(0, -1).split('\n').map((line, index) => {
      try {
        const raw = JSON.parse(line);
        const { sequence, recorded_at: recordedAt, ...input } = raw;
        const event = normalizeEvent(input, config.factory_id);
        if (sequence !== index + 1 || ids.has(event.event_id)) throw new Error('Sequence or identity conflict');
        ids.add(event.event_id);
        return { ...event, sequence, recorded_at: timestamp(recordedAt, 'recorded_at') };
      } catch {
        throw new ObservationError(`Journal contains an invalid record at line ${index + 1}; no records were skipped`, 503);
      }
    });
    cache = events;
    signature = nextSignature;
    return events;
  }

  async function append(input) {
    const event = normalizeEvent(input, config.factory_id);
    const lockPath = join(directory, '.write.lock');
    const deadline = Date.now() + 2000;
    let lock;
    while (!lock) {
      try {
        lock = await open(lockPath, 'wx');
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if (Date.now() >= deadline) throw new ObservationError('Event writer is locked; inspect the writer before recovering a stale lock', 503);
        await new Promise((done) => setTimeout(done, 20));
      }
    }
    try {
      const events = await read({ reload: true });
      const existing = events.find((entry) => entry.event_id === event.event_id);
      if (existing) {
        const { sequence, recorded_at: recordedAt, ...original } = existing;
        if (JSON.stringify(original) !== JSON.stringify(event)) throw new ObservationError('event_id already exists with different content', 409);
        return existing;
      }
      const record = { ...event, sequence: events.length + 1, recorded_at: new Date().toISOString() };
      const line = `${JSON.stringify(record)}\n`;
      if ((await stat(journal)).size + Buffer.byteLength(line) > MAX_JOURNAL_BYTES) throw new ObservationError('Journal reached 32 MiB; archive under the product retention policy before resuming capture', 503);
      const handle = await open(journal, 'a');
      try {
        await handle.writeFile(line);
        await handle.sync();
      } finally {
        await handle.close();
      }
      signature = null;
      return record;
    } finally {
      await lock.close();
      await unlink(lockPath);
    }
  }

  async function drain() {
    const inbox = join(directory, 'inbox');
    try { await mkdir(inbox); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    const info = await lstat(inbox);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new ObservationError('Inbox must be a product-owned directory, not a link', 503);
    const errors = [];
    const files = (await readdir(inbox)).sort();
    for (const name of files.slice(0, 100)) {
      const path = join(inbox, name);
      try {
        if (!/^[A-Za-z0-9_-]{1,128}\.json$/.test(name)) throw new ObservationError('Inbox filenames must be safe event IDs followed by .json');
        if ((await regularFile(path)).size > MAX_EVENT_BYTES) throw new ObservationError('Inbox event exceeds the byte limit');
        let input;
        try { input = JSON.parse(await readFile(path, 'utf8')); }
        catch (error) {
          if (error instanceof SyntaxError) throw new ObservationError('Inbox event is not valid JSON');
          throw error;
        }
        await append(input);
        await unlink(path);
      } catch (error) {
        // Concurrent HTTP/MCP readers may have drained the same acknowledged file.
        if (!(error.code === 'ENOENT' && error.path === path)) errors.push({ file: redact(name.slice(0, 140)), error: error instanceof ObservationError ? error.message : 'Inbox I/O failed; inspect local filesystem permissions' });
      }
    }
    if (files.length > 100) errors.push({ file: 'inbox', error: 'More than 100 pending emissions; remaining files will be processed on the next pass' });
    return errors;
  }

  async function coverage() {
    const registry = JSON.parse(await readFile(join(dirname(directory), 'registry.json'), 'utf8'));
    const sessions = registry.factories?.[config.factory_id]?.sessions;
    if (registry.version !== 1 || !Array.isArray(sessions) || sessions.some((id) => typeof id !== 'string' || !idPattern.test(id)) ||
        new Set(sessions).size !== sessions.length) throw new ObservationError('Factory capture registry is invalid', 503);
    return { bound_sessions: sessions.length, session_ids: sessions.map(redact) };
  }

  return { config, directory, read, append, drain, coverage };
}
