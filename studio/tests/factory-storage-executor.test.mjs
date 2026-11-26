import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { PostgresStore } from '../postgres-store.mjs';
import { DockerExecutor, RemoteExecutor } from '../executor.mjs';
import { fixture } from './helpers.mjs';
import { command } from '../repository.mjs';

function database() {
  const rows = new Map();
  return {
    on() {}, async connect() {}, async end() {},
    async query(sql, args) {
      if (sql.startsWith('SELECT pg_try_advisory')) return { rows: [{ acquired: true }] };
      if (sql.startsWith('CREATE TABLE')) return { rows: [] };
      if (sql.startsWith('INSERT')) {
        if (!rows.has(args[0])) rows.set(args[0], { content: args[1], revision: args[2], projection_revision: args[2] });
        return { rowCount: 1 };
      }
      if (sql.startsWith('SELECT content')) return { rows: rows.has(args[0]) ? [{ ...rows.get(args[0]) }] : [] };
      if (sql.startsWith('UPDATE adhd_studio_records SET content')) {
        const row = rows.get(args[2]);
        if (!row || row.revision !== args[3]) return { rowCount: 0 };
        rows.set(args[2], { ...row, content: args[0], revision: args[1] });
        return { rowCount: 1 };
      }
      if (sql.startsWith('UPDATE adhd_studio_records SET projection')) {
        const row = rows.get(args[1]);
        if (!row || row.revision !== args[0]) return { rowCount: 0 };
        row.projection_revision = args[0];
        return { rowCount: 1 };
      }
      throw new Error(`Unexpected fixture query: ${sql}`);
    },
  };
}

test('positive: external-store revisions reject stale writes and preserve the independent Git export cursor', async () => {
  const store = new PostgresStore({ key: 'owned-fixture', client: database() });
  const initial = await store.initialize('{"version":1}');
  const changed = await store.update(initial.revision, '{"version":1,"cursor":2}');
  assert.equal(changed.ok, true);
  assert.equal((await store.update(initial.revision, '{"cursor":"stale"}')).ok, false);
  assert.equal((await store.read()).projectionRevision, initial.revision);
  await store.projected(changed.revision);
  assert.equal((await store.read()).projectionRevision, changed.revision);
  await store.close();
});

test('negative: concurrent record reads neither mistake owner writes for tampering nor return preceding revisions', async (t) => {
  const { studio } = await fixture(t);
  const operations = [];
  for (let index = 0; index < 6; index += 1) {
    const name = `Concurrent revision ${index}`;
    operations.push(studio.records.update((data) => { data.blueprint.name = name; }));
    operations.push(studio.records.read().then(({ data }) => assert.equal(data.blueprint.name, name)));
  }
  const outcomes = await Promise.allSettled(operations);
  for (const outcome of outcomes) {
    if (outcome.status === 'rejected') throw outcome.reason;
  }
});

test('negative: external state requires explicit connections, scoped keys and verified TLS outside loopback', () => {
  assert.throws(() => new PostgresStore({ key: 'fixture' }), /explicit PostgreSQL/);
  assert.throws(() => new PostgresStore({ key: '../foreign', client: database() }), /product-scoped/);
  assert.throws(() => new PostgresStore({ key: 'fixture', connectionString: 'postgres://fixture@remote.invalid/database' }), /verify-full/);
  assert.throws(() => new RemoteExecutor({ origin: 'http://remote.invalid', token: 't'.repeat(48) }), /HTTPS/);
  assert.throws(() => new DockerExecutor({ image: 'fixture:latest', cpu: 1, memoryMiB: 256 }), /pinned/);
});

test('positive: Docker verification copies only reviewed product files and supplies no controller credentials', async (t) => {
  const { root } = await fixture(t);
  const calls = [];
  let label;
  const execute = async (binary, args) => {
    calls.push(args);
    if (args.includes('run')) {
      label = args[args.indexOf('--label') + 1].split('=')[1];
      assert.equal(args[args.indexOf('--network') + 1], 'none');
      assert.equal(args[args.indexOf('--cap-drop') + 1], 'ALL');
      assert.equal(args[args.indexOf('--user') + 1], '1000:1000');
      const mount = args[args.indexOf('--mount') + 1];
      const source = /source=(.*),target=/.exec(mount)[1];
      await assert.rejects(readFile(join(source, '.adhd', 'studio', 'records.json')), /ENOENT/);
      assert.equal(args.join(' ').includes('STUDIO_ACCESS_TOKEN'), false);
      return { code: 0, output: '# tests 1\n# pass 1\n' };
    }
    if (args.includes('inspect')) return { code: 0, output: label };
    return { code: 0, output: 'removed owned container' };
  };
  const executor = new DockerExecutor({ image: `ghcr.io/fixture/runtime@sha256:${'a'.repeat(64)}`, cpu: 1, memoryMiB: 256, commandFn: execute });
  const result = await executor.execute({ directory: root, verification: { command: 'node', args: ['--test', 'acceptance.test.mjs'] }, signal: new AbortController().signal, maximumMillis: 1000 });
  assert.equal(result.code, 0);
  assert.match(result.sourceDigest, /^[a-f0-9]{64}$/);
  assert.ok(calls.some((args) => args.includes('rm')));
});

test('negative: tracked credential inputs and lost external-store leases do not get silent fallbacks', async (t) => {
  const { root } = await fixture(t);
  await writeFile(join(root, '.env'), 'fixture-only-sensitive-location=blocked');
  await command('git', ['add', '.env'], root);
  const executor = new DockerExecutor({ image: `ghcr.io/fixture/runtime@sha256:${'a'.repeat(64)}`, cpu: 1, memoryMiB: 256 });
  await assert.rejects(executor.snapshot(root), /Protected/);
  await command('git', ['reset', '--', '.env'], root);
  await rm(join(root, '.env'));
  const store = new PostgresStore({ key: 'owned-fixture', client: database() });
  await store.initialize('{}');
  store.error = new Error('Injected connection loss');
  await assert.rejects(store.read(), /lease was lost/);
});

test('positive: unattended command execution closes stdin instead of waiting for interactive input', async () => {
  const result = await command(process.execPath, ['-e', "process.stdin.resume(); process.stdin.on('end', () => process.stdout.write('input-closed'));"], undefined, { signal: AbortSignal.timeout(5000) });
  assert.equal(result.code, 0);
  assert.equal(result.output, 'input-closed');
});
