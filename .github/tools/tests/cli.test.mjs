import assert from 'node:assert/strict';
import { mkdir, readFile, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { headingBoard, installWorkspace, repoRoot, runNode, tempDir, toolPath } from './helpers.mjs';

const minute = 60_000;
const csv = (durations) =>
  `id,start,end,class\n${durations.map((d, i) => `S${i},2026-10-01T00:00:00Z,${new Date(Date.UTC(2026, 9, 1) + d * minute).toISOString()},CRUD`).join('\n')}\n`;
const json = (result) => JSON.parse(result.stdout);

async function queueArgs(t) {
  const dir = await tempDir(t);
  return { dir, queue: join(dir, 'queue.jsonl') };
}
const enqueueArgs = (queue, extra = []) => ['enqueue', '--queue', queue, '--requester', 'Kanban', '--tool', 'edit', '--target', 'x.md', '--params', '{"op":"move","token":"abc"}', '--purpose', 'why', '--card', 'CARD-1', ...extra];

// ---- approval-queue ----

test('positive: enqueue, list, and resolve work end to end from the command line', async (t) => {
  const { queue } = await queueArgs(t);
  const script = toolPath('approval-queue.mjs');
  const added = runNode(script, enqueueArgs(queue));
  assert.equal(added.status, 0, added.stderr);
  assert.equal(json(added).id, 'AQ-1');
  assert.equal(json(runNode(script, ['list', '--queue', queue, '--status', 'pending'])).requests.length, 1);
  const resolved = runNode(script, ['resolve', '--queue', queue, '--id', 'AQ-1', '--decision', 'approved', '--approver', 'Chad', '--source', 'chat']);
  assert.equal(resolved.status, 0);
  assert.equal(json(runNode(script, ['list', '--queue', queue, '--status', 'pending'])).requests.length, 0);
  assert.equal(json(runNode(script, ['list', '--queue', queue])).requests[0].status, 'approved');
  assert.equal((await readFile(queue, 'utf8')).includes('abc'), false);
});

test('negative: the queue command line rejects a missing --queue with exit 2', () => {
  assert.equal(runNode(toolPath('approval-queue.mjs'), ['list']).status, 2);
});

test('negative: the queue command line rejects an unknown command with exit 2', async (t) => {
  const { queue } = await queueArgs(t);
  const run = runNode(toolPath('approval-queue.mjs'), ['frobnicate', '--queue', queue]);
  assert.equal(run.status, 2);
  assert.match(run.stderr, /Usage/);
});

test('negative: enqueue with a missing field exits 2', async (t) => {
  const { queue } = await queueArgs(t);
  const args = enqueueArgs(queue).filter((value, index, all) => value !== '--card' && all[index - 1] !== '--card');
  assert.equal(runNode(toolPath('approval-queue.mjs'), args).status, 2);
});

test('negative: enqueue with invalid --params JSON exits 2', async (t) => {
  const { queue } = await queueArgs(t);
  const args = enqueueArgs(queue).map((value) => (value.startsWith('{') ? '{ nope' : value));
  assert.equal(runNode(toolPath('approval-queue.mjs'), args).status, 2);
});

test('negative: a denied action re-enqueued without changed evidence exits 1', async (t) => {
  const { queue } = await queueArgs(t);
  const script = toolPath('approval-queue.mjs');
  runNode(script, enqueueArgs(queue));
  runNode(script, ['resolve', '--queue', queue, '--id', 'AQ-1', '--decision', 'denied', '--approver', 'Chad', '--source', 'chat']);
  const retry = runNode(script, enqueueArgs(queue));
  assert.equal(retry.status, 1);
  assert.equal(json(retry).reason, 'denied-without-changed-evidence');
});

test('negative: resolving an unknown id exits 1 and an invalid decision exits 2', async (t) => {
  const { queue } = await queueArgs(t);
  const script = toolPath('approval-queue.mjs');
  assert.equal(runNode(script, ['resolve', '--queue', queue, '--id', 'AQ-9', '--decision', 'approved', '--approver', 'Chad', '--source', 'chat']).status, 1);
  assert.equal(runNode(script, ['resolve', '--queue', queue, '--id', 'AQ-9', '--decision', 'maybe', '--approver', 'Chad', '--source', 'chat']).status, 2);
});

// ---- baseline-calc ----

test('positive: a CSV of three CRUD slices yields the median proposal', async (t) => {
  const dir = await tempDir(t);
  await writeFile(join(dir, 's.csv'), csv([90, 240, 120]));
  const run = runNode(toolPath('baseline-calc.mjs'), ['--input', join(dir, 's.csv'), '--class', 'CRUD', '--statistic', 'median', '--unit', 'minutes', '--sample', '3', '--seed', '42', '--term', 'cycle time']);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(json(run).value, 120);
  assert.match(json(run).request, /Yes, No, or supply a replacement/);
});

test('positive: a JSON input and an upper percentile are accepted', async (t) => {
  const dir = await tempDir(t);
  const samples = [10, 20, 30].map((d, i) => ({ id: `J${i}`, start: '2026-10-01T00:00:00Z', end: new Date(Date.UTC(2026, 9, 1) + d * minute).toISOString(), class: 'CRUD' }));
  await writeFile(join(dir, 's.json'), JSON.stringify(samples));
  assert.equal(json(runNode(toolPath('baseline-calc.mjs'), ['--input', join(dir, 's.json'), '--statistic', 'p90', '--unit', 'minutes'])).value, 30);
});

for (const missing of ['input', 'statistic', 'unit']) {
  test(`negative: baseline-calc without --${missing} exits 2`, async (t) => {
    const dir = await tempDir(t);
    await writeFile(join(dir, 's.csv'), csv([10]));
    const args = { input: join(dir, 's.csv'), statistic: 'median', unit: 'minutes' };
    delete args[missing];
    const run = runNode(toolPath('baseline-calc.mjs'), Object.entries(args).flatMap(([key, value]) => [`--${key}`, value]));
    assert.equal(run.status, 2);
    assert.match(run.stderr, new RegExp(missing));
  });
}

test('negative: baseline-calc rejects an unreadable input file and a bad statistic with exit 2', async (t) => {
  const dir = await tempDir(t);
  assert.equal(runNode(toolPath('baseline-calc.mjs'), ['--input', join(dir, 'nope.csv'), '--statistic', 'median', '--unit', 'minutes']).status, 2);
  await writeFile(join(dir, 's.csv'), csv([10]));
  assert.equal(runNode(toolPath('baseline-calc.mjs'), ['--input', join(dir, 's.csv'), '--statistic', 'p0', '--unit', 'minutes']).status, 2);
});

test('negative: baseline-calc reports no-data instead of inventing a value', async (t) => {
  const dir = await tempDir(t);
  await writeFile(join(dir, 's.csv'), csv([10]));
  const run = runNode(toolPath('baseline-calc.mjs'), ['--input', join(dir, 's.csv'), '--class', 'Report', '--statistic', 'median', '--unit', 'minutes']);
  assert.equal(json(run).status, 'no-data');
  assert.equal(json(run).value, undefined);
});

// ---- liveness-check ----

async function livenessFiles(t, { board = headingBoard, progressTs } = {}) {
  const dir = await tempDir(t);
  await writeFile(join(dir, 'b.md'), board);
  if (progressTs) await writeFile(join(dir, 'p.jsonl'), `${JSON.stringify({ ts: progressTs })}\n`);
  return { board: join(dir, 'b.md'), progress: join(dir, 'p.jsonl') };
}
const liveness = (f, extra = []) => runNode(toolPath('liveness-check.mjs'), ['--board', f.board, '--progress', f.progress, ...extra]);

test('positive: fresh progress is ok with exit 0', async (t) => {
  const f = await livenessFiles(t, { progressTs: new Date().toISOString() });
  const run = liveness(f, ['--deadline-ms', '86400000', '--deadline-status', 'confirmed']);
  assert.equal(run.status, 0);
  assert.equal(json(run).status, 'ok');
});

test('negative: a breached deadline reports a suspected halt with exit 1', async (t) => {
  const f = await livenessFiles(t, { progressTs: '2020-01-01T00:00:00Z' });
  const run = liveness(f, ['--deadline-ms', '1000', '--deadline-status', 'provisional']);
  assert.equal(run.status, 1);
  assert.equal(json(run).status, 'halt-suspected');
});

test('negative: a missing deadline exits 3 and never guesses', async (t) => {
  const f = await livenessFiles(t, { progressTs: '2020-01-01T00:00:00Z' });
  assert.equal(liveness(f).status, 3);
});

test('negative: no progress record exits 3', async (t) => {
  const f = await livenessFiles(t);
  assert.equal(liveness(f, ['--deadline-ms', '1000', '--deadline-status', 'provisional']).status, 3);
});

test('negative: an unparseable board exits 3', async (t) => {
  const f = await livenessFiles(t, { board: 'nothing', progressTs: '2020-01-01T00:00:00Z' });
  assert.equal(liveness(f, ['--deadline-ms', '1000', '--deadline-status', 'provisional']).status, 3);
});

test('negative: a missing --board or an unreadable board exits 2', async (t) => {
  assert.equal(runNode(toolPath('liveness-check.mjs'), []).status, 2);
  const dir = await tempDir(t);
  assert.equal(runNode(toolPath('liveness-check.mjs'), ['--board', join(dir, 'nope.md')]).status, 2);
});

// ---- preflight and health ----

test('positive: the preflight prints JSON by default and markdown on request', () => {
  const asJson = runNode(toolPath('capability-preflight.mjs'), ['--records-dir', '.github']);
  assert.equal(asJson.status, 0, asJson.stderr);
  assert.ok(json(asJson).capabilities.length >= 8);
  const asMd = runNode(toolPath('capability-preflight.mjs'), ['--format', 'md']);
  assert.match(asMd.stdout, /\| Capability \| Status \|/);
});

test('negative: --strict exits 1 when any capability is degraded', () => {
  const run = runNode(toolPath('capability-preflight.mjs'), ['--strict', '--unattended']);
  assert.equal(run.status, 1);
  assert.ok(json(run).degraded.length >= 1);
});

test('positive: preflight accepts explicit root, settings, and supervisor config arguments', async (t) => {
  const ws = await installWorkspace(t);
  await writeFile(join(ws.root, 's.json'), '{}');
  await writeFile(join(ws.root, 'sup.json'), '{}');
  const run = runNode(toolPath('capability-preflight.mjs'), ['--root', ws.root, '--settings', 's.json', '--supervisor-config', join(ws.root, 'sup.json')]);
  assert.equal(json(run).capabilities.find((entry) => entry.capability === 'supervisor').status, 'ok');
});

test('positive: hook-health exits 0 for this repository', () => {
  const run = runNode(toolPath('hook-health.mjs'), []);
  assert.equal(run.status, 0, run.stdout);
  assert.equal(json(run).ok, true);
});

test('positive: hook-health accepts explicit --root and --config', () => {
  assert.equal(runNode(toolPath('hook-health.mjs'), ['--root', repoRoot, '--config', '.github/hooks/tool-policy.json']).status, 0);
});

test('negative: hook-health exits 1 when the hook config cannot be read', async (t) => {
  const run = runNode(toolPath('hook-health.mjs'), ['--root', await tempDir(t)]);
  assert.equal(run.status, 1);
  assert.equal(json(run).ok, false);
});

// ---- supervisor ----

const supervisorConfig = {
  owner: 'chadhage',
  authorizedBy: 'chat 2026-10-13',
  resume: { command: 'definitely-not-an-installed-program', args: ['--x'], cwd: '.' },
  restartPacketPath: '.docs/restart.md',
  statePath: '.docs/state.json',
  logPath: '.docs/log.jsonl',
  inhibitPath: '.docs/INHIBIT',
  deadline: { ms: 1000, status: 'provisional', source: 'baseline-calc' },
  retry: { maxRestarts: 2, minIntervalMs: 1000, status: 'provisional', source: 'owner' },
};

const longAgo = new Date('2020-01-01T00:00:00Z');
// Board modification time counts as progress, so a stalled scenario must age the board too.
async function stall(ws) {
  await writeFile(ws.docs('progress.jsonl'), `${JSON.stringify({ ts: longAgo.toISOString() })}\n`);
  await utimes(ws.docs('kanban.md'), longAgo, longAgo);
}

test('positive: a dry-run tick detects a halt and logs it without starting anything', async (t) => {
  const ws = await installWorkspace(t, { supervisor: supervisorConfig });
  await stall(ws);
  await mkdir(join(ws.root, '.docs'), { recursive: true });
  const run = ws.tool('supervisor.mjs', ['tick']);
  assert.equal(run.status, 1, run.stderr);
  assert.equal(json(run).status, 'would-restart');
  assert.match(await readFile(ws.docs('log.jsonl'), 'utf8'), /would-restart/);
});

test('negative: a tick with no supervisor configured exits 3', async (t) => {
  const ws = await installWorkspace(t);
  const run = ws.tool('supervisor.mjs', ['tick']);
  assert.equal(run.status, 3);
  assert.equal(json(run).status, 'not-configured');
});

test('negative: an invalid supervisor config exits 3 and lists problems', async (t) => {
  const ws = await installWorkspace(t, { supervisor: { owner: 'x' } });
  const run = ws.tool('supervisor.mjs', ['tick']);
  assert.equal(run.status, 3);
  assert.ok(json(run).problems.length > 3);
});

test('negative: running without the tick command is a usage error', async (t) => {
  const ws = await installWorkspace(t);
  const run = ws.tool('supervisor.mjs', []);
  assert.equal(run.status, 2);
  assert.match(run.stderr, /Usage/);
});

test('negative: executing a resume command that does not exist is reported as a failed spawn, not a restart', async (t) => {
  const ws = await installWorkspace(t, { supervisor: supervisorConfig });
  await stall(ws);
  const run = ws.tool('supervisor.mjs', ['tick', '--execute']);
  assert.equal(run.status, 1, run.stdout);
  assert.equal(json(run).status, 'spawn-failed');
  assert.equal(json(run).attempt.error, 'no-pid');
});

test('negative: an explicit --root and --config are honored and an unreadable config is not configured', async (t) => {
  const ws = await installWorkspace(t);
  const run = runNode(toolPath('supervisor.mjs'), ['tick', '--root', ws.root, '--config', join(ws.root, 'missing.json')]);
  assert.equal(json(run).status, 'not-configured');
});
