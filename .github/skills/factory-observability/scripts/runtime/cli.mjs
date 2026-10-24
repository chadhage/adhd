import { lstat, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCenterServer } from './http.mjs';
import { serveMcp } from './mcp.mjs';
import { readModel } from './query.mjs';
import { createStore, MAX_EVENT_BYTES, ObservationError } from './store.mjs';

export async function run(args, directory = dirname(fileURLToPath(import.meta.url)), output = process.stdout, input = process.stdin) {
  const [command, ...rest] = args;
  if (command === 'mcp' && !rest.length) {
    await serveMcp(directory, input, output);
  } else if (command === 'serve') {
    if (rest.length && (rest.length !== 2 || rest[0] !== '--port' || !/^\d+$/.test(rest[1]))) throw new ObservationError('Usage: cli.mjs serve [--port 0..65535]');
    const center = createCenterServer(directory);
    const url = await center.listen(rest.length ? Number(rest[1]) : 0);
    output.write(`${JSON.stringify({ factory_id: center.store.config.factory_id, ui: url, api: `${url}/api/v1/overview`, health: `${url}/healthz` })}\n`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
      center.close().catch((error) => { process.stderr.write(`Operations Center shutdown failed: ${error.code ?? error.name}\n`); process.exitCode = 1; });
    });
    return center;
  } else if (command === 'status' && !rest.length) {
    output.write(`${JSON.stringify((await readModel(createStore(directory))).snapshot)}\n`);
  } else if (command === 'emit' && rest.length === 2 && rest[0] === '--input') {
    const path = resolve(rest[1]);
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new ObservationError('Emission input must be a regular file, not a link');
    if (info.size > MAX_EVENT_BYTES) throw new ObservationError('Emission exceeds 16 KiB');
    const content = await readFile(path);
    if (content.length > MAX_EVENT_BYTES) throw new ObservationError('Emission exceeds 16 KiB');
    let event;
    try { event = JSON.parse(content.toString('utf8')); }
    catch { throw new ObservationError('Emission is not valid JSON'); }
    output.write(`${JSON.stringify(await createStore(directory).append(event))}\n`);
  } else throw new ObservationError('Usage: cli.mjs serve [--port N] | mcp | status | emit --input <event.json>');
}

export async function main(args, { directory, input, output = process.stdout, errorOutput = process.stderr } = {}) {
  try { await run(args, directory, output, input); return 0; }
  catch (error) {
    errorOutput.write(`Factory Operations Center: ${error instanceof ObservationError ? error.message : error.code ?? error.name}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
