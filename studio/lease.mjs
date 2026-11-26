import { lstat, stat, realpath } from 'node:fs/promises';
import { fstatSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { command } from './repository.mjs';
import { StudioError } from './contracts.mjs';

export async function inheritedContainerLease(workspace, descriptor) {
  if (process.platform !== 'linux' || descriptor !== '9') throw new StudioError('LEASE_REQUIRED', 'Container volume mode requires the shipped Linux flock entrypoint.');
  const path = join(await realpath(workspace), '.adhd', 'studio', 'controller.guard');
  const kind = await lstat(path);
  if (!kind.isFile() || kind.isSymbolicLink()) throw new StudioError('LEASE_REQUIRED', 'The product lock must be an ordinary, unlinked file.');
  if (await realpath('/proc/self/fd/9') !== await realpath(path)) throw new StudioError('LEASE_REQUIRED', 'The inherited lock descriptor is not bound to this product.');
  const proof = await command('flock', ['--nonblock', '--exclusive', path, 'true'], workspace);
  if (proof.code !== 1) throw new StudioError('LEASE_REQUIRED', 'An independently observed exclusive product file lock is required.');
  let closed = false;
  return {
    async verify() {
      if (closed) throw new StudioError('STORE_LEASE_LOST', 'The product container lease is closed.', 409);
      const held = fstatSync(9);
      const actual = await stat(path);
      if (actual.ino !== held.ino || actual.dev !== held.dev) throw new StudioError('STORE_LEASE_LOST', 'The product lock file was replaced; production cannot continue.', 409);
    },
    async close() {
      if (!closed) { closed = true; closeSync(9); }
    },
  };
}
