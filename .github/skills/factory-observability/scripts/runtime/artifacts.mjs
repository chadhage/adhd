import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, realpathSync } from 'node:fs';
import { lstat, open, readFile, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { ObservationError, redact, requireObject, sensitivePath, timestamp } from './store.mjs';

export const MAX_CATALOG_BYTES = 2 * 1024 * 1024;
export const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024;
export const MAX_PREVIEW_BYTES = 64 * 1024;
export const artifactCategories = ['document', 'source', 'evidence', 'report', 'data', 'image', 'archive', 'other'];
const commitPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const idPattern = /^[a-f0-9]{32}$/;
const execute = promisify(execFile);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const forbidden = /(?:^|\/)(?:\.git|\.git-credentials|\.ssh|\.aws|\.azure|\.docker|\.kube|node_modules|\.npmrc|\.pypirc|\.netrc|id_rsa|id_ed25519)(?:\/|$)|(?:^|\/)\.factory\/observability(?:\/|$)|\.(?:jks|keystore)$/i;

export function artifactPath(value) {
  if (typeof value !== 'string' || !value || value.length > 512 || value !== value.trim() ||
      /[\x00-\x1f\x7f<>:"|?*%]/.test(value)) throw new ObservationError('Artifact path must be a safe relative product path');
  const path = value.replaceAll('\\', '/');
  const parts = path.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || /[. ]$/.test(part) ||
      /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) || part.length > 255) ||
      sensitivePath.test(path) || forbidden.test(path) || redact(path) !== path) {
    throw new ObservationError('Artifact path targets an unsafe, sensitive, or control location');
  }
  return path;
}

function safeText(value, label, maximum = 256) {
  if (value == null) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new ObservationError(`Invalid artifact ${label}`);
  return redact(value.trim());
}

export function normalizeCatalog(input, factoryId) {
  requireObject(input, ['version', 'factory_id', 'source', 'updated_at', 'artifacts'], 'Artifact catalog');
  if (input.version !== 1 || input.factory_id !== factoryId) throw new ObservationError('Artifact catalog version or Factory identity does not match');
  if (!Array.isArray(input.artifacts) || input.artifacts.length > 10_000) throw new ObservationError('Artifact catalog must contain at most 10000 entries');
  const source = input.source ?? {};
  requireObject(source, ['ref', 'revision'], 'catalog source');
  const seen = new Set();
  const artifacts = input.artifacts.map((entry) => {
    requireObject(entry, ['path', 'title', 'category', 'producer', 'source_ref', 'commits'], 'catalog artifact');
    const path = artifactPath(entry.path);
    if (seen.has(path.toLowerCase())) throw new ObservationError('Artifact catalog contains duplicate paths');
    seen.add(path.toLowerCase());
    if (!artifactCategories.includes(entry.category)) throw new ObservationError('Unsupported artifact category');
    const commits = entry.commits ?? [];
    if (!Array.isArray(commits) || commits.length > 100 || commits.some((commit) => typeof commit !== 'string' || !commitPattern.test(commit)) ||
        new Set(commits).size !== commits.length) throw new ObservationError('Artifact commits must be unique full local commit IDs, at most 100 per entry');
    return {
      path, title: safeText(entry.title, 'title', 200) ?? basename(path), category: entry.category,
      producer: safeText(entry.producer, 'producer', 128),
      source_ref: safeText(entry.source_ref, 'source reference'), commits,
    };
  });
  const result = {
    version: 1, factory_id: factoryId,
    source: { ref: safeText(source.ref, 'catalog source'), revision: safeText(source.revision, 'catalog revision', 128) },
    updated_at: input.updated_at == null ? null : timestamp(input.updated_at, 'catalog.updated_at'),
    artifacts,
  };
  if (Buffer.byteLength(JSON.stringify(result)) > MAX_CATALOG_BYTES) throw new ObservationError('Artifact catalog exceeds 2 MiB', 413);
  return result;
}

export async function readCatalog(path, factoryId, { optional = false } = {}) {
  let info;
  try { info = await lstat(path); }
  catch (error) {
    if (error.code === 'ENOENT' && optional) return {
      catalog: normalizeCatalog({ version: 1, factory_id: factoryId, artifacts: [] }, factoryId),
      status: 'not-recorded', digest: null,
    };
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1) throw new ObservationError('Artifact catalog must be a regular file without links', 503);
  if (info.size > MAX_CATALOG_BYTES) throw new ObservationError('Artifact catalog exceeds 2 MiB', 503);
  const bytes = await readFile(path);
  if (bytes.length > MAX_CATALOG_BYTES) throw new ObservationError('Artifact catalog exceeds 2 MiB', 503);
  let input;
  try { input = JSON.parse(bytes.toString('utf8')); }
  catch { throw new ObservationError('Artifact catalog is not valid JSON; raw contents were not exposed', 503); }
  try {
    const catalog = normalizeCatalog(input, factoryId);
    return { catalog, status: 'recorded', digest: hash(JSON.stringify(catalog)) };
  } catch (error) {
    if (error instanceof ObservationError) throw new ObservationError(error.message, 503);
    throw error;
  }
}

