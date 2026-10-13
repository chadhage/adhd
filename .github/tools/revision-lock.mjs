import { createHash } from 'node:crypto';
import { open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';

export const revisionOf = (content) => `sha256:${createHash('sha256').update(content).digest('hex')}`;

export async function readWithRevision(path) {
  try {
    const content = await readFile(path, 'utf8');
    return { exists: true, content, revision: revisionOf(content) };
  } catch (error) {
    if (error.code === 'ENOENT') return { exists: false, content: '', revision: revisionOf('') };
    throw error;
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

async function readHolder(lockPath) {
  try {
    return JSON.parse(await readFile(lockPath, 'utf8'));
  } catch {
    return null;
  }
}

async function tryCreateLock(lockPath, owner) {
  const handle = await open(lockPath, 'wx');
  try {
    await handle.writeFile(
      JSON.stringify({ pid: process.pid, host: os.hostname(), owner, acquiredAt: new Date().toISOString() }),
    );
  } finally {
    await handle.close();
  }
}

/**
 * Advisory exclusive lock. A lock is reclaimed only when its holder ran on this
 * host and that process no longer exists. No age-based timeout is applied: a
 * stale-age threshold is an operating value that must be measured and approved.
 */
async function acquire(lockPath, owner) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await tryCreateLock(lockPath, owner);
      return { ok: true };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    const holder = await readHolder(lockPath);
    const reclaimable = holder && holder.host === os.hostname() && !isProcessAlive(holder.pid);
    if (!reclaimable) return { ok: false, holder };
    await rm(lockPath, { force: true });
  }
  return { ok: false, holder: await readHolder(lockPath) };
}

/**
 * Applies `newContent` only if the file still has `expectedRevision`.
 * When the lock is held or the revision moved, returns the proposed change
 * instead of mutating, so the caller can queue or reconcile it.
 */
export async function applyIfRevision(path, expectedRevision, newContent, { owner = 'unknown' } = {}) {
  const lockPath = `${path}.lock`;
  const proposal = { baseRevision: expectedRevision, content: newContent };
  const lock = await acquire(lockPath, owner);
  if (!lock.ok) return { ok: false, reason: 'locked', holder: lock.holder, proposal };

  try {
    const current = await readWithRevision(path);
    if (current.revision !== expectedRevision) {
      return {
        ok: false,
        reason: 'revision-mismatch',
        currentRevision: current.revision,
        expectedRevision,
        proposal,
      };
    }
    const temporaryPath = `${path}.${process.pid}.tmp`;
    await writeFile(temporaryPath, newContent, 'utf8');
    await rename(temporaryPath, path);
    return { ok: true, revision: revisionOf(newContent) };
  } finally {
    await rm(lockPath, { force: true });
  }
}
