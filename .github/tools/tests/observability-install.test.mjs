import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { install, parseArgs } from '../../skills/factory-observability/scripts/install.mjs';
import { main, run } from '../../skills/factory-observability/scripts/runtime/cli.mjs';
import { createStore } from '../../skills/factory-observability/scripts/runtime/store.mjs';
import { repoRoot, runNode, tempDir } from './helpers.mjs';
import { fact, initialize, installerPath, product, rpc } from './observability-helpers.mjs';

for (const [name, args] of [
  ['unknown option', ['--execute', 'yes']], ['missing option value', ['--factory-id']],
  ['duplicate options', ['--factory-id', 'a', '--factory-id', 'b']],
  ['blank values', ['--factory-id', ' ']], ['non-integer threshold', ['--stale-after-ms', '1.5']],
]) test(`negative: installer CLI rejects ${name}`, () => assert.throws(() => parseArgs(args)));

for (const [name, patch] of [
  ['relative root', { productRoot: '.' }], ['missing root', { productRoot: undefined }],
  ['path-traversal identity', { factoryId: '../a' }], ['uppercase identity', { factoryId: 'FactoryA' }],
  ['oversized identity', { factoryId: 'a'.repeat(65) }], ['blank label', { label: '' }],
  ['bad threshold', { staleAfterMs: 0 }], ['invented unsafe session', { sessionId: '../session' }],
]) test(`negative: provisioning rejects ${name} before writing`, async () => {
  await assert.rejects(install({ productRoot: repoRoot, factoryId: 'alpha', ...patch }));
});

test('negative: runtime provisioning refuses reference-owned and non-Git destinations', async (t) => {
  await assert.rejects(install({ productRoot: repoRoot, factoryId: 'alpha' }), /outside.*reference/);
  await assert.rejects(install({ productRoot: dirname(repoRoot), factoryId: 'alpha' }), /outside.*reference/);
  const root = await tempDir(t);
  await assert.rejects(install({ productRoot: root, factoryId: 'alpha' }), /existing product-owned Git/);
  const productRoot = await product(t);
  const nested = join(productRoot, 'nested');
  await mkdir(nested);
  await assert.rejects(install({ productRoot: nested, factoryId: 'alpha' }), /root.*Git/);
});

test('positive: per-Factory provisioning is standalone, preserves other settings and is idempotent on resume', async (t) => {
  const root = await product(t);
  await writeFile(join(root, '.mcp.json'), JSON.stringify({ custom: true, mcpServers: { existing: { command: 'existing' } } }));
  await mkdir(join(root, '.vscode'));
  await writeFile(join(root, '.vscode', 'mcp.json'), JSON.stringify({ inputs: [{ id: 'keep' }], servers: {} }));
  await mkdir(join(root, '.github', 'hooks'), { recursive: true });
  await writeFile(join(root, '.github', 'hooks', 'security.json'), '{"keep":"unchanged"}');
  const first = await install({ productRoot: root, factoryId: 'alpha', label: 'Synthetic verification', sessionId: 'session-1' });
  assert.equal(first.state, 'installed');
  assert.equal(first.ui.state, 'not-started');
  assert.equal(first.mcp.state, 'configured-not-verified');
  assert.equal(first.git.state, 'pending-versioning');
  const store = createStore(first.directory);
  await store.append(fact());
  const resumed = await install({ productRoot: root, factoryId: 'alpha', sessionId: 'session-2' });
  assert.equal(resumed.directory, first.directory);
  assert.equal(resumed.state, 'revalidated');
  assert.equal(resumed.capture.bound_sessions, 2);
  assert.equal((await store.read()).filter((event) => event.kind === 'agent.progress').length, 1);
  assert.equal((await store.read()).length, 3);
  const mcp = JSON.parse(await readFile(join(root, '.mcp.json')));
  assert.equal(mcp.custom, true);
  assert.equal(mcp.mcpServers.existing.command, 'existing');
  const vscode = JSON.parse(await readFile(join(root, '.vscode', 'mcp.json')));
  assert.equal(vscode.inputs[0].id, 'keep');
  assert.ok(vscode.servers['factory-observability-alpha'].args[0].startsWith('${workspaceFolder}'));
  assert.equal(await readFile(join(root, '.github', 'hooks', 'security.json'), 'utf8'), '{"keep":"unchanged"}');
  const status = runNode(join(first.directory, 'cli.mjs'), ['status'], { cwd: await tempDir(t) });
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).factory.id, 'alpha');
  const input = [initialize, { jsonrpc: '2.0', method: 'notifications/initialized' }, rpc(2, 'tools/call', { name: 'factory_overview', arguments: {} })].map(JSON.stringify).join('\n') + '\n';
  const mcpRun = runNode(join(first.directory, 'cli.mjs'), ['mcp'], { input, cwd: root });
  assert.equal(mcpRun.status, 0, mcpRun.stderr);
  const replies = mcpRun.stdout.trim().split('\n').map(JSON.parse);
  assert.equal(replies[1].result.structuredContent.factory.id, 'alpha');
});

