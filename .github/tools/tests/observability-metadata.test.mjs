import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { install, parseArgs } from '../../skills/factory-observability/scripts/install.mjs';
import { createCenterServer } from '../../skills/factory-observability/scripts/runtime/http.mjs';
import { createMcpHandler } from '../../skills/factory-observability/scripts/runtime/mcp.mjs';
import { MAX_PROFILE_BYTES, normalizeProfile, readProfile } from '../../skills/factory-observability/scripts/runtime/metadata.mjs';
import { readModel } from '../../skills/factory-observability/scripts/runtime/query.mjs';
import { createStore, VERSION } from '../../skills/factory-observability/scripts/runtime/store.mjs';
import { runNode } from './helpers.mjs';
import { center, fact, installerPath, product, ready, rpc } from './observability-helpers.mjs';

const profile = (extra = {}) => ({
  version: 1, factory_id: 'alpha', mission: 'Synthetic verification mission.',
  product: { name: 'Verification product', repository: 'https://example.test/owner/product', workspace: 'C:\\products\\verification', branch: 'main' },
  owners: { factory: 'Factory owner role', product: 'Product owner role', operations: 'Operations owner role' },
  governance: {
    engagement_id: 'engagement-1', contract_ref: '.docs\\contract.json', charter_ref: '.docs\\charter.json',
    board_ref: '.docs\\kanban.md', operating_window: 'Owner-approved window', resource_limits: 'Owner-approved limits',
    retention_policy_ref: '.docs\\retention.json',
  },
  roster: { agents: [{ id: 'worker-1', role: 'Fullstacker', assignment: 'Verify the vertical outcome' }], squads: ['squad-1'], skills: ['fullstack-empirical-done'] },
  source: { ref: '.docs\\contract.json', revision: 'verified-source-revision' }, updated_at: '2026-10-23T12:00:00Z',
  ...extra,
});
const withoutCollectionTime = ({ provenance, ...metadata }) => {
  const { collected_at: collectedAt, ...stable } = provenance;
  return { ...metadata, provenance: stable };
};

test('positive: every Factory snapshot provides metadata without inventing a profile or lifecycle', async (t) => {
  const ws = await center(t);
  const { snapshot } = await readModel(ws.store);
  assert.equal(snapshot.metadata?.identity.factory_id, 'alpha');
  assert.equal(snapshot.metadata.identity.label, ws.config.label);
  assert.equal(snapshot.metadata.profile.mission, null);
  assert.equal(snapshot.metadata.lifecycle.reported_state, 'unknown');
  assert.equal(snapshot.metadata.provenance.profile_status, 'not-recorded');
  assert.ok(snapshot.metadata.provenance.profile_missing_fields.includes('owners.factory'));
  assert.equal(snapshot.metadata.configuration.created_at, ws.config.created_at);
  assert.deepEqual(snapshot.metadata.capture.session_ids, ['session-1']);
  assert.equal(snapshot.metadata.observed_inventory.events, 0);
});

test('positive: the complete normalized profile and sanitized provenance are included, not just a metadata summary', async (t) => {
  const ws = await center(t);
  const input = profile();
  await writeFile(ws.path('profile.json'), JSON.stringify(input));
  const metadata = (await readModel(ws.store)).snapshot.metadata;
  assert.deepEqual(metadata.profile, normalizeProfile(input, 'alpha'));
  assert.equal(metadata.provenance.profile_status, 'recorded');
  assert.deepEqual(metadata.provenance.profile_missing_fields, []);
  assert.equal(metadata.provenance.profile_digest, createHash('sha256').update(JSON.stringify(metadata.profile)).digest('hex'));
  assert.equal(metadata.interfaces.mcp_metadata_resource, 'factory://alpha/metadata');
  assert.ok(metadata.storage.profile.endsWith(join('alpha', 'profile.json')));
  assert.equal(metadata.limits.profile_bytes, MAX_PROFILE_BYTES);
  assert.equal(metadata.observed_inventory.agents, 0, 'a declared roster does not count as an active agent');
});

