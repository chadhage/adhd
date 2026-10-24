import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { link, mkdir, readFile, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { install, parseArgs } from '../../skills/factory-observability/scripts/install.mjs';
import { artifactPath, artifactQuery, createArtifactReader, MAX_ARTIFACT_BYTES, MAX_CATALOG_BYTES, normalizeCatalog, readCatalog } from '../../skills/factory-observability/scripts/runtime/artifacts.mjs';
import { createCenterServer } from '../../skills/factory-observability/scripts/runtime/http.mjs';
import { createMcpHandler } from '../../skills/factory-observability/scripts/runtime/mcp.mjs';
import { createStore, VERSION } from '../../skills/factory-observability/scripts/runtime/store.mjs';
import { center, fact, product, ready, rpc } from './observability-helpers.mjs';

const catalog = (artifacts = [], extra = {}) => ({
  version: 1, factory_id: 'alpha', source: { ref: 'synthetic-reviewed-index', revision: 'fixture-only' },
  updated_at: '2026-10-23T12:00:00Z', artifacts, ...extra,
});
const entry = (path = 'docs\\result.md', extra = {}) => ({ path, title: 'Synthetic Factory document', category: 'document', ...extra });
function git(root, args, input) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', input, windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
async function workspace(t) {
  const ws = await center(t);
  git(ws.root, ['init', '--quiet']);
  return { ...ws, reader: createArtifactReader(ws.store) };
}
async function file(ws, path, bytes) {
  const target = join(ws.root, ...path.replaceAll('\\', '/').split('/'));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return target;
}
async function register(ws, entries) {
  await writeFile(ws.path('artifacts.json'), JSON.stringify(catalog(entries)));
  return (await ws.reader.list()).artifacts;
}
async function commit(ws, path, content) {
  await file(ws, path, content);
  git(ws.root, ['add', '--', path]);
  git(ws.root, ['-c', 'user.name=Factory verification', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false',
    'commit', '--quiet', '-m', 'Synthetic artifact verification\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>']);
  return git(ws.root, ['rev-parse', 'HEAD']);
}

test('positive: every Factory exposes an explicitly scoped artifact inventory, even before any artifacts exist', async (t) => {
  const ws = await center(t);
  const app = createCenterServer(ws.directory);
  const url = await app.listen();
  t.after(() => app.close());
  const response = await fetch(url + '/api/v1/artifacts');
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.factory_id, 'alpha');
  assert.deepEqual(result.artifacts, []);
  assert.equal(result.catalog.status, 'not-recorded');
});

for (const path of [
  '../outside.txt', '/absolute.txt', 'C:\\outside.txt', '\\\\host\\share\\file', 'src//file.js', 'src/./file.js',
  'src/../file.js', 'src\\file:stream', 'src/file\0.js', 'src/%2e%2e/file', 'src/file?.js', 'src/file*.js',
  'src/file.js ', 'src/file.', 'src/CON.txt', 'src/COM1', '.env.local', 'credentials/private.json',
  'src/private.key', '.git/config', '.git-credentials', '.aws/config', '.ssh/id_rsa',
  '.factory/observability/beta/profile.json', 'node_modules/tool.js', '.npmrc', 'file.keystore',
  'a'.repeat(513), `dir/${'x'.repeat(256)}`, 'src/ghp_privatecredential',
]) test(`negative: artifact paths reject unsafe or private target ${JSON.stringify(path.slice(0, 70))}`, () => {
  assert.throws(() => artifactPath(path));
});

test('positive: path normalization preserves safe product records without exposing observation control files', () => {
  assert.equal(artifactPath('.factory\\history\\evidence.json'), '.factory/history/evidence.json');
  assert.equal(artifactPath('source code\\result.js'), 'source code/result.js');
});

