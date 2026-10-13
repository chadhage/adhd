import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadFactoryOps } from '../../hooks/factory-ops.mjs';
import { tick, validateSupervisorConfig } from '../supervisor.mjs';

const board = '## To Do\n\n### CARD-1\n\n## In Progress\n\n### CARD-2\n';
const deadPid = 2 ** 22 + 4242;
const hour = 3_600_000;

const supervisorConfig = (overrides = {}) => ({
  owner: 'chadhage',
  authorizedBy: 'chat 2026-10-13: authorize supervisor for unattended runs',
  resume: { command: 'resume-tool', args: ['--factory', 'Demo', '--from', '.docs/restart.md'], cwd: '.' },
  restartPacketPath: '.docs/restart.md',
  statePath: '.docs/supervisor-state.json',
  logPath: '.docs/supervisor-log.jsonl',
  inhibitPath: '.docs/INHIBIT',
  deadline: { ms: 1000, status: 'provisional', source: 'baseline-calc.mjs run 2026-10-13' },
  retry: { maxRestarts: 2, minIntervalMs: 1000, status: 'provisional', source: 'owner proposal' },
  ...overrides,
});

async function setup(t, { supervisor = supervisorConfig(), boardText = board } = {}) {
  const root = await mkdtemp(join(os.tmpdir(), 'adhd-sup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, '.docs'));
  await writeFile(join(root, '.docs', 'kanban.md'), boardText);
  const configPath = join(root, 'factory-ops.json');
  await writeFile(
    configPath,
    JSON.stringify({ version: 1, boardPaths: ['.docs/kanban.md'], approvalsPath: '.docs/approvals.jsonl', progressPath: '.docs/progress.jsonl', supervisor }),
  );
  const calls = [];
  const spawnFn = (command, args, options) => {
    calls.push({ command, args, options });
    return { pid: deadPid, unref() {}, on() {} };
  };
  return { root, ops: loadFactoryOps({ root, configPath }), calls, spawnFn };
}

const stale = () => Date.now() + 10 * hour;
const logOf = async (root) => (await readFile(join(root, '.docs', 'supervisor-log.jsonl'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
const human = (type) => JSON.stringify({ type, approverKind: 'human', approver: 'Chad', source: 'chat', ts: '2026-10-13T12:00:00Z' });

test('config requires every operating value with a status and a source; nothing is defaulted', () => {
  assert.deepEqual(validateSupervisorConfig(supervisorConfig()), []);
  const problems = validateSupervisorConfig({ owner: 'x' });
  for (const expected of ['authorizedBy', 'resume.command', 'resume.args', 'statePath', 'logPath', 'inhibitPath', 'deadline.ms', 'deadline.status', 'deadline.source', 'retry.maxRestarts', 'retry.minIntervalMs', 'retry.status', 'retry.source']) {
    assert.ok(problems.some((problem) => problem.includes(expected)), expected);
  }
  assert.ok(validateSupervisorConfig(supervisorConfig({ retry: { maxRestarts: 0, minIntervalMs: 1000, status: 'guess', source: 's' } })).length >= 2);
});

test('without a supervisor or with an invalid config nothing runs and the gap is reported', async (t) => {
  const none = await setup(t, { supervisor: null });
  assert.equal((await tick({ ops: none.ops, execute: true, now: stale(), spawnFn: none.spawnFn })).status, 'not-configured');

  const bad = await setup(t, { supervisor: { owner: 'x' } });
  const result = await tick({ ops: bad.ops, execute: true, now: stale(), spawnFn: bad.spawnFn });
  assert.equal(result.status, 'invalid-config');
  assert.equal(result.exit, 3);
  assert.equal(bad.calls.length, 0);
});

test('dry run detects a suspected halt, logs the incident, and never spawns', async (t) => {
  const { root, ops, calls, spawnFn } = await setup(t);
  const result = await tick({ ops, now: stale(), spawnFn });
  assert.equal(result.status, 'would-restart');
  assert.equal(result.incident.trigger, 'unapproved halt (suspected)');
  assert.equal(calls.length, 0);
  assert.equal((await logOf(root)).at(-1).status, 'would-restart');
});

test('execute spawns exactly the configured command without a shell and records the attempt', async (t) => {
  const { root, ops, calls, spawnFn } = await setup(t);
  const result = await tick({ ops, execute: true, now: stale(), spawnFn });
  assert.equal(result.status, 'restarted');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'resume-tool');
  assert.deepEqual(calls[0].args, ['--factory', 'Demo', '--from', '.docs/restart.md']);
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.detached, true);
  assert.equal(result.restartPacket, 'missing');

  const state = JSON.parse(await readFile(join(root, '.docs', 'supervisor-state.json'), 'utf8'));
  assert.equal(state.restarts.length, 1);
  assert.equal(state.restarts[0].attempt, 1);
});

test('healthy progress, an empty board, and a missing progress signal never restart', async (t) => {
  const fresh = await setup(t);
  assert.equal((await tick({ ops: fresh.ops, execute: true, now: Date.now(), spawnFn: fresh.spawnFn })).status, 'ok');
  assert.equal(fresh.calls.length, 0);

  const empty = await setup(t, { boardText: '## To Do\n\nNone\n\n## In Progress\n\nNone\n' });
  assert.equal((await tick({ ops: empty.ops, execute: true, now: stale(), spawnFn: empty.spawnFn })).status, 'ok');
  assert.equal(empty.calls.length, 0);
});

test('an inhibit file or a valid human stoppage approval blocks every restart', async (t) => {
  const inhibited = await setup(t);
  await writeFile(join(inhibited.root, '.docs', 'INHIBIT'), 'revoked');
  assert.equal((await tick({ ops: inhibited.ops, execute: true, now: stale(), spawnFn: inhibited.spawnFn })).status, 'inhibited');
  assert.equal(inhibited.calls.length, 0);

  const approved = await setup(t);
  await writeFile(join(approved.root, '.docs', 'approvals.jsonl'), `${human('factory-shutdown-approval')}\n`);
  assert.equal((await tick({ ops: approved.ops, execute: true, now: stale(), spawnFn: approved.spawnFn })).status, 'stoppage-approved');
  assert.equal(approved.calls.length, 0);

  const forged = await setup(t);
  await writeFile(join(forged.root, '.docs', 'approvals.jsonl'), `${human('factory-shutdown-approval').replace('"human"', '"agent"')}\n`);
  assert.equal((await tick({ ops: forged.ops, execute: true, now: stale(), spawnFn: forged.spawnFn })).status, 'restarted');
});

test('duplicate runs are prevented while a resumed run is alive, and a stalled one is reported, not killed', async (t) => {
  const { root, ops, calls } = await setup(t);
  const alive = { ...ops };
  const aliveSpawn = (command, args, options) => {
    calls.push({ command, args, options });
    return { pid: process.pid, unref() {}, on() {} };
  };
  const first = await tick({ ops: alive, execute: true, now: stale(), spawnFn: aliveSpawn });
  assert.equal(first.status, 'restarted');

  const second = await tick({ ops: alive, execute: true, now: first.attempt ? Date.parse(first.attempt.ts) + 10 : Date.now(), spawnFn: aliveSpawn });
  assert.equal(second.status, 'child-running');

  const third = await tick({ ops: alive, execute: true, now: Date.parse(first.attempt.ts) + 10 * hour, spawnFn: aliveSpawn });
  assert.equal(third.status, 'child-stalled');
  assert.equal(calls.length, 1);
  assert.equal((await logOf(root)).length, 3);
});

test('retry bounds hold: cooldown first, then the limit escalates to the owner instead of restarting', async (t) => {
  const { ops, calls, spawnFn } = await setup(t, { supervisor: supervisorConfig({ retry: { maxRestarts: 2, minIntervalMs: 5 * hour, status: 'provisional', source: 'owner proposal' } }) });
  const t0 = stale();
  assert.equal((await tick({ ops, execute: true, now: t0, spawnFn })).status, 'restarted');
  assert.equal((await tick({ ops, execute: true, now: t0 + hour, spawnFn })).status, 'cooldown');
  assert.equal((await tick({ ops, execute: true, now: t0 + 6 * hour, spawnFn })).status, 'restarted');
  const limit = await tick({ ops, execute: true, now: t0 + 12 * hour, spawnFn });
  assert.equal(limit.status, 'restart-limit-reached');
  assert.equal(limit.exit, 1);
  assert.equal(calls.length, 2);
});

test('a failing spawn is logged and still counts toward the retry bound', async (t) => {
  const { root, ops } = await setup(t);
  const failing = () => {
    throw Object.assign(new Error('boom'), { code: 'ENOENT' });
  };
  const result = await tick({ ops, execute: true, now: stale(), spawnFn: failing });
  assert.equal(result.status, 'spawn-failed');
  assert.equal(result.attempt.error, 'ENOENT');
  assert.equal(JSON.parse(await readFile(join(root, '.docs', 'supervisor-state.json'), 'utf8')).restarts.length, 1);
});
