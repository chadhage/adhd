import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, rename, rm } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyIfRevision, readWithRevision } from '../.github/tools/revision-lock.mjs';
import { containsCredential, recordPath, redact, StudioError, validateBlueprint, validateReview } from './contracts.mjs';
import { validateFactoryState } from './factory-contracts.mjs';

const frameworkRoot = fileURLToPath(new URL('..', import.meta.url));
const timestamp = () => new Date().toISOString();
const comparable = (value) => process.platform === 'win32' ? value.toLowerCase() : value;

async function managedDirectory(root, parts) {
  let path = root;
  for (const part of parts) {
    path = join(path, part);
    let info;
    try {
      info = await lstat(path);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await mkdir(path);
      info = await lstat(path);
    }
    if (!info.isDirectory() || info.isSymbolicLink()) throw new StudioError('MANAGED_PATH_DENIED', 'Studio record and worktree directories cannot be linked or redirected.', 403);
  }
  return path;
}

export async function command(executable, args, cwd, { signal, maximum = 512 * 1024, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env, signal, windowsHide: true, shell: false });
    child.stdin.end();
    let output = '';
    let exceeded = false;
    const collect = (chunk) => {
      output += chunk.toString('utf8');
      if (Buffer.byteLength(output) > maximum) {
        exceeded = true;
        child.kill();
      }
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.once('error', reject);
    child.once('close', (code) => {
      if (exceeded) reject(new StudioError('OUTPUT_LIMIT', 'Command output exceeded the approved capture limit.', 422));
      else resolve({ code, output: redact(output) });
    });
  });
}

export class ProductRepository {
  constructor(root) {
    this.root = root;
    this.recordPaths = [recordPath];
  }

  async initialize() {
    this.root = await realpath(this.root);
    const framework = await realpath(frameworkRoot);
    const inFramework = relative(framework, this.root);
    if (!inFramework || (!inFramework.startsWith('..') && !/^[A-Za-z]:/.test(inFramework))) {
      throw new StudioError('FRAMEWORK_WORKSPACE', 'Choose a separate product repository, not the ADHD framework.', 403);
    }
    const actual = await this.git(['rev-parse', '--show-toplevel']);
    if ((await realpath(actual.trim())) !== this.root) throw new StudioError('INVALID_REPOSITORY', 'Choose the root of a product Git worktree.');
    await this.git(['rev-parse', 'HEAD']);
    return this;
  }

  async git(args, root = this.root, options) {
    const result = await command('git', ['--no-pager', ...args], root, options);
    if (result.code !== 0) throw new StudioError('GIT_FAILED', result.output.trim() || `Git exited with ${result.code}.`, 409);
    return result.output;
  }

  async info() {
    return { workspace: this.root, branch: (await this.git(['branch', '--show-current'])).trim(), head: (await this.git(['rev-parse', 'HEAD'])).trim() };
  }

  async assertClean() {
    const changes = (await this.git(['status', '--porcelain=v1', '--untracked-files=all'])).split(/\r?\n/).filter(Boolean);
    const foreign = changes.filter((line) => {
      const path = line.slice(3).replaceAll('\\', '/').replace(/^"|"$/g, '');
      return !this.recordPaths.includes(path) && path !== '.adhd/studio/service.lock' && path !== '.adhd/studio/controller.guard' && !path.startsWith('.adhd/studio/worktrees/');
    });
    if (foreign.length) throw new StudioError('DIRTY_WORKSPACE', 'Commit or reconcile existing product changes before starting or accepting a cycle.', 409);
  }