for (const [name, change] of [
  ['wrong identity', (value) => { value.factory_id = 'beta'; }],
  ['wrong version', (value) => { value.version = 9; }],
  ['raw payload', (value) => { value.prompt = 'PRIVATE'; }],
  ['wrong entries shape', (value) => { value.artifacts = {}; }],
  ['unknown entry fields', (value) => { value.artifacts[0].approval = true; }],
  ['invalid category', (value) => { value.artifacts[0].category = 'secret'; }],
  ['case duplicate paths', (value) => { value.artifacts.push(entry('DOCS/RESULT.MD')); }],
  ['blank title', (value) => { value.artifacts[0].title = ''; }],
  ['oversized title', (value) => { value.artifacts[0].title = 'x'.repeat(201); }],
  ['wrong text type', (value) => { value.artifacts[0].producer = {}; }],
  ['arbitrary revision expressions', (value) => { value.artifacts[0].commits = ['HEAD~2']; }],
  ['duplicate commits', (value) => { value.artifacts[0].commits = ['a'.repeat(40), 'a'.repeat(40)]; }],
  ['non-array commits', (value) => { value.artifacts[0].commits = 'a'.repeat(40); }],
  ['excessive commits', (value) => { value.artifacts[0].commits = Array.from({ length: 101 }, (_, index) => index.toString(16).padStart(40, '0')); }],
  ['invalid source fields', (value) => { value.source.data = 'PRIVATE'; }],
  ['invalid timestamp', (value) => { value.updated_at = 'yesterday'; }],
]) test(`negative: reviewed artifact catalogs reject ${name}`, () => {
  const value = catalog([entry()]);
  change(value);
  assert.throws(() => normalizeCatalog(value, 'alpha'));
});

test('negative: null catalogs, excessive entries and oversized normalized catalogs fail explicitly', () => {
  for (const value of [null, [], 'text']) assert.throws(() => normalizeCatalog(value, 'alpha'), /object/);
  assert.throws(() => normalizeCatalog(catalog(Array(10001).fill(entry())), 'alpha'), /10000/);
  const entries = Array.from({ length: 5000 }, (_, index) => entry(`docs/${index}.md`, { title: 'x'.repeat(200), source_ref: 'x'.repeat(256) }));
  assert.throws(() => normalizeCatalog(catalog(entries), 'alpha'), /2 MiB/);
});

test('positive: catalog normalization keeps provenance, defaults and credential redaction explicit', () => {
  const value = normalizeCatalog(catalog([{ path: 'docs/a.md', category: 'document', producer: 'Bearer PRIVATE', source_ref: 'https://user:PRIVATE@example.test/evidence?token=PRIVATE' }]), 'alpha');
  assert.equal(value.artifacts[0].title, 'a.md');
  assert.deepEqual(value.artifacts[0].commits, []);
  assert.ok(!JSON.stringify(value).includes('PRIVATE'));
  const sparse = normalizeCatalog({ version: 1, factory_id: 'alpha', artifacts: [] }, 'alpha');
  assert.equal(sparse.updated_at, null);
  assert.equal(sparse.source.ref, null);
});

for (const [name, value] of [
  ['unknown query', { path: '../private' }], ['bad category', { category: 'secret' }],
  ['negative cursor', { offset: -1 }], ['fractional cursor', { offset: 0.5 }], ['non-integer limit', { limit: false }],
  ['unsafe integer', { offset: '9007199254740992' }], ['zero limit', { limit: 0 }], ['large list limit', { limit: 201 }],
  ['empty search', { q: '' }], ['oversized search', { q: 'x'.repeat(201) }], ['object query value', { q: {} }],
  ['array input', []], ['null input', null], ['duplicate parameter', new URLSearchParams('limit=2&limit=3')],
]) test(`negative: artifact queries reject ${name}`, () => assert.throws(() => artifactQuery(value)));

test('negative: content queries reject arbitrary commit expressions and unbounded output sizes', () => {
  assert.throws(() => artifactQuery({ revision: 'HEAD:path' }, ['revision']), /revision/);
  assert.throws(() => artifactQuery({ limit: 65537 }, ['revision', 'limit']), /range/);
});