test('positive: multiple Factories have independent runtime, journals and MCP registrations', async (t) => {
  const root = await product(t);
  const alpha = await install({ productRoot: root, factoryId: 'alpha', sessionId: 'a-session' });
  const beta = await install({ productRoot: root, factoryId: 'beta', sessionId: 'b-session' });
  assert.notEqual(alpha.directory, beta.directory);
  await createStore(alpha.directory).append(fact());
  assert.equal((await createStore(beta.directory).read()).some((event) => event.kind === 'agent.progress'), false);
  const servers = JSON.parse(await readFile(join(root, '.mcp.json'))).mcpServers;
  assert.ok(servers['factory-observability-alpha']);
  assert.ok(servers['factory-observability-beta']);
  const hooks = JSON.parse(await readFile(join(root, '.github', 'hooks', 'factory-observability.json')));
  assert.equal(hooks.hooks.preToolUse.length, 1);
});

test('negative: a Factory session cannot silently fan out into another Factory journal', async (t) => {
  const root = await product(t);
  await install({ productRoot: root, factoryId: 'alpha', sessionId: 'same-session' });
  await assert.rejects(install({ productRoot: root, factoryId: 'beta', sessionId: 'same-session' }), /multiple Factories/);
});

test('negative: local runtime edits are preserved and block automatic upgrade', async (t) => {
  const root = await product(t);
  const instance = await install({ productRoot: root, factoryId: 'alpha' });
  const path = join(instance.directory, 'query.mjs');
  await writeFile(path, '// local owner edit\n');
  await assert.rejects(install({ productRoot: root, factoryId: 'alpha' }), /local edits/);
  assert.equal(await readFile(path, 'utf8'), '// local owner edit\n');
});

for (const [name, file, content, pattern] of [
  ['capture adapter', ['.factory', 'observability', 'capture.mjs'], '// local edit', /capture adapter/],
  ['hook registration', ['.github', 'hooks', 'factory-observability.json'], '{"custom":true}', /hook registration/],
  ['MCP collision', ['.mcp.json'], '{"mcpServers":{"factory-observability-alpha":{"command":"other"}}}', /conflicts/],
  ['invalid MCP servers', ['.mcp.json'], '{"mcpServers":[]}', /MCP server configuration/],
  ['malformed JSON', ['.mcp.json'], 'not JSON', /JSON configuration/],
  ['invalid manifest', ['.factory', 'observability', 'alpha', 'manifest.json'], '{"version":2}', /manifest/],
  ['wrong center identity', ['.factory', 'observability', 'alpha', 'center.json'], '{"version":1,"factory_id":"beta"}', /different Factory/],
  ['bad registry', ['.factory', 'observability', 'registry.json'], '{"version":2}', /registry/],
  ['bad session binding', ['.factory', 'observability', 'registry.json'], '{"version":1,"factories":{"alpha":{"sessions":"bad"}}}', /session bindings/],
]) test(`negative: existing ${name} conflicts fail without overwriting owner data`, async (t) => {
  const root = await product(t);
  await install({ productRoot: root, factoryId: 'alpha' });
  const path = join(root, ...file);
  await writeFile(path, content);
  await assert.rejects(install({ productRoot: root, factoryId: 'alpha' }), pattern);
  assert.equal(await readFile(path, 'utf8'), content);
});

