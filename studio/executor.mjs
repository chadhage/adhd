import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { command } from './repository.mjs';
import { digest, object, scopedPath, StudioError, text } from './contracts.mjs';

export function immutableImage(value) {
  const image = text(value, 'Immutable container image', 400);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*@sha256:[a-f0-9]{64}$/.test(image) || image.includes('://') || image.includes('//')) {
    throw new StudioError('IMMUTABLE_IMAGE_REQUIRED', 'Use an owner-reviewed registry image pinned with @sha256:<64 hex characters>.');
  }
  return image;
}

export class DockerExecutor {
  constructor({ image, context = 'default', cpu, memoryMiB, commandFn = command } = {}) {
    this.image = immutableImage(image);
    if (!/^[a-zA-Z0-9_.-]+$/.test(context)) throw new StudioError('EXECUTOR_CONFIGURATION', 'Specify an explicit Docker context name.');
    if (!Number.isFinite(cpu) || cpu <= 0 || !Number.isInteger(memoryMiB) || memoryMiB < 256) throw new StudioError('EXECUTOR_CONFIGURATION', 'Provide owner-approved verification CPU and memory limits.');
    this.context = context;
    this.cpu = cpu;
    this.memoryMiB = memoryMiB;
    this.command = commandFn;
    this.policyDigest = digest({ kind: 'docker', image: this.image, context, cpu, memoryMiB });
  }

  async docker(args, cwd, options) {
    return this.command('docker', ['--context', this.context, ...args], cwd, options);
  }

  async inspect() {
    const metadata = await this.docker(['version', '--format', '{{json .Server}}']);
    if (metadata.code !== 0) throw new StudioError('EXECUTOR_UNAVAILABLE', 'The selected Docker daemon is unavailable. No inference or unisolated verification fallback is permitted.', 503);
    const image = await this.docker(['image', 'inspect', this.image, '--format', '{{.Id}}']);
    if (image.code !== 0) throw new StudioError('EXECUTOR_IMAGE_UNAVAILABLE', 'Pull/build and review the pinned verification image before starting production. Image pulls are not implicit.', 503);
    return { kind: 'docker', image: this.image, context: this.context, isolation: 'Non-root, no network, read-only root, no capabilities, bounded CPU/memory/PIDs; live enforcement requires separate assurance.' };
  }

  async snapshot(directory) {
    const root = await mkdtemp(join(tmpdir(), 'adhd-verify-'));
    try {
      const files = await command('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], directory);
      if (files.code !== 0) throw new StudioError('GIT_FAILED', files.output, 409);
      const hash = createHash('sha256');
      let total = 0;
      for (const path of [...new Set(files.output.split('\0').filter(Boolean))].sort()) {
        if (path.startsWith('.adhd/') || path.startsWith('.factory/') || path === '.mcp.json' || path.startsWith('.vscode/')) continue;
        const source = await scopedPath(directory, path);
        const bytes = await readFile(source);
        total += bytes.length;
        if (bytes.length > 20 * 1024 * 1024 || total > 256 * 1024 * 1024) throw new StudioError('SNAPSHOT_LIMIT', 'The reviewed verification snapshot exceeds its capture limit.');
        const destination = join(root, path);
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, bytes, { mode: 0o644 });
        hash.update(path).update('\0').update(bytes).update('\0');
      }
      return { root, digest: hash.digest('hex') };
    } catch (error) {
      await rm(root, { recursive: true, force: true });
      throw error;
    }
  }

  async execute({ directory, verification, signal, maximumMillis }) {
    object(verification, ['command', 'args']);
    if (typeof verification.command !== 'string' || !Array.isArray(verification.args) || !verification.args.every((arg) => typeof arg === 'string')) {
      throw new StudioError('EXECUTOR_CONFIGURATION', 'Use the owner-configured executable and argument list.');
    }
    signal.throwIfAborted();
    const snapshot = await this.snapshot(directory);
    const id = randomUUID();
    const name = `adhd-verify-${id}`;
    let started = false;
    try {
      started = true;
      const result = await this.docker([
        'run', '--name', name, '--label', `adhd.verification=${id}`, '--read-only', '--network', 'none',
        '--user', '1000:1000', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
        '--cpus', String(this.cpu), '--memory', `${this.memoryMiB}m`, '--pids-limit', '256',
        '--tmpfs', `/tmp:rw,nosuid,nodev,size=${this.memoryMiB}m`,
        '--mount', `type=bind,source=${snapshot.root},target=/source,readonly`,
        '--entrypoint', 'node', this.image, '/opt/adhd/studio/verify-entry.mjs', JSON.stringify(verification),
      ], directory, { signal: AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, maximumMillis))]) });
      return { ...result, sourceDigest: snapshot.digest, image: this.image, isolated: true };
    } finally {
      try {
        if (started) {
          const observed = await this.docker(['inspect', '--format', '{{index .Config.Labels "adhd.verification"}}', name], directory);
          if (observed.code === 0) {
            if (observed.output.trim() !== id) throw new StudioError('EXECUTOR_CLEANUP_DENIED', 'The verification container identity does not match this invocation.');
            const removed = await this.docker(['rm', '--force', name], directory);
            if (removed.code !== 0) throw new StudioError('EXECUTOR_CLEANUP_FAILED', 'The owned verification container did not stop cleanly.', 503);
          } else if (!/No such (?:object|container)/i.test(observed.output)) {
            throw new StudioError('EXECUTOR_CLEANUP_UNVERIFIED', 'Verification container cleanup could not be independently checked.', 503);
          }
        }
      } finally { await rm(snapshot.root, { recursive: true, force: true }); }
    }
  }
}

export class RemoteExecutor {
  constructor({ origin, token, fetchFn = fetch } = {}) {
    const url = new URL(origin);
    if (url.origin !== origin || url.username || url.password || url.protocol !== 'https:') throw new StudioError('EXECUTOR_CONFIGURATION', 'Use an owner-configured exact HTTPS executor origin.');
    if (typeof token !== 'string' || token.length < 32) throw new StudioError('EXECUTOR_CONFIGURATION', 'Use a distinct executor credential from protected runtime storage.');
    this.origin = origin;
    this.token = token;
    this.fetch = fetchFn;
    this.policyDigest = digest({ kind: 'remote', origin });
  }

  async request(path, body, signal) {
    const response = await this.fetch(`${this.origin}${path}`, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', credentials: 'omit', signal,
      headers: { Authorization: `Bearer ${this.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    if (!response.ok) throw new StudioError('EXECUTOR_FAILED', result.error?.message ?? `Executor returned ${response.status}.`, 503);
    return result;
  }

  async inspect() {
    const result = await this.request('/api/executor/health');
    if (result.kind !== 'docker' || !result.image) throw new StudioError('EXECUTOR_UNAVAILABLE', 'The configured executor did not report a supported isolated runtime.', 503);
    return result;
  }

  async execute({ directory, verification, signal, maximumMillis }) {
    const result = await this.request('/api/executor/verify', { directory, verification, maximumMillis }, signal);
    if (!Number.isInteger(result.code) || typeof result.output !== 'string' || result.isolated !== true || !/^[a-f0-9]{64}$/.test(result.sourceDigest)) {
      throw new StudioError('UNVERIFIED_EXECUTION', 'The executor did not supply an isolated, source-bound result.', 503);
    }
    return result;
  }
}