test('positive: catalog and Factory reports form a searchable paginated inventory with explicit access gaps', async (t) => {
  const ws = await workspace(t);
  await register(ws, [entry(), entry('src/app.js', { category: 'source', producer: 'Synthetic engineer' })]);
  await ws.store.append(fact('item.created', { item: { id: 'docs/result.md', type: 'artifact', title: 'Reported document' } }));
  await ws.store.append(fact('item.updated', { item: { id: 'docs/result.md', type: 'artifact', title: 'Reported document update' } }));
  for (const path of ['result.json', 'chart.png', 'archive.zip', 'LICENSE', 'report.txt']) await ws.store.append(fact('item.created', { item: { id: path, type: 'artifact', title: path } }));
  await ws.store.append(fact('item.created', { item: { id: '../outside.txt', type: 'artifact', title: 'Unsafe reference' } }));
  const data = await ws.reader.list({ limit: 2 });
  assert.equal(data.total, 7);
  assert.equal(data.coverage.reported_only, 5);
  assert.equal(data.coverage.excluded_unsafe_reports, 1);
  assert.equal(data.next_offset, 2);
  assert.equal((await ws.reader.list({ offset: data.next_offset, limit: 200 })).next_offset, null);
  const [found] = (await ws.reader.list({ q: 'engineer', category: 'source' })).artifacts;
  assert.equal(found.path, 'src/app.js');
  assert.equal((await ws.reader.list({ q: 'no-such-file' })).total, 0);
  const document = (await ws.reader.list({ q: 'docs/result' })).artifacts[0];
  assert.equal(document.report_count, 2);
  assert.equal(document.title, 'Synthetic Factory document');
  assert.equal((await ws.reader.describe(document.id)).artifact.last_report.agent.role, 'Fullstacker');
  await assert.rejects(ws.reader.list({ offset: 999 }), /cursor/);
});

test('negative: reports are not content approvals and arbitrary or cross-Factory artifact IDs cannot be read', async (t) => {
  const ws = await workspace(t);
  await file(ws, 'reported.txt', 'PRIVATE-UNREVIEWED');
  await ws.store.append(fact('item.created', { item: { id: 'reported.txt', type: 'artifact', title: 'Reported only' } }));
  const [reported] = (await ws.reader.list()).artifacts;
  const detail = await ws.reader.describe(reported.id);
  assert.ok(detail.content_access.startsWith('reported-only'));
  await assert.rejects(ws.reader.read(reported.id), (error) => error.status === 403);
  await assert.rejects(ws.reader.download(reported.id), (error) => error.status === 403);
  await assert.rejects(ws.reader.describe('../path'), /Invalid artifact ID/);
  await assert.rejects(ws.reader.describe('f'.repeat(32)), (error) => error.status === 404);
  const beta = await center(t, { factoryId: 'beta' });
  assert.equal((await createArtifactReader(beta.store).list()).total, 0);
  await assert.rejects(createArtifactReader(beta.store).describe(reported.id), (error) => error.status === 404);
});

test('positive: approved current text is read and downloaded inertly with hashes and redacted credentials', async (t) => {
  const ws = await workspace(t);
  const original = '<script>literal source</script>\npassword=PRIVATE\n';
  await file(ws, 'docs/result.md', original);
  const [artifact] = await register(ws, [entry()]);
  const preview = await ws.reader.read(artifact.id);
  assert.ok(preview.content.includes('<script>literal source</script>'));
  assert.ok(!preview.content.includes('PRIVATE'));
  assert.equal(preview.sanitized, true);
  assert.equal(preview.original_sha256, createHash('sha256').update(original).digest('hex'));
  const download = await ws.reader.download(artifact.id);
  assert.ok(!download.bytes.toString().includes('PRIVATE'));
  assert.equal(download.binary, false);
  assert.equal((await ws.reader.describe(artifact.id)).versions[0], 'working');
});

test('positive: UTF-8 preview sections round-trip complete source without splitting characters', async (t) => {
  const ws = await workspace(t);
  const text = 'A\u20ac\ud83d\ude03\u6f22Z';
  await file(ws, 'docs/result.md', text);
  const [artifact] = await register(ws, [entry()]);
  let offset = 0;
  let combined = '';
  do {
    const page = await ws.reader.read(artifact.id, { offset, limit: 4 });
    combined += page.content;
    offset = page.next_offset;
  } while (offset !== null);
  assert.equal(combined, text);
  await assert.rejects(ws.reader.read(artifact.id, { offset: 2 }), /UTF-8 boundary/);
  await assert.rejects(ws.reader.read(artifact.id, { offset: 100 }), /UTF-8 boundary/);
  await assert.rejects(ws.reader.read(artifact.id, { offset: 1, limit: 1 }), /too small/);
  await file(ws, 'docs/result.md', '');
  assert.equal((await ws.reader.read(artifact.id)).content, '');
});