for (const [name, change] of [
  ['wrong Factory', (input) => { input.factory_id = 'beta'; }],
  ['unsupported version', (input) => { input.version = 2; }],
  ['environment dump', (input) => { input.environment = { token: 'PRIVATE' }; }],
  ['raw credentials', (input) => { input.owners.credentials = 'PRIVATE'; }],
  ['unknown nested fields', (input) => { input.product.extra = 'PRIVATE'; }],
  ['null profile group', (input) => { input.product = null; }],
  ['blank mission', (input) => { input.mission = ''; }],
  ['oversized mission', (input) => { input.mission = 'x'.repeat(1001); }],
  ['non-string mission', (input) => { input.mission = {}; }],
  ['non-printable mission', (input) => { input.mission = '\u0000'; }],
  ['sensitive source path', (input) => { input.source.ref = '.env.local'; }],
  ['sensitive governance path', (input) => { input.governance.contract_ref = 'credentials\\private.json'; }],
  ['invalid timestamp', (input) => { input.updated_at = 'not a date'; }],
  ['future timestamp', (input) => { input.updated_at = '2099-01-01T00:00:00Z'; }],
  ['non-array agents', (input) => { input.roster.agents = {}; }],
  ['excessive roster', (input) => { input.roster.skills = Array.from({ length: 101 }, (_, index) => `skill-${index}`); }],
  ['duplicate agent IDs', (input) => { input.roster.agents.push(input.roster.agents[0]); }],
  ['invalid agent IDs', (input) => { input.roster.agents[0].id = '../worker'; }],
  ['credential-shaped IDs', (input) => { input.roster.agents[0].id = 'ghp_privatecredential'; }],
  ['missing agent role', (input) => { delete input.roster.agents[0].role; }],
  ['agent raw payload', (input) => { input.roster.agents[0].prompt = 'PRIVATE'; }],
  ['invalid skill name', (input) => { input.roster.skills = ['../skill']; }],
  ['credential-shaped skill name', (input) => { input.roster.skills = ['sk-privatecredential123']; }],
  ['duplicate skill names', (input) => { input.roster.skills.push(input.roster.skills[0]); }],
  ['invalid squad IDs', (input) => { input.roster.squads = ['../squad']; }],
  ['credential-shaped squad IDs', (input) => { input.roster.squads = ['ghp_privatecredential']; }],
  ['null roster', (input) => { input.roster = null; }],
]) test(`negative: Factory metadata validation rejects ${name}`, () => {
  const input = profile();
  change(input);
  assert.throws(() => normalizeProfile(input, 'alpha'));
});

test('negative: null and array profiles and oversized normalized metadata cannot masquerade as valid profiles', () => {
  for (const input of [null, [], 'text']) assert.throws(() => normalizeProfile(input, 'alpha'), /object/);
  const input = profile({ roster: { agents: Array.from({ length: 80 }, (_, index) => ({ id: `agent-${index}`, role: 'Fullstacker', assignment: 'x'.repeat(500) })) } });
  assert.throws(() => normalizeProfile(input, 'alpha'), /16 KiB/);
});

test('positive: profile strings are credential-redacted and literal markup is never interpreted as executable metadata', () => {
  const input = profile({
    mission: '<script>inert text</script> password=PRIVATE',
    product: { repository: 'https://user:PRIVATE@example.test/repo?token=PRIVATE#PRIVATE' },
    owners: { factory: 'Bearer PRIVATE' },
  });
  const result = normalizeProfile(input, 'alpha');
  assert.ok(result.mission.includes('<script>inert text</script>'));
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  assert.equal(result.product.repository, 'https://example.test/repo');
  const ssh = normalizeProfile(profile({ product: { repository: 'ssh://git:PRIVATE@example.test/owner/repo?token=PRIVATE#PRIVATE' } }), 'alpha');
  assert.equal(ssh.product.repository, 'ssh://example.test/owner/repo');
  const invalid = normalizeProfile(profile({ product: { repository: 'ssh://[' } }), 'alpha');
  assert.equal(invalid.product.repository, '[REDACTED URL]');
});