  async commitRecords(message) {
    await this.assertClean();
    await this.git(['add', '--', ...this.recordPaths]);
    const staged = (await this.git(['diff', '--cached', '--name-only'])).trim();
    if (staged && staged.split(/\r?\n/).some((path) => !this.recordPaths.includes(path))) throw new StudioError('STAGED_CHANGES', 'Unexpected staged files; no commit was made.', 409);
    if (staged) await this.git(['commit', '-m', message, '-m', 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>']);
    return (await this.info()).head;
  }

  async commitObservationSetup(factoryId) {
    const prefixes = [
      `.factory/observability/${factoryId}/`, '.factory/observability/registry.json',
      '.factory/observability/capture.mjs', '.factory/observability/.gitignore',
      '.mcp.json', '.vscode/mcp.json', '.github/hooks/factory-observability.json', recordPath,
    ];
    return this.commitManagedAssets(prefixes, 'Install product-owned Factory Operations Center');
  }

  async commitManagedAssets(prefixes, message) {
    const permitted = (path) => prefixes.some((prefix) => prefix.endsWith('/') ? path.startsWith(prefix) : path === prefix);
    const changes = (await this.git(['status', '--porcelain=v1', '--untracked-files=all'])).split(/\r?\n/).filter(Boolean);
    const foreign = changes.map((line) => line.slice(3).replaceAll('\\', '/')).filter((path) => !permitted(path)
      && path !== '.adhd/studio/controller.guard' && path !== '.adhd/studio/service.lock' && !path.startsWith('.adhd/studio/worktrees/'));
    if (foreign.length) throw new StudioError('DIRTY_WORKSPACE', 'Observation setup conflicts with unrelated product changes; no files were staged.', 409);
    const paths = changes.map((line) => line.slice(3).replaceAll('\\', '/')).filter(permitted);
    if (!paths.length) return;
    await this.git(['add', '--', ...paths]);
    const staged = (await this.git(['diff', '--cached', '--name-only'])).trim().split(/\r?\n/).filter(Boolean);
    if (staged.some((path) => !permitted(path))) throw new StudioError('STAGED_CHANGES', 'Unexpected observation staging; no commit was made.', 409);
    const added = (await this.git(['diff', '--cached', '--no-ext-diff', '--no-color'])).split(/\r?\n/).filter((line) => line.startsWith('+') && !line.startsWith('+++')).join('\n');
    if (containsCredential(added)) throw new StudioError('CREDENTIAL_CONTENT_DENIED', 'Potential credentials in observation configuration prevent its Git commit.', 403);
    await this.git(['commit', '-m', message, '-m', 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>']);
  }

  async createWorktree(id) {
    await this.assertClean();
    const directory = join(this.root, '.adhd', 'studio', 'worktrees', id);
    await managedDirectory(this.root, ['.adhd', 'studio', 'worktrees']);
    const branch = `studio/${id}`;
    const base = await this.info();
    await this.git(['worktree', 'add', '-b', branch, directory, base.head]);
    return { directory, branch, baseHead: base.head, targetBranch: base.branch };
  }

  async diff(run) {
    await this.assertWorktree(run);
    return this.git(['diff', '--no-ext-diff', '--no-color', run.baseHead, '--'], run.directory);
  }

  async assertWorktree(run) {
    const expected = join(this.root, '.adhd', 'studio', 'worktrees', run.id);
    if (comparable(await realpath(run.directory)) !== comparable(expected)) {
      throw new StudioError('WORKTREE_DENIED', 'The registered product worktree was redirected or replaced.', 403);
    }
  }

  async commitCandidate(run) {
    await this.assertWorktree(run);
    await this.git(['add', '--all'], run.directory);
    const staged = (await this.git(['diff', '--cached', '--name-only'], run.directory)).trim();
    if (!staged) throw new StudioError('NO_INCREMENT', 'No changed product files were produced; completion cannot be claimed.', 422);
    await this.git(['commit', '-m', `Implement Studio card ${run.cardId}`, '-m', 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>'], run.directory);
    return (await this.git(['rev-parse', 'HEAD'], run.directory)).trim();
  }

  async accept(run) {
    await this.assertClean();
    const current = await this.info();
    if (current.branch !== run.targetBranch) throw new StudioError('BRANCH_CHANGED', 'The target branch changed; reconcile before integration.', 409);
    const changes = (await this.git(['diff', '--name-only', run.baseHead, 'HEAD'])).trim().split(/\r?\n/).filter(Boolean);
    if (changes.some((path) => !this.recordPaths.includes(path))) throw new StudioError('BASE_CHANGED', 'Product code changed since this cycle started; integration needs reconciliation.', 409);
    if ((await this.git(['rev-parse', 'HEAD'], run.directory)).trim() !== run.candidateHead
      || (await this.git(['status', '--porcelain'], run.directory)).trim()) {
      throw new StudioError('CANDIDATE_CHANGED', 'The verified candidate changed; verify it again before acceptance.', 409);
    }
    await this.commitRecords(`Record acceptance request for ${run.cardId}`);
    await this.git(['merge', '--no-ff', '--no-edit', run.branch, '-m', `Integrate Studio card ${run.cardId}`, '-m', 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>']);
    return (await this.info()).head;
  }
}

export class Records {
  constructor(repository, { store, leaseGuard } = {}) {
    this.repository = repository;
    this.path = join(repository.root, '.adhd', 'studio', 'records.json');
    this.queue = Promise.resolve();
    this.revision = null;
    this.lease = null;
    this.store = store;
    this.leaseGuard = leaseGuard;
    this.exportRevision = null;
  }

  async initialize() {
    await managedDirectory(this.repository.root, ['.adhd', 'studio']);
    try {
      if ((await lstat(this.path)).isSymbolicLink()) throw new StudioError('MANAGED_PATH_DENIED', 'Product records cannot be a linked file.', 403);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const lock = join(dirname(this.path), 'service.lock');
    if (this.store || this.leaseGuard) {
      await this.leaseGuard?.verify();
      try {
        await lstat(lock);
        throw new StudioError('LEASE_MIGRATION_REQUIRED', 'An existing native service lease must be independently reconciled before switching to container/external-store leases.', 409);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    } else {
      try {
        this.lease = await open(lock, 'wx');
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const holder = JSON.parse(await readFile(lock, 'utf8'));
        let alive = true;
        if (holder.host === hostname() && Number.isInteger(holder.pid)) {
          try { process.kill(holder.pid, 0); } catch (probe) {
            if (probe.code === 'ESRCH') alive = false;
            else if (probe.code !== 'EPERM') throw probe;
          }
        }
        if (alive) throw new StudioError('SERVICE_ALREADY_RUNNING', 'Another service owns these product records. Stop or reconcile it before starting a second instance.', 409);
        await rm(lock);
        this.lease = await open(lock, 'wx');
      }
      await this.lease.writeFile(JSON.stringify({ host: hostname(), pid: process.pid }));
    }
    const snapshot = await readWithRevision(this.path);
    const initial = {
      version: 1, productId: randomUUID(), blueprint: null, demands: [], runs: [], completed: [], history: [],
      recordsIndex: { path: recordPath, sections: ['blueprint', 'demands', 'runs', 'completed', 'history'], writer: 'Studio service', transcriptCapture: false },
    };
    const content = snapshot.exists ? snapshot.content : `${JSON.stringify(initial, null, 2)}\n`;
    if (this.store) {
      const external = await this.store.initialize(content);
      if (snapshot.exists && snapshot.revision !== external.revision && snapshot.revision !== external.projectionRevision) {
        throw new StudioError('EXTERNAL_STATE_CHANGE', 'The product Git export conflicts with external state. Preserve both for reconciliation.', 409);
      }
      const projected = await this.apply(snapshot.revision, external.content);
      if (!projected.ok) throw new StudioError('RECORD_CONFLICT', 'Could not restore the external state Git projection.', 409);
      await this.store.projected(projected.revision);
      this.exportRevision = projected.revision;
    } else if (!snapshot.exists) {
      const created = await this.apply(snapshot.revision, content);
      if (!created.ok) throw new StudioError('RECORD_CONFLICT', 'Records changed during initialization.', 409);
    }
    this.exportRevision = (await readWithRevision(this.path)).revision;
    this.revision = this.store ? (await this.store.read()).revision : (await readWithRevision(this.path)).revision;
    return this;
  }

  async apply(expected, content) {
    if (!this.store && !this.leaseGuard) return applyIfRevision(this.path, expected, content, { owner: 'studio' });
    await this.leaseGuard?.verify();
    if (this.store) await this.store.read();
    try {
      await lstat(`${this.path}.lock`);
      throw new StudioError('LEASE_MIGRATION_REQUIRED', 'A legacy per-write lock must be reconciled before adopting the externally leased writer.', 409);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const current = await readWithRevision(this.path);
    if (current.revision !== expected) return { ok: false, reason: 'revision-mismatch' };
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally { await handle.close(); }
    await rename(temporary, this.path);
    return { ok: true, revision: (await readWithRevision(this.path)).revision };
  }

  async read() {
    const result = this.queue.then(() => this.readCurrent());
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async readCurrent() {
    await this.leaseGuard?.verify();
    await managedDirectory(this.repository.root, ['.adhd', 'studio']);
    if ((await lstat(this.path)).isSymbolicLink()) throw new StudioError('MANAGED_PATH_DENIED', 'Product records cannot be a linked file.', 403);
    const exported = await readWithRevision(this.path);
    if (this.store && exported.revision !== this.exportRevision) throw new StudioError('EXTERNAL_STATE_CHANGE', 'The product Git projection changed outside its designated writer.', 409);
    const snapshot = this.store ? await this.store.read() : exported;
    if (this.revision && snapshot.revision !== this.revision) throw new StudioError('EXTERNAL_STATE_CHANGE', 'Product records changed outside the designated writer. Stop and reconcile before dependent actions.', 409);
    let data;
    try {
      data = JSON.parse(snapshot.content);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      throw new StudioError('CORRUPT_RECORDS', 'Product records are corrupt; preserve and reconcile them before proceeding.', 409);
    }
    if (data.version !== 1 || !Array.isArray(data.runs) || !Array.isArray(data.history)
      || !Array.isArray(data.demands) || !Array.isArray(data.completed)) {
      throw new StudioError('CORRUPT_RECORDS', 'Product records do not match the Studio schema.', 409);
    }
    if (data.blueprint) validateBlueprint(data.blueprint);
    if (data.factory) validateFactoryState(data.factory);
    for (const run of data.runs) {
      if (typeof run.id !== 'string' || !/^[a-f0-9-]{36}$/.test(run.id)
        || !Number.isInteger(run.phase) || run.phase < 0 || run.phase > 4
        || !['running', 'paused', 'interrupted', 'review-required', 'verifying', 'verified', 'complete', 'cancelled', 'failed', 'integration-failed'].includes(run.status)) {
        throw new StudioError('CORRUPT_RECORDS', 'An execution record has invalid identity or state.', 409);
      }
      validateReview(run.review, data.blueprint);
      const expected = join(this.repository.root, '.adhd', 'studio', 'worktrees', run.id);
      if ((run.directory && comparable(run.directory) !== comparable(expected))
        || (run.branch && run.branch !== `studio/${run.id}`)
        || (run.baseHead && !/^[a-f0-9]{40,64}$/.test(run.baseHead))) {
        throw new StudioError('CORRUPT_RECORDS', 'An execution record references an unapproved workspace or Git revision.', 409);
      }
    }
    return { ...snapshot, data };
  }

  async update(action, expectedRevision) {
    const execute = async () => {
      const snapshot = await this.readCurrent();
      if (expectedRevision && expectedRevision !== snapshot.revision) throw new StudioError('STALE_REVISION', 'Records changed. Reload before saving.', 409);
      await action(snapshot.data);
      const content = `${JSON.stringify(snapshot.data, null, 2)}\n`;
      if (Buffer.byteLength(content) > 2 * 1024 * 1024) throw new StudioError('RECORD_LIMIT', 'Archive records under your retention policy before adding more history.', 409);
      const result = this.store ? await this.store.update(snapshot.revision, content) : await this.apply(snapshot.revision, content);
      if (!result.ok) throw new StudioError('RECORD_CONFLICT', `Records update failed: ${result.reason}.`, 409);
      if (this.store) {
        const projection = await this.apply(this.exportRevision, content);
        if (!projection.ok) throw new StudioError('STORE_EXPORT_FAILED', 'External state was saved but its Git export failed; do not replay consequential actions.', 409);
        this.exportRevision = projection.revision;
        await this.store.projected(projection.revision);
      }
      this.revision = result.revision;
      return { data: snapshot.data, revision: result.revision };
    };
    const result = this.queue.then(execute);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  static event(data, type, details) {
    data.history.push({ id: randomUUID(), time: timestamp(), type, source: 'Studio service', ...details });
  }

  async close() {
    if (this.store) await this.store.close();
    if (this.leaseGuard) await this.leaseGuard.close();
    if (!this.lease) return;
    await this.lease.close();
    this.lease = null;
    await rm(join(dirname(this.path), 'service.lock'), { force: true });
  }
}