test('positive: current and explicitly recorded Git revisions remain distinct and never run filters or fetch remotes', async (t) => {
  const ws = await workspace(t);
  const revision = await commit(ws, 'docs/result.md', 'Original recorded document\n');
  await file(ws, 'docs/result.md', 'Current uncommitted document\n');
  const [artifact] = await register(ws, [entry('docs/result.md', { commits: [revision] })]);
  assert.equal((await ws.reader.read(artifact.id)).content, 'Current uncommitted document\n');
  const recorded = await ws.reader.read(artifact.id, { revision });
  assert.equal(recorded.content, 'Original recorded document\n');
  assert.equal((await ws.reader.download(artifact.id, { revision })).bytes.toString(), recorded.content);
  await assert.rejects(ws.reader.read(artifact.id, { revision: 'b'.repeat(40) }), /not recorded/);
  await register(ws, [entry('docs/result.md', { commits: ['a'.repeat(40)] })]);
  await assert.rejects(ws.reader.read(artifact.id, { revision: 'a'.repeat(40) }), /not available locally/);
});

test('negative: recorded versions do not read paths missing from their tree or Git symbolic-link blobs', async (t) => {
  const ws = await workspace(t);
  const revision = await commit(ws, 'other.txt', 'Other artifact');
  const [artifact] = await register(ws, [entry('docs/result.md', { commits: [revision] })]);
  await assert.rejects(ws.reader.read(artifact.id, { revision }), /not a regular Git blob/);
  const blob = git(ws.root, ['hash-object', '-w', '--stdin'], '../outside.txt');
  git(ws.root, ['update-index', '--add', '--cacheinfo', `120000,${blob},link.txt`]);
  git(ws.root, ['-c', 'user.name=Factory verification', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false',
    'commit', '--quiet', '-m', 'Synthetic link fixture\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>']);
  const linkRevision = git(ws.root, ['rev-parse', 'HEAD']);
  const [linked] = await register(ws, [entry('link.txt', { commits: [linkRevision] })]);
  await assert.rejects(ws.reader.read(linked.id, { revision: linkRevision }), /not a regular Git blob/);
});

test('negative: artifact reads do not execute repository fsmonitor hooks or content filters', async (t) => {
  const ws = await workspace(t);
  const revision = await commit(ws, 'docs/result.md', 'Recorded safe text\n');
  const marker = join(ws.root, 'unexpected-execution');
  const script = join(ws.root, 'filter.mjs');
  await writeFile(script, `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'unexpected');`);
  const command = `"${process.execPath}" "${script}"`;
  git(ws.root, ['config', 'core.fsmonitor', command]);
  git(ws.root, ['config', 'filter.fixture.smudge', command]);
  await writeFile(join(ws.root, '.gitattributes'), '*.md filter=fixture\n');
  const [artifact] = await register(ws, [entry('docs/result.md', { commits: [revision] })]);
  assert.equal((await ws.reader.read(artifact.id)).content, 'Recorded safe text\n');
  assert.equal((await ws.reader.read(artifact.id, { revision })).content, 'Recorded safe text\n');
  await assert.rejects(readFile(marker), { code: 'ENOENT' });
});

test('negative: missing, directory, ignored and oversized current artifacts never become success-shaped previews', async (t) => {
  const ws = await workspace(t);
  const [artifact] = await register(ws, [entry()]);
  await assert.rejects(ws.reader.read(artifact.id), (error) => error.status === 404);
  await mkdir(join(ws.root, 'docs', 'result.md'), { recursive: true });
  await assert.rejects(ws.reader.read(artifact.id), (error) => error.status === 415);
  await rm(join(ws.root, 'docs', 'result.md'), { recursive: true });
  await file(ws, 'docs/result.md', '');
  await truncate(join(ws.root, 'docs', 'result.md'), MAX_ARTIFACT_BYTES + 1);
  await assert.rejects(ws.reader.read(artifact.id), (error) => error.status === 413);
  await writeFile(join(ws.root, '.gitignore'), 'docs/result.md\n');
  await assert.rejects(ws.reader.read(artifact.id), (error) => error.status === 403);
});