test('positive: source lifecycle metadata is event-time ordered and distinguishes provisioning from Factory activity', async (t) => {
  const ws = await center(t);
  for (const [kind, occurredAt] of [
    ['factory.started', '2020-01-01T00:00:00Z'], ['factory.stopped', '2020-01-02T00:00:00Z'],
    ['factory.resumed', '2020-01-03T00:00:00Z'], ['factory.progress', '2020-01-04T00:00:00Z'],
    ['center.revalidated', '2020-01-05T00:00:00Z'], ['factory.stopped', '2019-01-01T00:00:00Z'],
    ['center.installed', '2020-01-01T00:00:00Z'],
  ]) await ws.store.append(fact(kind, { occurred_at: occurredAt }));
  const lifecycle = (await readModel(ws.store)).snapshot.metadata.lifecycle;
  assert.equal(lifecycle.reported_state, 'progress');
  assert.equal(lifecycle.latest_report.kind, 'factory.progress');
  assert.equal(lifecycle.first_started_at, '2020-01-01T00:00:00.000Z');
  assert.equal(lifecycle.last_resumed_at, '2020-01-03T00:00:00.000Z');
  assert.equal(lifecycle.last_stopped_at, '2020-01-02T00:00:00.000Z');
  assert.equal(lifecycle.center_revalidated_at, '2020-01-05T00:00:00.000Z');
  assert.equal(lifecycle.latest_report.source.kind, 'agent-report');
});

for (const [name, contents] of [
  ['malformed JSON', '{PRIVATE-RAW'],
  ['cross-Factory profile', JSON.stringify(profile({ factory_id: 'beta' }))],
  ['unknown secret-bearing fields', JSON.stringify({ ...profile(), credentials: 'PRIVATE-RAW' })],
  ['oversized file', 'x'.repeat(MAX_PROFILE_BYTES + 1)],
]) test(`negative: ${name} fails explicitly, never as a successful empty metadata card`, async (t) => {
  const ws = await center(t);
  await writeFile(ws.path('profile.json'), contents);
  await assert.rejects(readModel(ws.store), (error) => error.status === 503 && !error.message.includes('PRIVATE-RAW'));
});

test('negative: directory, linked or required missing profile files cannot be read as trustworthy metadata', async (t) => {
  const ws = await center(t);
  await assert.rejects(readProfile(ws.path('profile.json'), 'alpha'), { code: 'ENOENT' });
  await mkdir(ws.path('profile.json'));
  await assert.rejects(readModel(ws.store), /regular file/);
  await rm(ws.path('profile.json'), { recursive: true });
  const source = join(ws.root, 'elsewhere');
  await mkdir(source);
  await symlink(source, ws.path('profile.json'), 'junction');
  await assert.rejects(readModel(ws.store), /regular file/);
});

test('positive: profile-only edits refresh metadata and provenance without manufacturing activity', async (t) => {
  const ws = await center(t);
  await writeFile(ws.path('profile.json'), JSON.stringify(profile()));
  const before = (await readModel(ws.store)).snapshot;
  await writeFile(ws.path('profile.json'), JSON.stringify(profile({ mission: 'Updated synthetic mission' })));
  const after = (await readModel(ws.store)).snapshot;
  assert.equal(after.metadata.profile.mission, 'Updated synthetic mission');
  assert.notEqual(after.metadata.provenance.profile_digest, before.metadata.provenance.profile_digest);
  assert.equal(after.last_sequence, before.last_sequence);
  assert.equal(after.freshness.state, 'unknown');
});

