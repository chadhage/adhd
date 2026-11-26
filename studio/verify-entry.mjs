import { cp, lstat, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

export async function verifyInContainer(specification) {
  if (!specification || typeof specification.command !== 'string' || !Array.isArray(specification.args)
    || !specification.args.every((arg) => typeof arg === 'string')) throw new Error('Invalid verification program.');
  const workspace = '/tmp/product';
  await mkdir(workspace);
  await cp('/source', workspace, {
    recursive: true, dereference: false,
    filter: async (path) => {
      if ((await lstat(path)).isSymbolicLink()) throw new Error('Linked verification inputs are not permitted.');
      return true;
    },
  });
  await mkdir(join(workspace, '.home'));
  const env = {
    PATH: process.env.PATH, HOME: join(workspace, '.home'), TMPDIR: '/tmp',
    DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1',
    JAVA_HOME: process.env.JAVA_HOME,
  };
  const child = spawn(specification.command, specification.args, { cwd: workspace, env, stdio: 'inherit', shell: false });
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => signal ? reject(new Error(`Verification interrupted by ${signal}.`)) : resolve(code ?? 1));
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  verifyInContainer(JSON.parse(process.argv[2])).then((code) => { process.exitCode = code; }, (error) => { console.error(error.message); process.exitCode = 1; });
}