test('negative: current symlinks, parent junctions and hard links cannot expose outside files', async (t) => {
  const ws = await workspace(t);
  const outside = await center(t);
  await writeFile(join(outside.root, 'private.txt'), 'PRIVATE-OUTSIDE');
  await symlink(outside.root, join(ws.root, 'redirect'), 'junction');
  const [redirected] = await register(ws, [entry('redirect/private.txt')]);
  await assert.rejects(ws.reader.read(redirected.id), (error) => error.status === 403);
  await link(join(outside.root, 'private.txt'), join(ws.root, 'hardlink.txt'));
  const [linked] = await register(ws, [entry('hardlink.txt')]);
  await assert.rejects(ws.reader.read(linked.id), (error) => error.status === 403);
});

test('negative: binary and invalid UTF-8 artifacts require explicit download, and LFS pointers are not fake documents', async (t) => {
  const ws = await workspace(t);
  for (const [path, bytes] of [['report.pdf', Buffer.from('%PDF-1.7 synthetic')], ['binary.dat', Buffer.from([0xff, 0xfe])], ['zero.dat', Buffer.from([0, 1, 2])]]) {
    await file(ws, path, bytes);
    const [artifact] = await register(ws, [entry(path)]);
    await assert.rejects(ws.reader.read(artifact.id), (error) => error.status === 415);
    assert.deepEqual((await ws.reader.download(artifact.id)).bytes, bytes);
  }
  await file(ws, 'lfs.pdf', 'version https://git-lfs.github.com/spec/v1\noid sha256:synthetic\n');
  const [pointer] = await register(ws, [entry('lfs.pdf')]);
  await assert.rejects(ws.reader.read(pointer.id), /LFS pointer/);
  await assert.rejects(ws.reader.download(pointer.id), /LFS pointer/);
});

test('negative: oversized or missing recorded objects and non-product Git bindings fail explicitly', async (t) => {
  const ws = await workspace(t);
  const revision = await commit(ws, 'large.dat', Buffer.alloc(MAX_ARTIFACT_BYTES + 1));
  const [artifact] = await register(ws, [entry('large.dat', { commits: [revision] })]);
  await assert.rejects(ws.reader.read(artifact.id, { revision }), (error) => error.status === 413);
  const plain = await center(t);
  await file(plain, 'docs/result.md', 'Not in a product Git repository');
  const reader = createArtifactReader(plain.store);
  const [unbound] = await register({ ...plain, reader }, [entry()]);
  await assert.rejects(reader.read(unbound.id), (error) => error.status === 503);
});

for (const [name, content] of [
  ['malformed JSON', '{PRIVATE-RAW'], ['unknown sensitive fields', '{"version":1,"factory_id":"alpha","artifacts":[],"secret":"PRIVATE-RAW"}'],
  ['oversized catalog', 'x'.repeat(MAX_CATALOG_BYTES + 1)],
]) test(`negative: ${name} is an explicit catalog failure without a raw-content leak`, async (t) => {
  const ws = await workspace(t);
  await writeFile(ws.path('artifacts.json'), content);
  await assert.rejects(ws.reader.list(), (error) => error.status === 503 && !error.message.includes('PRIVATE-RAW'));
});

test('negative: linked or missing required catalogs are not treated as valid empty indexes', async (t) => {
  const ws = await workspace(t);
  await assert.rejects(readCatalog(ws.path('artifacts.json'), 'alpha'), { code: 'ENOENT' });
  await mkdir(ws.path('artifacts.json'));
  await assert.rejects(ws.reader.list(), /regular file/);
  await rm(ws.path('artifacts.json'), { recursive: true });
  await file(ws, 'catalog-source.json', JSON.stringify(catalog()));
  await link(join(ws.root, 'catalog-source.json'), ws.path('artifacts.json'));
  await assert.rejects(ws.reader.list(), /regular file/);
});