test('positive: metadata is identical through overview, dedicated API, read-only MCP tool and resource', async (t) => {
  const ws = await center(t);
  await writeFile(ws.path('profile.json'), JSON.stringify(profile()));
  const app = createCenterServer(ws.directory);
  const url = await app.listen();
  t.after(() => app.close());
  const api = await (await fetch(url + '/api/v1/metadata')).json();
  const overview = await (await fetch(url + '/api/v1/overview')).json();
  const handler = await ready(createMcpHandler(ws.directory));
  const tool = (await handler(rpc(2, 'tools/call', { name: 'factory_metadata' }))).result;
  const resource = (await handler(rpc(3, 'resources/read', { uri: 'factory://alpha/metadata' }))).result;
  const expected = withoutCollectionTime(api);
  assert.deepEqual(withoutCollectionTime(overview.metadata), expected);
  assert.deepEqual(withoutCollectionTime(tool.structuredContent), expected);
  assert.deepEqual(withoutCollectionTime(JSON.parse(resource.contents[0].text)), expected);
  assert.equal(tool.isError, false);
  assert.deepEqual(JSON.parse(tool.content[0].text), tool.structuredContent);
  for (const path of ['/api/v1/metadata?factory_id=beta', '/api/v1/metadata?agent_id=worker-1', '/api/v1/metadata?q=ignored']) {
    assert.equal((await fetch(url + path)).status, 400);
  }
  assert.equal((await fetch(url + '/profile.json')).status, 404);
  const rejected = await handler(rpc(4, 'tools/call', { name: 'factory_metadata', arguments: { factory_id: 'beta' } }));
  assert.equal(rejected.result.isError, true);
});

test('negative: invalid profile data produces explicit API/MCP failures without exposing raw contents', async (t) => {
  const ws = await center(t);
  await writeFile(ws.path('profile.json'), '{PRIVATE-RAW');
  const app = createCenterServer(ws.directory, { log() {} });
  const url = await app.listen();
  t.after(() => app.close());
  const response = await fetch(url + '/api/v1/metadata');
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes('PRIVATE-RAW'));
  assert.equal((await fetch(url + '/healthz')).status, 503);
  const handler = await ready(createMcpHandler(ws.directory, { log() {} }));
  assert.equal((await handler(rpc(2, 'tools/call', { name: 'factory_metadata' }))).result.isError, true);
});

test('positive: live metadata updates arrive without new facts, even while the fact stream is filtered', async (t) => {
  const ws = await center(t);
  await writeFile(ws.path('profile.json'), JSON.stringify(profile()));
  const app = createCenterServer(ws.directory, { intervalMs: 20 });
  const url = await app.listen();
  t.after(() => app.close());
  const response = await fetch(url + '/api/v1/stream?severity=critical');
  const reader = response.body.getReader();
  const timer = setTimeout(() => reader.cancel(), 5000);
  try {
    await reader.read();
    await writeFile(ws.path('profile.json'), JSON.stringify(profile({ mission: 'Metadata-only live refresh' })));
    let frames = '';
    while (!frames.includes('Metadata-only live refresh')) {
      const result = await reader.read();
      if (result.done) break;
      frames += new TextDecoder().decode(result.value);
    }
    assert.ok(frames.includes('Metadata-only live refresh'));
    assert.equal((await ws.store.read()).length, 0);
  } finally {
    clearTimeout(timer);
    await reader.cancel();
  }
});

test('positive: installer creates a product-owned metadata profile and preserves owner edits byte-for-byte on resume', async (t) => {
  const root = await product(t);
  const inputRoot = process.platform === 'win32' ? root.toUpperCase() : root;
  const first = await install({ productRoot: inputRoot, factoryId: 'alpha', sessionId: 'actual-session' });
  const stored = JSON.parse(await readFile(join(first.directory, 'profile.json')));
  assert.equal(stored.product.workspace, await realpath(root));
  assert.equal(stored.mission, null);
  const path = join(first.directory, 'profile.json');
  const content = JSON.stringify(profile(), null, 4) + '\n';
  await writeFile(path, content);
  const resumed = await install({ productRoot: root, factoryId: 'alpha' });
  assert.equal(resumed.metadata.state, 'preserved');
  assert.equal(await readFile(path, 'utf8'), content);
});

