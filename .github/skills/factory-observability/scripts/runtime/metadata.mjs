import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MAX_EVENT_BYTES, MAX_JOURNAL_BYTES, ObservationError, redact, requireObject, sensitivePath, timestamp } from './store.mjs';
import { MAX_ARTIFACT_BYTES, MAX_CATALOG_BYTES, MAX_PREVIEW_BYTES } from './artifacts.mjs';

export const MAX_PROFILE_BYTES = 16 * 1024;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const groups = {
  product: ['name', 'repository', 'workspace', 'branch'],
  owners: ['factory', 'product', 'operations'],
  governance: ['engagement_id', 'contract_ref', 'charter_ref', 'board_ref', 'operating_window', 'resource_limits', 'retention_policy_ref'],
  source: ['ref', 'revision'],
};

function optionalText(value, label, maximum = 512) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new ObservationError(`${label} must be null or a non-empty string of at most ${maximum} characters`);
  if (sensitivePath.test(value)) throw new ObservationError(`${label} cannot reference a sensitive path`);
  const result = redact(value.trim());
  if (!result.trim()) throw new ObservationError(`${label} has no printable content`);
  return result;
}

function list(value, label, convert) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100) throw new ObservationError(`${label} must be an array of at most 100 entries`);
  const result = value.map(convert);
  const ids = result.map((entry) => typeof entry === 'string' ? entry : entry.id);
  if (new Set(ids).size !== ids.length) throw new ObservationError(`${label} contains duplicate identities`);
  return result;
}

export function normalizeProfile(input, factoryId, now = Date.now()) {
  requireObject(input, ['version', 'factory_id', 'mission', 'product', 'owners', 'governance', 'roster', 'source', 'updated_at'], 'Factory profile');
  if (input.version !== 1) throw new ObservationError('Unsupported Factory profile version');
  if (input.factory_id !== factoryId) throw new ObservationError('Profile belongs to a different Factory');
  const result = { version: 1, factory_id: factoryId, mission: optionalText(input.mission, 'mission', 1000) };
  for (const [name, fields] of Object.entries(groups)) {
    const group = input[name] === undefined ? {} : input[name];
    requireObject(group, fields, `profile.${name}`);
    result[name] = Object.fromEntries(fields.map((field) => [field, optionalText(group[field], `${name}.${field}`)]));
  }
  const roster = input.roster === undefined ? {} : input.roster;
  requireObject(roster, ['agents', 'skills', 'squads'], 'profile.roster');
  result.roster = {
    agents: list(roster.agents, 'roster.agents', (agent) => {
      requireObject(agent, ['id', 'role', 'assignment'], 'roster agent');
      if (typeof agent.id !== 'string' || !idPattern.test(agent.id) || redact(agent.id) !== agent.id) throw new ObservationError('Roster agent ID is invalid');
      const role = optionalText(agent.role, 'roster agent role', 64);
      if (!role) throw new ObservationError('Roster agent role is required');
      return { id: agent.id, role, assignment: optionalText(agent.assignment, 'roster agent assignment') };
    }),
    skills: list(roster.skills, 'roster.skills', (skill) => {
      if (typeof skill !== 'string' || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(skill) || redact(skill) !== skill) throw new ObservationError('Roster skill name is invalid');
      return skill;
    }),
    squads: list(roster.squads, 'roster.squads', (squad) => {
      if (typeof squad !== 'string' || !idPattern.test(squad) || redact(squad) !== squad) throw new ObservationError('Roster squad ID is invalid');
      return squad;
    }),
  };
  result.updated_at = input.updated_at == null ? null : timestamp(input.updated_at, 'profile.updated_at');
  if (result.updated_at && Date.parse(result.updated_at) > now + 300_000) throw new ObservationError('profile.updated_at is more than five minutes in the future');
  if (Buffer.byteLength(JSON.stringify(result)) > MAX_PROFILE_BYTES) throw new ObservationError('Factory profile exceeds 16 KiB', 413);
  return result;
}