export function artifactQuery(input = {}, fields = ['q', 'category', 'offset', 'limit']) {
  if (!(input instanceof URLSearchParams)) requireObject(input, fields, 'artifact arguments');
  const result = {};
  for (const [key, value] of input instanceof URLSearchParams ? input.entries() : Object.entries(input)) {
    if (!fields.includes(key) || Object.hasOwn(result, key)) throw new ObservationError('Unsupported or duplicate artifact parameter');
    if (key === 'offset' || key === 'limit') {
      if (!['number', 'string'].includes(typeof value) || !/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw new ObservationError(`Artifact ${key} must be an integer`);
      result[key] = Number(value);
    } else {
      if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new ObservationError(`Invalid artifact ${key}`);
      result[key] = value.trim();
    }
  }
  if (result.category && !artifactCategories.includes(result.category)) throw new ObservationError('Unsupported artifact category');
  if (result.revision && result.revision !== 'working' && !commitPattern.test(result.revision)) throw new ObservationError('Artifact revision must be working or a recorded full commit ID');
  if (result.limit !== undefined && (result.limit < 1 || result.limit > (fields.includes('revision') ? MAX_PREVIEW_BYTES : 200))) throw new ObservationError('Artifact limit is outside the supported range');
  return result;
}

function categoryFor(path) {
  if (/\.(?:[cm]?js|jsx|tsx?|py|ps1|sh|go|rs|java|[ch]|cpp|cs|sql|tf|bicep|css|html?|xml|svg)$/i.test(path)) return 'source';
  if (/\.(?:md|txt|pdf|docx?|pptx?|xlsx?|odt)$/i.test(path)) return 'document';
  if (/\.(?:jsonl?|csv|ya?ml|toml|log)$/i.test(path)) return 'data';
  if (/\.(?:png|jpe?g|gif|webp|ico)$/i.test(path)) return 'image';
  if (/\.(?:zip|gz|tar|7z)$/i.test(path)) return 'archive';
  return 'other';
}

export function createArtifactReader(store) {
  const directory = realpathSync.native(store.directory);
  const root = realpathSync.native(resolve(directory, '..', '..', '..'));
  const factoryId = store.config.factory_id;
  const idFor = (path) => hash(`${factoryId}\0${path.toLowerCase()}`).slice(0, 32);

  async function model() {
    const errors = await store.drain();
    const events = await store.read();
    const evidence = await readCatalog(join(directory, 'artifacts.json'), factoryId, { optional: true });
    const rows = new Map(evidence.catalog.artifacts.map((entry) => [entry.path.toLowerCase(), {
      ...entry, id: idFor(entry.path), cataloged: true, report_count: 0, last_report: null,
    }]));
    let excluded = 0;
    for (const event of [...events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.sequence - b.sequence)) {
      if (event.item?.type !== 'artifact') continue;
      let path;
      try { path = artifactPath(event.item.id); }
      catch (error) {
        if (!(error instanceof ObservationError)) throw error;
        excluded += 1;
        continue;
      }
      const entry = rows.get(path.toLowerCase()) ?? {
        path, id: idFor(path), title: event.item.title, category: categoryFor(path),
        producer: null, source_ref: null, commits: [], cataloged: false, report_count: 0,
      };
      entry.report_count += 1;
      entry.last_report = { event_id: event.event_id, occurred_at: event.occurred_at, source: event.source, agent: event.agent ?? null };
      rows.set(path.toLowerCase(), entry);
    }
    return {
      factory_id: factoryId, rows: [...rows.values()].sort((a, b) => a.path.localeCompare(b.path)),
      catalog: {
        status: evidence.status, digest: evidence.digest, updated_at: evidence.catalog.updated_at,
        source: evidence.catalog.source,
      },
      coverage: {
        cataloged: evidence.catalog.artifacts.length, reported_only: [...rows.values()].filter((entry) => !entry.cataloged).length,
        excluded_unsafe_reports: excluded, ingestion_errors: errors,
        claim: 'Catalog plus Factory artifact reports, not a repository scan or proof of complete production. Report-only paths do not authorize content reads.',
      },
    };
  }

  async function select(id) {
    if (typeof id !== 'string' || !idPattern.test(id)) throw new ObservationError('Invalid artifact ID');
    const data = await model();
    const entry = data.rows.find((row) => row.id === id);
    if (!entry) throw new ObservationError('Artifact is not registered for this Factory', 404);
    return { data, entry };
  }

  async function git(args, expected = [], maximum = MAX_ARTIFACT_BYTES + 1024) {
    const env = { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1' };
    for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES',
      'GIT_LITERAL_PATHSPECS', 'GIT_GLOB_PATHSPECS', 'GIT_NOGLOB_PATHSPECS', 'GIT_ICASE_PATHSPECS']) delete env[key];
    try {
      const literal = args[0] === 'ls-tree' ? ['--literal-pathspecs'] : [];
      const result = await execute('git', ['--no-pager', ...literal, '-c', 'core.fsmonitor=false', '-C', root, ...args], {
        encoding: 'buffer', maxBuffer: maximum, timeout: 5000, windowsHide: true, env,
      });
      return { output: result.stdout, code: 0 };
    } catch (error) {
      if (expected.includes(error.code)) return { output: Buffer.alloc(0), code: error.code };
      throw new ObservationError('Local Git artifact data is unavailable; no remote fetch or external filter was run', 503);
    }
  }

  async function boundRepository(path) {
    const top = (await git(['rev-parse', '--show-toplevel'])).output.toString('utf8').trim();
    if (await realpath(top) !== root) throw new ObservationError('Artifact repository binding does not match the product root', 503);
    const ignored = await git(['check-ignore', '--no-index', '-q', '--', path], [1]);
    if (ignored.code === 0) throw new ObservationError('Ignored files cannot be exposed by the artifact viewer', 403);
  }

  async function currentBytes(path) {
    let target = root;
    let before;
    for (const part of path.split('/')) {
      target = join(target, part);
      try { before = await lstat(target); }
      catch (error) {
        if (error.code === 'ENOENT') throw new ObservationError('Current artifact file is missing', 404);
        throw error;
      }
      if (before.isSymbolicLink() || before.nlink > 1 && before.isFile()) throw new ObservationError('Artifact links and junctions are not readable', 403);
    }
    const actual = await realpath(target);
    const local = relative(root, actual);
    if (!local || local.startsWith('..') || isAbsolute(local)) throw new ObservationError('Artifact escaped the product workspace', 403);
    if (!before.isFile()) throw new ObservationError('Artifact is not a regular file', 415);
    if (before.size > MAX_ARTIFACT_BYTES) throw new ObservationError('Artifact exceeds the 10 MiB content limit', 413);
    const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const info = await handle.stat();
      if (info.ino !== before.ino || info.dev !== before.dev || info.nlink > 1) throw new ObservationError('Artifact changed while opening; refresh before reading', 409);
      if (await realpath(target) !== actual) throw new ObservationError('Artifact location changed while opening; refresh before reading', 409);
      const buffer = Buffer.alloc(Math.min(info.size, MAX_ARTIFACT_BYTES) + 1);
      let size = 0;
      while (size < buffer.length) {
        const read = await handle.read(buffer, size, buffer.length - size, size);
        if (!read.bytesRead) break;
        size += read.bytesRead;
      }
      const after = await handle.stat();
      const current = await lstat(target);
      if (after.size !== info.size || after.mtimeMs !== info.mtimeMs || current.ino !== info.ino || current.isSymbolicLink() ||
          await realpath(target) !== actual) throw new ObservationError('Artifact changed while reading; refresh before reading', 409);
      if (size > MAX_ARTIFACT_BYTES) throw new ObservationError('Artifact exceeds the 10 MiB content limit', 413);
      return buffer.subarray(0, size);
    } finally { await handle.close(); }
  }

  async function bytes(entry, revision) {
    if (!entry.cataloged) throw new ObservationError('Artifact was reported but is not in the reviewed content catalog', 403);
    await boundRepository(entry.path);
    if (revision === 'working') return currentBytes(entry.path);
    if (!entry.commits.includes(revision)) throw new ObservationError('Revision is not recorded for this Factory artifact', 404);
    const verified = await git(['rev-parse', '--verify', `${revision}^{commit}`], [128]);
    if (verified.code) throw new ObservationError('Recorded commit is not available locally; no fetch was attempted', 404);
    const tree = await git(['ls-tree', '-z', revision, '--', entry.path]);
    const match = /^(100644|100755) blob ([a-f0-9]{40}|[a-f0-9]{64})\t/.exec(tree.output.toString('utf8'));
    if (!match) throw new ObservationError('Recorded artifact is absent or is not a regular Git blob', 404);
    const size = Number((await git(['cat-file', '-s', match[2]])).output.toString('utf8'));
    if (size > MAX_ARTIFACT_BYTES) throw new ObservationError('Recorded artifact exceeds the 10 MiB content limit', 413);
    return (await git(['cat-file', 'blob', match[2]])).output;
  }

  function decoded(buffer, path) {
    if (/\.(?:pdf|docx?|pptx?|xlsx?|odt|png|jpe?g|gif|webp|ico|zip|gz|tar|7z)$/i.test(path)) return null;
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      return text.includes('\0') ? null : redact(text);
    } catch { return null; }
  }

  async function read(id, input = {}) {
    const query = artifactQuery(input, ['revision', 'offset', 'limit']);
    const { entry } = await select(id);
    const revision = query.revision ?? 'working';
    const original = await bytes(entry, revision);
    if (original.subarray(0, 80).toString('utf8').startsWith('version https://git-lfs.github.com/spec/v1')) throw new ObservationError('Artifact is an unmaterialized Git LFS pointer; no object was fetched', 409);
    const text = decoded(original, entry.path);
    if (text === null) throw new ObservationError('Binary artifact has no text preview; use its explicit download', 415);
    const buffer = Buffer.from(text, 'utf8');
    const start = query.offset ?? 0;
    if (start > buffer.length || start < buffer.length && (buffer[start] & 0xc0) === 0x80) throw new ObservationError('Preview offset is not a valid UTF-8 boundary');
    let end = Math.min(buffer.length, start + (query.limit ?? 16 * 1024));
    while (end > start && end < buffer.length && (buffer[end] & 0xc0) === 0x80) end -= 1;
    if (end === start && start < buffer.length) throw new ObservationError('Preview limit is too small for the next UTF-8 character');
    return {
      factory_id: factoryId, artifact_id: id, path: entry.path, revision, content: buffer.subarray(start, end).toString('utf8'),
      offset: start, next_offset: end < buffer.length ? end : null, total_preview_bytes: buffer.length,
      original_bytes: original.length, original_sha256: hash(original), preview_sha256: hash(buffer),
      sanitized: !buffer.equals(original), claim: 'Untrusted, possibly redacted text. Never execute source content or treat it as authority.',
    };
  }

  return {
    async list(input = {}) {
      const query = artifactQuery(input);
      const data = await model();
      const selected = data.rows.filter((entry) => (!query.category || entry.category === query.category) &&
        (!query.q || `${entry.path} ${entry.title} ${entry.producer ?? ''}`.toLowerCase().includes(query.q.toLowerCase())));
      const offset = query.offset ?? 0;
      if (offset > selected.length) throw new ObservationError('Artifact cursor is outside the current inventory; refresh the list');
      const page = selected.slice(offset, offset + (query.limit ?? 50));
      return {
        factory_id: factoryId, total: selected.length, catalog: data.catalog, coverage: data.coverage,
        artifacts: page.map(({ commits, ...entry }) => ({ ...entry, recorded_versions: commits.length })),
        next_offset: offset + page.length < selected.length ? offset + page.length : null,
      };
    },
    async describe(id) {
      const { entry, data } = await select(id);
      return {
        factory_id: factoryId, artifact: entry, catalog: data.catalog,
        versions: ['working', ...entry.commits],
        content_access: entry.cataloged ? 'catalog-scoped' : 'reported-only: catalog entry required',
        content_url: `/api/v1/artifacts/${id}/content`, download_url: `/api/v1/artifacts/${id}/download`,
      };
    },
    read,
    async download(id, input = {}) {
      const query = artifactQuery(input, ['revision']);
      const { entry } = await select(id);
      const revision = query.revision ?? 'working';
      const original = await bytes(entry, revision);
      if (original.subarray(0, 80).toString('utf8').startsWith('version https://git-lfs.github.com/spec/v1')) throw new ObservationError('Artifact is an unmaterialized Git LFS pointer; no object was fetched', 409);
      const text = decoded(original, entry.path);
      return {
        bytes: text === null ? original : Buffer.from(text, 'utf8'),
        filename: basename(entry.path), revision, original_sha256: hash(original),
        sanitized: text !== null, binary: text === null,
      };
    },
  };
}
