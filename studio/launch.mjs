import * as filesystem from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { StudioError } from './contracts.mjs';
import {
  bootstrapAciRoot, managedDirectory, prepareWorkspace, readRuntimeConfiguration,
  runtimePath, sanitizeRuntimeError, waitForChild,
} from './container.mjs';
import { factoryRoles } from './factory-contracts.mjs';

export const volumeCommand = 'flock --nonblock 9 || exit 73; exec node /opt/adhd/studio/container.mjs';

export async function launchRuntime(env = process.env, {
  fsApi = filesystem, spawnFn = spawn, platform = process.platform, processApi = process,
  readConfiguration = readRuntimeConfiguration, prepare = prepareWorkspace, flags = constants,
} = {}) {
  const configuration = await readConfiguration(env);
  if (env.STUDIO_WORKER_ROLE !== undefined && !factoryRoles.includes(env.STUDIO_WORKER_ROLE)) {
    throw new StudioError('INVALID_ROLE', 'Configure an exact supported Factory worker role.');
  }
  const childEnv = { ...env, PATH: runtimePath };
  delete childEnv.STUDIO_LEASE_FD;
  let child, finished;
  const start = (executable, args, options) => {
    child = spawnFn(executable, args, options);
    finished = waitForChild(child, { processApi });
    finished.catch(() => {});
  };
  if (env.STUDIO_WORKER_ROLE) {
    start(processApi.execPath, [fileURLToPath(new URL('./worker.mjs', import.meta.url))], {
      env: childEnv, stdio: 'inherit', shell: false,
    });
  } else {
    if (platform !== 'linux') throw new StudioError('LINUX_REQUIRED', 'The immutable container launcher requires Linux amd64.');
    const workspace = await prepare(env, { fsApi });
    if (configuration.blueprint.deployment?.persistence === 'postgres') {
      start(processApi.execPath, [fileURLToPath(new URL('./container.mjs', import.meta.url))], {
        env: childEnv, stdio: 'inherit', shell: false,
      });
    } else {
      if (!flags.O_NOFOLLOW) throw new StudioError('LEASE_REQUIRED', 'A no-follow POSIX lock descriptor is required.');
      const directory = await managedDirectory(workspace, ['.adhd', 'studio'], { fsApi, create: true });
      const path = join(directory, 'controller.guard');
      const guard = await fsApi.open(path, flags.O_RDWR | flags.O_CREAT | flags.O_NOFOLLOW, 0o600);
      try {
        const held = await guard.stat();
        const actual = await fsApi.lstat(path);
        if (!held.isFile() || actual.isSymbolicLink() || held.nlink !== 1
          || held.ino !== actual.ino || held.dev !== actual.dev) {
          throw new StudioError('LEASE_REQUIRED', 'The product guard must be an ordinary exclusive-lock file, not a link or replacement.');
        }
        childEnv.STUDIO_LEASE_FD = '9';
        start('/bin/sh', ['-c', volumeCommand], {
          cwd: workspace, env: childEnv, shell: false,
          stdio: ['inherit', 'inherit', 'inherit', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', guard.fd],
        });
      } finally {
        // Only the inherited child descriptor may retain the flock lifetime.
        try { await guard.close(); } catch (error) {
          if (child) {
            child.kill('SIGTERM');
            try { await finished; } catch (cleanup) { throw new AggregateError([error, cleanup], 'Lock descriptor and child cleanup failed.'); }
          }
          throw error;
        }
      }
    }
  }
  const code = await finished;
  if (code === 73) throw new StudioError('SERVICE_ALREADY_RUNNING', 'An existing controller owns this product volume. No second writer was started.', 409);
  return { code };
}

export async function main(args = process.argv.slice(2), env = process.env) {
  if (args.length) throw new StudioError('INVALID_ARGUMENTS', 'The immutable entrypoint accepts runtime environment configuration, not command-line secrets.');
  const root = await bootstrapAciRoot(env);
  const result = root.bootstrapped ? root : await launchRuntime(env);
  process.exitCode = result.code;
  return result;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => { console.error(sanitizeRuntimeError(error)); process.exitCode = 1; });
}