export async function readProfile(path, factoryId, { optional = false } = {}) {
  let info;
  try { info = await lstat(path); }
  catch (error) {
    if (error.code === 'ENOENT' && optional) return {
      profile: normalizeProfile({ version: 1, factory_id: factoryId }, factoryId),
      status: 'not-recorded', digest: null,
    };
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink()) throw new ObservationError('Factory profile must be a regular file, not a link', 503);
  if (info.size > MAX_PROFILE_BYTES) throw new ObservationError('Factory profile exceeds 16 KiB', 503);
  const content = await readFile(path);
  if (content.length > MAX_PROFILE_BYTES) throw new ObservationError('Factory profile exceeds 16 KiB', 503);
  let input;
  try { input = JSON.parse(content.toString('utf8')); }
  catch { throw new ObservationError('Factory profile is not valid JSON; no raw content was exposed', 503); }
  let profile;
  try { profile = normalizeProfile(input, factoryId); }
  catch (error) {
    if (error instanceof ObservationError) throw new ObservationError(error.message, 503);
    throw error;
  }
  return { profile, status: 'recorded', digest: createHash('sha256').update(JSON.stringify(profile)).digest('hex') };
}

export function factoryMetadata(events, config, snapshot, evidence) {
  const ordered = [...events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.sequence - b.sequence);
  const lifecycle = ordered.filter((event) => event.kind.startsWith('factory.'));
  const latest = lifecycle.at(-1);
  const lastTime = (kind) => ordered.filter((event) => event.kind === kind).at(-1)?.occurred_at ?? null;
  const location = join('.factory', 'observability', config.factory_id);
  const missing = ['mission', 'updated_at'].filter((field) => evidence.profile[field] === null);
  for (const [group, fields] of Object.entries(groups)) {
    for (const field of fields) if (evidence.profile[group][field] === null) missing.push(`${group}.${field}`);
  }
  for (const [key, values] of Object.entries(evidence.profile.roster)) if (!values.length) missing.push(`roster.${key}`);
  return {
    schema_version: 1,
    identity: { factory_id: config.factory_id, label: config.label },
    profile: evidence.profile,
    lifecycle: {
      reported_state: latest ? latest.kind.slice('factory.'.length) : 'unknown',
      first_started_at: lifecycle.find((event) => event.kind === 'factory.started')?.occurred_at ?? null,
      last_resumed_at: lastTime('factory.resumed'),
      last_progress_at: lastTime('factory.progress'),
      last_stopped_at: lastTime('factory.stopped'),
      center_installed_at: lastTime('center.installed'),
      center_revalidated_at: lastTime('center.revalidated'),
      latest_report: latest ? {
        event_id: latest.event_id, kind: latest.kind, occurred_at: latest.occurred_at,
        recorded_at: latest.recorded_at, source: latest.source,
      } : null,
    },
    configuration: { ...config },
    storage: {
      ownership: 'product-owned',
      center: location,
      configuration: join(location, 'center.json'),
      runtime_manifest: join(location, 'manifest.json'),
      profile: join(location, 'profile.json'),
      artifacts_catalog: join(location, 'artifacts.json'),
      journal: join(location, 'events.jsonl'),
      inbox: join(location, 'inbox'),
      session_registry: join('.factory', 'observability', 'registry.json'),
    },
    interfaces: {
      mode: 'observation-only',
      ui: '/',
      metadata_api: '/api/v1/metadata',
      overview_api: '/api/v1/overview',
      events_api: '/api/v1/events',
      analytics_api: '/api/v1/analytics',
      stream_api: '/api/v1/stream',
      artifacts_api: '/api/v1/artifacts',
      http_binding: '127.0.0.1, local OS-account trust; not shared-user authentication',
      mcp_server: `factory-observability-${config.factory_id}`,
      mcp_transport: 'stdio',
      mcp_tools: ['factory_overview', 'factory_metadata', 'factory_events', 'factory_analytics', 'factory_artifacts', 'factory_artifact', 'factory_artifact_content'],
      mcp_metadata_resource: `factory://${config.factory_id}/metadata`,
    },
    limits: { event_bytes: MAX_EVENT_BYTES, journal_bytes: MAX_JOURNAL_BYTES, profile_bytes: MAX_PROFILE_BYTES, artifact_bytes: MAX_ARTIFACT_BYTES, artifact_catalog_bytes: MAX_CATALOG_BYTES, artifact_preview_bytes: MAX_PREVIEW_BYTES },
    capture: { ...snapshot.coverage },
    observed_inventory: { ...snapshot.counts },
    provenance: {
      profile_status: evidence.status,
      profile_missing_fields: missing,
      profile_digest: evidence.digest,
      digest_basis: 'SHA-256 of normalized, redacted profile JSON',
      collected_at: snapshot.observed_at,
      claim: 'Profile and lifecycle are source-reported metadata, not approvals or verified health. Declared roster is not observed activity. Missing fields are not recorded; environment variables and private transcripts are excluded.',
    },
  };
}
