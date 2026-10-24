import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { factoryIdPattern, newFact, normalizeConfig, ObservationError, redact, VERSION } from './runtime/store.mjs';
import { normalizeProfile, readProfile } from './runtime/metadata.mjs';
import { normalizeCatalog, readCatalog } from './runtime/artifacts.mjs';

const scripts = dirname(fileURLToPath(import.meta.url));
const frameworkRoot = resolve(scripts, '..', '..', '..', '..');
const digest = (content) => createHash('sha256').update(content).digest('hex');
const inside = (parent, child) => {
  const local = relative(parent, child);
  return local === '' || (!local.startsWith('..') && !isAbsolute(local));
};

async function existing(path) {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isFile()) throw new ObservationError('Installation refuses linked or non-file managed targets');
    return await readFile(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function jsonFile(path, fallback) {
  const content = await existing(path);
  if (content === null) return fallback;
  try {
    const value = JSON.parse(content.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new ObservationError('Existing workspace JSON configuration is invalid; repair it before provisioning');
  }
}

async function ensureDirectory(path) {
  if (dirname(path) !== path) await ensureDirectory(dirname(path));
  try {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new ObservationError('Installation refuses linked or non-directory product paths');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await mkdir(path);
  }
}

async function sourceFiles(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(join(directory, entry.name), name));
    else if (entry.isFile()) files.push([name, await readFile(join(directory, entry.name))]);
  }
  return files;
}