test('negative: a product path junction cannot redirect the center outside its product', async (t) => {
  const root = await product(t);
  const outside = await tempDir(t);
  await symlink(outside, join(root, '.factory'), 'junction');
  await assert.rejects(install({ productRoot: root, factoryId: 'alpha' }), /linked/);
});

test('negative: held installation locks are not removed or treated as successful provisioning', async (t) => {
  const root = await product(t);
  await mkdir(join(root, '.factory', 'observability'), { recursive: true });
  const path = join(root, '.factory', 'observability', '.install.lock');
  await writeFile(path, 'owner');
  await assert.rejects(install({ productRoot: root, factoryId: 'alpha' }), /lock/);
  assert.equal(await readFile(path, 'utf8'), 'owner');
});

test('negative: installed metadata hook never echoes malformed registry contents into diagnostics', async (t) => {
  const root = await product(t);
  await install({ productRoot: root, factoryId: 'alpha', sessionId: 'session-1' });
  const base = join(root, '.factory', 'observability');
  await writeFile(join(base, 'registry.json'), '{PRIVATE-CONFIGURATION');
  const result = runNode(join(base, 'capture.mjs'), ['preToolUse'], { cwd: root, input: JSON.stringify({ session_id: 'session-1', tool_name: 'read' }) });
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout), {});
  assert.ok(result.stderr.includes('SyntaxError'));
  assert.ok(!result.stderr.includes('PRIVATE-CONFIGURATION'));
});

test('positive: installer CLI derives destinations only from explicit options and reports actual pending state', async (t) => {
  const root = await product(t);
  const result = runNode(installerPath, ['--product-root', root, '--factory-id', 'alpha', '--label', 'Synthetic verification', '--stale-after-ms', '30000']);
  assert.equal(result.status, 0, result.stderr);
  const instance = JSON.parse(result.stdout);
  assert.equal(createStore(instance.directory).config.stale_after_ms, 30000);
  assert.equal(instance.capture.state, 'unbound');
  assert.ok((await createStore(instance.directory).read()).some((event) => event.kind === 'capture.gap'));
});

test('negative: runtime CLI rejects invalid commands, invalid ports and malformed emission files', async (t) => {
  const root = await product(t);
  const instance = await install({ productRoot: root, factoryId: 'alpha' });
  const cli = join(instance.directory, 'cli.mjs');
  for (const args of [[], ['execute'], ['status', 'extra'], ['serve', '--host', '0.0.0.0'], ['serve', '--port', '-1'], ['serve', '--port', '65536']]) {
    await assert.rejects(run(args, instance.directory));
    const result = runNode(cli, args);
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.equal(result.stdout, '');
  }
  const input = join(root, 'safe-event.json');
  await writeFile(input, 'not JSON');
  await assert.rejects(run(['emit', '--input', input], instance.directory), /not valid JSON/);
  assert.equal(runNode(cli, ['emit', '--input', input]).status, 1);
  await writeFile(input, 'x'.repeat(17_000));
  await assert.rejects(run(['emit', '--input', input], instance.directory), /16 KiB/);
  assert.equal(runNode(cli, ['emit', '--input', input]).status, 1);
  await assert.rejects(run(['emit', '--input', root], instance.directory), /regular file/);
});

test('positive: runtime CLI emits through the shared writer and can start and close the local UI', async (t) => {
  const root = await product(t);
  const instance = await install({ productRoot: root, factoryId: 'alpha' });
  const input = join(root, 'event.json');
  await writeFile(input, JSON.stringify(fact()));
  let output = '';
  const sink = { write(chunk) { output += chunk; return true; } };
  await run(['emit', '--input', input], instance.directory, sink);
  assert.equal(JSON.parse(output).kind, 'agent.progress');
  output = '';
  await run(['status'], instance.directory, sink);
  assert.equal(JSON.parse(output).factory.id, 'alpha');
  const beforeInt = process.listeners('SIGINT');
  const beforeTerm = process.listeners('SIGTERM');
  output = '';
  const app = await run(['serve'], instance.directory, sink);
  assert.equal((await fetch(JSON.parse(output).health)).status, 200);
  for (const [signal, before] of [['SIGINT', beforeInt], ['SIGTERM', beforeTerm]]) {
    for (const listener of process.listeners(signal)) if (!before.includes(listener)) process.removeListener(signal, listener);
  }
  await app.close();
});