test('positive: UI API and MCP share the same scoped inventory, recorded metadata and sanitized content', async (t) => {
  const ws = await workspace(t);
  await file(ws, 'docs/result.md', '<b>Literal document</b> password=PRIVATE');
  const [artifact] = await register(ws, [entry()]);
  const app = createCenterServer(ws.directory, { log() {} });
  const url = await app.listen();
  t.after(() => app.close());
  const handler = await ready(createMcpHandler(ws.directory, { log() {} }));
  const inventory = await (await fetch(url + '/api/v1/artifacts')).json();
  const tool = (await handler(rpc(2, 'tools/call', { name: 'factory_artifacts', arguments: {} }))).result;
  assert.deepEqual(tool.structuredContent, inventory);
  const resource = (await handler(rpc(3, 'resources/read', { uri: 'factory://alpha/artifacts' }))).result;
  assert.deepEqual(JSON.parse(resource.contents[0].text), inventory);
  const detail = await (await fetch(`${url}/api/v1/artifacts/${artifact.id}`)).json();
  assert.deepEqual((await handler(rpc(4, 'tools/call', { name: 'factory_artifact', arguments: { artifact_id: artifact.id } }))).result.structuredContent, detail);
  const content = await (await fetch(`${url}/api/v1/artifacts/${artifact.id}/content`)).json();
  assert.deepEqual((await handler(rpc(5, 'tools/call', { name: 'factory_artifact_content', arguments: { artifact_id: artifact.id } }))).result.structuredContent, content);
  const downloaded = await fetch(`${url}/api/v1/artifacts/${artifact.id}/download`);
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.headers.get('content-type'), 'application/octet-stream');
  assert.ok(downloaded.headers.get('content-disposition').startsWith('attachment;'));
  assert.ok(downloaded.headers.get('content-security-policy').includes('sandbox'));
  assert.ok(!(await downloaded.text()).includes('PRIVATE'));
  for (const path of [
    '/api/v1/artifacts?path=../private', `/api/v1/artifacts/${artifact.id}?revision=working`,
    `/api/v1/artifacts/${artifact.id}/content?revision=HEAD`, `/api/v1/artifacts/${artifact.id}/download?offset=0`,
  ]) assert.equal((await fetch(url + path)).status, 400);
  for (const path of ['/api/v1/artifacts/../private', '/api/v1/artifacts/invalid/content']) assert.equal((await fetch(url + path)).status, 404);
  assert.equal((await handler(rpc(6, 'tools/call', { name: 'factory_artifact', arguments: { artifact_id: artifact.id, path: '../private' } }))).result.isError, true);
  const calls = (await handler(rpc(7, 'tools/list'))).result.tools.filter((item) => item.name.startsWith('factory_artifact'));
  assert.ok(calls.every((item) => item.annotations.readOnlyHint && !item.annotations.destructiveHint));
});

test('positive: installer backfills and preserves the product-owned catalog, with explicit reviewed replacement', async (t) => {
  const root = await product(t);
  const instance = await install({ productRoot: root, factoryId: 'alpha' });
  const path = join(instance.directory, 'artifacts.json');
  assert.deepEqual(JSON.parse(await readFile(path)).artifacts, []);
  const original = JSON.stringify(catalog([entry()]), null, 4) + '\n';
  await writeFile(path, original);
  await install({ productRoot: root, factoryId: 'alpha' });
  assert.equal(await readFile(path, 'utf8'), original);
  const configPath = join(instance.directory, 'center.json');
  const previous = JSON.parse(await readFile(configPath));
  await writeFile(configPath, JSON.stringify({ ...previous, runtime_version: '1.1.0' }));
  await rm(path);
  await install({ productRoot: root, factoryId: 'alpha' });
  assert.equal(createStore(instance.directory).config.runtime_version, VERSION);
  const input = join(root, 'reviewed-artifacts.json');
  await writeFile(input, JSON.stringify(catalog([entry('src/app.js', { category: 'source' })])));
  assert.deepEqual(parseArgs(['--artifacts', input]), { artifactsPath: input });
  await install({ productRoot: root, factoryId: 'alpha', artifactsPath: input });
  assert.equal(JSON.parse(await readFile(path)).artifacts[0].path, 'src/app.js');
});

test('negative: invalid catalog input cannot erase current records or authorize another Factory', async (t) => {
  const root = await product(t);
  const instance = await install({ productRoot: root, factoryId: 'alpha' });
  const path = join(instance.directory, 'artifacts.json');
  await assert.rejects(install({ productRoot: root, factoryId: 'alpha', artifactsPath: '' }), /reviewed artifact/);
  const input = join(root, 'other.json');
  await writeFile(input, JSON.stringify(catalog([], { factory_id: 'beta' })));
  await assert.rejects(install({ productRoot: root, factoryId: 'alpha', artifactsPath: input }), /identity/);
  await writeFile(path, '{PRIVATE-RAW');
  await assert.rejects(install({ productRoot: root, factoryId: 'alpha' }), /not valid JSON/);
  assert.equal(await readFile(path, 'utf8'), '{PRIVATE-RAW');
});