async function atomicWrite(path, content) {
  await ensureDirectory(dirname(path));
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { flag: 'wx' });
    await rename(temporary, path);
  } finally {
    try { await unlink(temporary); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

export async function install({ productRoot, factoryId, label = factoryId, sessionId, staleAfterMs = 60_000, profilePath, artifactsPath }) {
  if (typeof productRoot !== 'string' || !isAbsolute(productRoot)) throw new ObservationError('An explicit absolute product Git root is required');
  if (typeof factoryId !== 'string' || !factoryIdPattern.test(factoryId)) throw new ObservationError('factory-id must be a lowercase filesystem-safe slug, at most 64 characters');
  if (typeof label !== 'string' || !label.trim() || label.length > 100) throw new ObservationError('Factory label must contain 1..100 characters');
  if (!Number.isInteger(staleAfterMs) || staleAfterMs < 1000 || staleAfterMs > 86_400_000) throw new ObservationError('stale-after-ms must be between 1000 and 86400000');
  if (sessionId !== undefined && (typeof sessionId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(sessionId))) throw new ObservationError('session-id must be a safe actual host session ID');
  const root = await realpath(productRoot);
  const reference = await realpath(frameworkRoot);
  if (inside(reference, root) || inside(root, reference)) throw new ObservationError('The Operations Center must live outside the ADHD reference/framework tree');
  const git = spawnSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', windowsHide: true });
  if (git.status !== 0 || await realpath(git.stdout.trim()) !== root) throw new ObservationError('product-root must be the root of an existing product-owned Git repository');

  const base = join(root, '.factory', 'observability');
  await ensureDirectory(base);
  const lockPath = join(base, '.install.lock');
  let lock;
  try { lock = await open(lockPath, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') throw new ObservationError('Another installer holds the product observation registry lock', 409);
    throw error;
  }
  try {
    const directory = join(base, factoryId);
    await ensureDirectory(directory);
    const manifestPath = join(directory, 'manifest.json');
    const previous = await jsonFile(manifestPath, null);
    if (previous && (previous.version !== 1 || previous.factory_id !== factoryId || !previous.files)) throw new ObservationError('Existing center manifest is invalid');
    const configPath = join(directory, 'center.json');
    const config = await jsonFile(configPath, null);
    if (config && (config.version !== 1 || config.factory_id !== factoryId)) throw new ObservationError('Existing center belongs to a different Factory or schema');
    if (config && !['1.0.0', '1.1.0', VERSION].includes(config.runtime_version)) throw new ObservationError('Unsupported existing center runtime version');
    const nextConfig = normalizeConfig(config ? { ...config, runtime_version: VERSION } : {
      version: 1, runtime_version: VERSION, factory_id: factoryId, label: redact(label.trim()),
      created_at: new Date().toISOString(), stale_after_ms: staleAfterMs,
    });
    const profileFile = join(directory, 'profile.json');
    const currentProfile = await readProfile(profileFile, factoryId, { optional: true });
    let profile;
    if (profilePath !== undefined) {
      if (typeof profilePath !== 'string' || !profilePath.trim()) throw new ObservationError('profile must name a reviewed metadata JSON file');
      profile = (await readProfile(resolve(profilePath), factoryId)).profile;
    } else if (currentProfile.status === 'not-recorded') {
      profile = normalizeProfile({
        version: 1, factory_id: factoryId, product: { workspace: root },
        source: { ref: 'installer:verified-product-root', revision: VERSION }, updated_at: new Date().toISOString(),
      }, factoryId);
    }
    const catalogFile = join(directory, 'artifacts.json');
    const currentCatalog = await readCatalog(catalogFile, factoryId, { optional: true });
    let catalog;
    if (artifactsPath !== undefined) {
      if (typeof artifactsPath !== 'string' || !artifactsPath.trim()) throw new ObservationError('artifacts must name a reviewed artifact catalog JSON file');
      catalog = (await readCatalog(resolve(artifactsPath), factoryId)).catalog;
    } else if (currentCatalog.status === 'not-recorded') {
      catalog = normalizeCatalog({ version: 1, factory_id: factoryId, artifacts: [] }, factoryId);
    }
    const registryPath = join(base, 'registry.json');
    const registry = await jsonFile(registryPath, { version: 1, factories: {} });
    if (registry.version !== 1 || !registry.factories || typeof registry.factories !== 'object' || Array.isArray(registry.factories)) throw new ObservationError('Existing observation registry is invalid');
    for (const [id, entry] of Object.entries(registry.factories)) {
      if (!Array.isArray(entry.sessions)) throw new ObservationError('Existing Factory session bindings are invalid');
      if (id !== factoryId && sessionId && entry.sessions.includes(sessionId)) throw new ObservationError('A host session cannot be bound to multiple Factories');
    }
    const sessions = new Set(registry.factories[factoryId]?.sessions ?? []);
    if (sessionId) sessions.add(sessionId);
    registry.factories[factoryId] = { sessions: [...sessions] };

    const files = await sourceFiles(join(scripts, 'runtime'));
    const writes = [];
    const hashes = {};
    for (const [name, content] of files) {
      const target = join(directory, name);
      await ensureDirectory(dirname(target));
      const current = await existing(target);
      const expected = previous?.files[name];
      if (current && digest(current) !== digest(content) && (!expected || digest(current) !== expected)) {
        throw new ObservationError('Generated center source has local edits; reconcile them before upgrading');
      }
      hashes[name] = digest(content);
      writes.push([target, content]);
    }
    const collectorPath = join(base, 'capture.mjs');
    const collector = await readFile(join(scripts, 'capture.mjs'));
    const currentCollector = await existing(collectorPath);
    if (currentCollector && digest(currentCollector) !== digest(collector) && digest(currentCollector) !== registry.collector_digest) {
      throw new ObservationError('Product capture adapter has local edits; reconcile before upgrading');
    }
    registry.collector_digest = digest(collector);
    writes.push([collectorPath, collector]);
    const serverName = `factory-observability-${factoryId}`;
    const relativeCli = join('.factory', 'observability', factoryId, 'cli.mjs');
    const mcpSpecs = [
      [join(root, '.mcp.json'), 'mcpServers', { type: 'stdio', command: 'node', args: [relativeCli, 'mcp'] }],
      [join(root, '.vscode', 'mcp.json'), 'servers', { type: 'stdio', command: 'node', args: [join('${workspaceFolder}', relativeCli), 'mcp'] }],
    ];
    for (const [path, field, entry] of mcpSpecs) {
      await ensureDirectory(dirname(path));
      const document = await jsonFile(path, {});
      if (document[field] !== undefined && (!document[field] || typeof document[field] !== 'object' || Array.isArray(document[field]))) throw new ObservationError('Existing MCP server configuration is invalid');
      document[field] ??= {};
      if (document[field][serverName] && JSON.stringify(document[field][serverName]) !== JSON.stringify(entry)) throw new ObservationError('Factory MCP server name conflicts with existing configuration');
      document[field][serverName] = entry;
      writes.push([path, JSON.stringify(document, null, 2) + '\n']);
    }
    const hookPath = join(root, '.github', 'hooks', 'factory-observability.json');
    await ensureDirectory(dirname(hookPath));
    const hookEvents = ['preToolUse', 'postToolUse', 'subagentStart', 'subagentStop', 'agentStop', 'sessionStart', 'sessionEnd'];
    const hookDocument = {
      version: 1,
      hooks: Object.fromEntries(hookEvents.map((event) => [event, [{
        type: 'command', command: `node "${join('.factory', 'observability', 'capture.mjs')}" ${event}`, timeoutSec: 5,
      }]])),
    };
    const hookContent = JSON.stringify(hookDocument, null, 2) + '\n';
    const oldHook = await existing(hookPath);
    if (oldHook && digest(oldHook) !== digest(hookContent) && digest(oldHook) !== registry.hook_digest) throw new ObservationError('Observation hook registration has local edits; reconcile before upgrading');
    registry.hook_digest = digest(hookContent);
    writes.push([hookPath, hookContent]);
    writes.push([registryPath, JSON.stringify(registry, null, 2) + '\n']);
    writes.push([configPath, JSON.stringify(nextConfig, null, 2) + '\n']);
    if (profile) writes.push([profileFile, JSON.stringify(profile, null, 2) + '\n']);
    if (catalog) writes.push([catalogFile, JSON.stringify(catalog, null, 2) + '\n']);
    writes.push([manifestPath, JSON.stringify({ version: 1, factory_id: factoryId, runtime_version: VERSION, files: hashes }, null, 2) + '\n']);
    const ignorePath = join(base, '.gitignore');
    if (await existing(ignorePath) === null) writes.push([ignorePath, '.install.lock\n*.tmp\n']);
    const journal = join(directory, 'events.jsonl');
    if (await existing(journal) === null) writes.push([journal, '']);
    await ensureDirectory(join(directory, 'inbox'));
    for (const [path, content] of writes) await atomicWrite(path, content);
    const { createStore } = await import(pathToFileURL(join(directory, 'store.mjs')).href);
    const store = createStore(directory);
    await store.append(newFact(factoryId, previous ? 'center.revalidated' : 'center.installed',
      'Product-owned observation capability provisioned; this is not evidence of Factory progress or a running service.', {
        source: { kind: 'agent-report', ref: 'factory-observability-installer', revision: VERSION },
      }));
    if (!sessions.size) await store.append(newFact(factoryId, 'capture.gap',
      'Host hooks have no session binding. Only explicitly emitted facts are observable until the actual Factory session is bound.',
      { severity: 'warning' }));
    return {
      factory_id: factoryId, directory, state: previous ? 'revalidated' : 'installed',
      ui: { state: 'not-started', command: ['node', join(directory, 'cli.mjs'), 'serve'] },
      mcp: { state: 'configured-not-verified', server: serverName },
      capture: { bound_sessions: sessions.size, state: sessions.size ? 'configured-not-observed' : 'unbound' },
      metadata: { profile: profileFile, state: profile ? 'written' : 'preserved', api: '/api/v1/metadata', mcp_tool: 'factory_metadata' },
      artifacts: { catalog: catalogFile, state: catalog ? 'written' : 'preserved', api: '/api/v1/artifacts', mcp_tool: 'factory_artifacts' },
      git: { state: 'pending-versioning', paths: ['.factory', '.mcp.json', join('.vscode', 'mcp.json'), join('.github', 'hooks', 'factory-observability.json')] },
    };
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

export function parseArgs(args) {
  const names = { '--product-root': 'productRoot', '--factory-id': 'factoryId', '--label': 'label', '--session-id': 'sessionId', '--stale-after-ms': 'staleAfterMs', '--profile': 'profilePath', '--artifacts': 'artifactsPath' };
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const field = names[args[index]];
    const value = args[index + 1];
    if (!field || Object.hasOwn(options, field) || typeof value !== 'string' || !value.trim() || value.startsWith('--')) throw new ObservationError('Usage: install.mjs --product-root <absolute-git-root> --factory-id <slug> [--label <label>] [--session-id <actual-id>] [--stale-after-ms <milliseconds>] [--profile <reviewed-profile.json>] [--artifacts <reviewed-catalog.json>]');
    if (field === 'staleAfterMs' && !/^\d+$/.test(value)) throw new ObservationError('stale-after-ms must be an integer');
    options[field] = field === 'staleAfterMs' ? Number(value) : value;
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.stdout.write(`${JSON.stringify(await install(parseArgs(process.argv.slice(2))))}\n`); }
  catch (error) {
    process.stderr.write(`Factory observation provisioning failed: ${error instanceof ObservationError ? error.message : error.code ?? error.name}\n`);
    process.exitCode = 1;
  }
}