test('positive: the CLI entrypoint runs real MCP input and returns a verifiable exit status', async (t) => {
  const root = await product(t);
  const instance = await install({ productRoot: root, factoryId: 'alpha' });
  let output = '';
  const sink = { write(value) { output += value; return true; } };
  const input = Readable.from([JSON.stringify(rpc(1, 'ping')) + '\n']);
  assert.equal(await main(['mcp'], { directory: instance.directory, input, output: sink }), 0);
  assert.deepEqual(JSON.parse(output).result, {});
  output = '';
  assert.equal(await main(['status'], { directory: instance.directory, output: sink }), 0);
  assert.equal(JSON.parse(output).factory.id, 'alpha');
});

test('negative: CLI entrypoint failures are explicit, sanitized and nonzero rather than success-shaped', async (t) => {
  const root = await product(t);
  const instance = await install({ productRoot: root, factoryId: 'alpha' });
  let error = '';
  const errorOutput = { write(value) { error += value; return true; } };
  assert.equal(await main(['execute'], { directory: instance.directory, errorOutput }), 1);
  assert.ok(error.includes('Usage:'));
  error = '';
  assert.equal(await main(['emit', '--input', join(root, 'missing.json')], { directory: instance.directory, errorOutput }), 1);
  assert.ok(error.includes('ENOENT'));
});

test('negative: service shutdown failure is surfaced and never changes Factory state', async (t) => {
  const root = await product(t);
  const instance = await install({ productRoot: root, factoryId: 'alpha' });
  const originalExit = process.exitCode;
  const before = { SIGINT: process.listeners('SIGINT'), SIGTERM: process.listeners('SIGTERM') };
  const app = await run(['serve', '--port', '0'], instance.directory, { write() { return true; } });
  const actualClose = app.close;
  const signal = process.listeners('SIGINT').find((listener) => !before.SIGINT.includes(listener));
  try {
    app.close = async () => { throw Object.assign(new Error('synthetic shutdown failure'), { code: 'EVERIFY' }); };
    signal();
    await new Promise((done) => setImmediate(done));
    assert.equal(process.exitCode, 1);
    app.close = actualClose;
    const termination = process.listeners('SIGTERM').find((listener) => !before.SIGTERM.includes(listener));
    termination();
    await actualClose();
  } finally {
    app.close = actualClose;
    await app.close();
    process.exitCode = originalExit;
    for (const [event, previous] of Object.entries(before)) {
      for (const listener of process.listeners(event)) if (!previous.includes(listener)) process.removeListener(event, listener);
    }
  }
  assert.equal((await createStore(instance.directory).read()).some((event) => event.kind === 'factory.stopped'), false);
});

test('negative: several real emitter processes cannot lose or duplicate journal sequences', async (t) => {
  const root = await product(t);
  const instance = await install({ productRoot: root, factoryId: 'alpha' });
  const paths = await Promise.all(Array.from({ length: 5 }, async (_, index) => {
    const path = join(root, `event-${index}.json`);
    await writeFile(path, JSON.stringify(fact()));
    return path;
  }));
  const statuses = await Promise.all(paths.map((path) => new Promise((done, fail) => {
    const child = spawn(process.execPath, [join(instance.directory, 'cli.mjs'), 'emit', '--input', path], { stdio: 'ignore', windowsHide: true });
    child.once('error', fail);
    child.once('close', done);
  })));
  assert.deepEqual(statuses, [0, 0, 0, 0, 0]);
  const data = await createStore(instance.directory).read();
  assert.deepEqual(data.map((entry) => entry.sequence), Array.from({ length: data.length }, (_, index) => index + 1));
  assert.equal(data.filter((entry) => entry.kind === 'agent.progress').length, 5);
});