test('positive: legacy 1.0.0 centers backfill metadata and upgrade runtime while preserving identity, settings and facts', async (t) => {
  const root = await product(t);
  const first = await install({ productRoot: root, factoryId: 'alpha', label: 'Original label', staleAfterMs: 30000 });
  const before = JSON.parse(await readFile(join(first.directory, 'center.json')));
  const journal = await readFile(join(first.directory, 'events.jsonl'), 'utf8');
  await writeFile(join(first.directory, 'center.json'), JSON.stringify({ ...before, runtime_version: '1.0.0' }));
  await rm(join(first.directory, 'profile.json'));
  await install({ productRoot: root, factoryId: 'alpha', label: 'Must not replace identity' });
  const after = createStore(first.directory);
  assert.equal(after.config.runtime_version, VERSION);
  assert.equal(after.config.label, before.label);
  assert.equal(after.config.created_at, before.created_at);
  assert.equal(after.config.stale_after_ms, 30000);
  assert.ok((await readFile(join(first.directory, 'events.jsonl'), 'utf8')).startsWith(journal));
  assert.equal((await readModel(after)).snapshot.metadata.profile.product.workspace, await realpath(root));
});

test('positive: explicit reviewed profiles can be supplied through the installer CLI', async (t) => {
  const root = await product(t);
  const path = join(root, 'approved-profile.json');
  await writeFile(path, JSON.stringify(profile()));
  assert.deepEqual(parseArgs(['--profile', path]), { profilePath: path });
  const run = runNode(installerPath, ['--product-root', root, '--factory-id', 'alpha', '--profile', path]);
  assert.equal(run.status, 0, run.stderr);
  const installed = JSON.parse(run.stdout);
  assert.equal((await readModel(createStore(installed.directory))).snapshot.metadata.profile.mission, profile().mission);
});

test('negative: unsafe supplied metadata and invalid existing profiles cannot be silently reset during provisioning', async (t) => {
  const root = await product(t);
  const first = await install({ productRoot: root, factoryId: 'alpha' });
  const path = join(first.directory, 'profile.json');
  const content = '{PRIVATE-RAW';
  await writeFile(path, content);
  await assert.rejects(install({ productRoot: root, factoryId: 'alpha' }), /not valid JSON/);
  assert.equal(await readFile(path, 'utf8'), content);
  await rm(path);
  await assert.rejects(install({ productRoot: root, factoryId: 'alpha', profilePath: '' }), /reviewed metadata/);
  const input = join(root, 'beta.json');
  await writeFile(input, JSON.stringify(profile({ factory_id: 'beta' })));
  await assert.rejects(install({ productRoot: root, factoryId: 'alpha', profilePath: input }), /different Factory/);
  const config = join(first.directory, 'center.json');
  const previous = JSON.parse(await readFile(config));
  await writeFile(config, JSON.stringify({ ...previous, runtime_version: '999' }));
  await assert.rejects(install({ productRoot: root, factoryId: 'alpha' }), /runtime version/);
});

test('negative: metadata never leaks other Factories session bindings or unvalidated registry values', async (t) => {
  const ws = await center(t);
  const path = join(ws.base, 'registry.json');
  await writeFile(path, JSON.stringify({ version: 1, factories: { alpha: { sessions: ['session-1'] }, beta: { sessions: ['private-beta-session'] } } }));
  assert.ok(!JSON.stringify((await readModel(ws.store)).snapshot.metadata).includes('private-beta-session'));
  for (const sessions of [['session-1', 'session-1'], ['unsafe/session'], [null]]) {
    await writeFile(path, JSON.stringify({ version: 1, factories: { alpha: { sessions } } }));
    await assert.rejects(ws.store.coverage(), /invalid/);
  }
  await writeFile(path, JSON.stringify({ version: 1, factories: { alpha: { sessions: ['ghp_privatecredential'] } } }));
  assert.deepEqual((await ws.store.coverage()).session_ids, ['[REDACTED]']);
});
