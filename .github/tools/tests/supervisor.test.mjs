import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadFactoryOps } from '../../hooks/factory-ops.mjs';
import { tick, validateSupervisorConfig } from '../supervisor.mjs';
import { emptyBoard, headingBoard, human, tempDir } from './helpers.mjs';

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

async function setup(t, { supervisor = supervisorConfig(), boardText = headingBoard, boardExists = true } = {}) {
  const root = await tempDir(t, 'adhd-sup-');
  await mkdir(join(root, '.docs'));
  if (boardExists) await writeFile(join(root, '.docs', 'kanban.md'), boardText);
  const configPath = join(root, 'factory-ops.json');
  await writeFile(configPath, JSON.stringify({ version: 1, boardPaths: ['.docs/kanban.md'], approvalsPath: '.docs/approvals.jsonl', progressPath: '.docs/progress.jsonl', supervisor }));
  const calls = [];
  const spawnFn = (command, args, options) => {
    calls.push({ command, args, options });
    return { pid: deadPid, unref() {}, on() {} };
  };
  return { root, ops: loadFactoryOps({ root, configPath }), calls, spawnFn };
}

const stale = () => Date.now() + 10 * hour;
const logOf = async (root) => (await readFile(join(root, '.docs', 'supervisor-log.jsonl'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
const stateOf = async (root) => JSON.parse(await readFile(join(root, '.docs', 'supervisor-state.json'), 'utf8'));

// ---- configuration ----

test('positive: a config with every value, status, and source is valid', () => assert.deepEqual(validateSupervisorConfig(supervisorConfig()), []));

for (const expected of ['owner', 'authorizedBy', 'resume.command', 'resume.args', 'statePath', 'logPath', 'inhibitPath', 'deadline.ms', 'deadline.status', 'deadline.source', 'retry.maxRestarts', 'retry.minIntervalMs', 'retry.status', 'retry.source']) {
  test(`negative: a config without ${expected} is rejected and nothing is defaulted`, () => {
    assert.ok(validateSupervisorConfig({}).some((problem) => problem.includes(expected)));
  });
}

for (const [label, retry] of [
  ['a zero retry bound', { maxRestarts: 0, minIntervalMs: 1000, status: 'provisional', source: 's' }],
  ['a fractional interval', { maxRestarts: 2, minIntervalMs: 1.5, status: 'provisional', source: 's' }],
  ['an unknown status', { maxRestarts: 2, minIntervalMs: 1000, status: 'guess', source: 's' }],
  ['an empty source', { maxRestarts: 2, minIntervalMs: 1000, status: 'provisional', source: ' ' }],
]) {
  test(`negative: ${label} is rejected`, () => assert.ok(validateSupervisorConfig(supervisorConfig({ retry })).length >= 1));
}

test('negative: resume args that are not strings are rejected so no shell expansion is possible', () => {
  assert.ok(validateSupervisorConfig(supervisorConfig({ resume: { command: 'x', args: [1] } })).some((problem) => problem.includes('resume.args')));
});

test('negative: without a supervisor nothing runs and the gap is reported', async (t) => {
  const { ops, calls, spawnFn } = await setup(t, { supervisor: null });
  const result = await tick({ ops, execute: true, now: stale(), spawnFn });
  assert.equal(result.status, 'not-configured');
  assert.equal(result.exit, 3);
  assert.equal(calls.length, 0);
});

test('negative: an invalid config refuses to run and lists the problems', async (t) => {
  const { ops, calls, spawnFn } = await setup(t, { supervisor: { owner: 'x' } });
  const result = await tick({ ops, execute: true, now: stale(), spawnFn });
  assert.equal(result.status, 'invalid-config');
  assert.ok(result.problems.length > 3);
  assert.equal(calls.length, 0);
});

test('negative: a missing board file is reported rather than assumed empty', async (t) => {
  const { ops, calls, spawnFn } = await setup(t, { boardExists: false });
  const result = await tick({ ops, execute: true, now: stale(), spawnFn });
  assert.equal(result.status, 'no-board');
  assert.equal(calls.length, 0);
});

// ---- resuming ----

test('positive: a dry run detects a suspected halt, logs the incident, and never spawns', async (t) => {
  const { root, ops, calls, spawnFn } = await setup(t);
  const result = await tick({ ops, now: stale(), spawnFn });
  assert.equal(result.status, 'would-restart');
  assert.equal(result.incident.trigger, 'unapproved halt (suspected)');
  assert.equal(calls.length, 0);
  assert.equal((await logOf(root)).at(-1).status, 'would-restart');
});

test('positive: execute spawns exactly the configured command without a shell and records the attempt', async (t) => {
  const { root, ops, calls, spawnFn } = await setup(t);
  const result = await tick({ ops, execute: true, now: stale(), spawnFn });
  assert.equal(result.status, 'restarted');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'resume-tool');
  assert.deepEqual(calls[0].args, ['--factory', 'Demo', '--from', '.docs/restart.md']);
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.detached, true);
  assert.equal(result.restartPacket, 'missing');
  assert.equal((await stateOf(root)).restarts[0].attempt, 1);
});

test('positive: a present restart packet is reported when resuming', async (t) => {
  const { root, ops, spawnFn } = await setup(t);
  await writeFile(join(root, '.docs', 'restart.md'), 'packet');
  assert.equal((await tick({ ops, execute: true, now: stale(), spawnFn })).restartPacket, 'present');
});

test('positive: an agent-authored approval does not suppress a restart', async (t) => {
  const { root, ops, spawnFn } = await setup(t);
  await writeFile(join(root, '.docs', 'approvals.jsonl'), `${human('factory-shutdown-approval').replace('"human"', '"agent"')}\n`);
  assert.equal((await tick({ ops, execute: true, now: stale(), spawnFn })).status, 'restarted');
});

test('positive: fresh progress from a progress ledger entry means no restart is needed', async (t) => {
  const { root, ops, calls, spawnFn } = await setup(t);
  await writeFile(join(root, '.docs', 'progress.jsonl'), `${JSON.stringify({ ts: new Date().toISOString() })}\n`);
  assert.equal((await tick({ ops, execute: true, now: Date.now(), spawnFn })).status, 'ok');
  assert.equal(calls.length, 0);
});

// ---- rails ----

test('negative: healthy progress never restarts', async (t) => {
  const { ops, calls, spawnFn } = await setup(t);
  assert.equal((await tick({ ops, execute: true, now: Date.now(), spawnFn })).status, 'ok');
  assert.equal(calls.length, 0);
});

test('negative: an empty board never restarts', async (t) => {
  const { ops, calls, spawnFn } = await setup(t, { boardText: emptyBoard });
  assert.equal((await tick({ ops, execute: true, now: stale(), spawnFn })).status, 'ok');
  assert.equal(calls.length, 0);
});

test('negative: an unparseable board is unverifiable and never restarts', async (t) => {
  const { ops, calls, spawnFn } = await setup(t, { boardText: 'no buckets here' });
  const result = await tick({ ops, execute: true, now: stale(), spawnFn });
  assert.equal(result.status, 'unverifiable');
  assert.equal(result.exit, 3);
  assert.equal(calls.length, 0);
});

test('negative: an inhibit file blocks every restart', async (t) => {
  const { root, ops, calls, spawnFn } = await setup(t);
  await writeFile(join(root, '.docs', 'INHIBIT'), 'revoked');
  assert.equal((await tick({ ops, execute: true, now: stale(), spawnFn })).status, 'inhibited');
  assert.equal(calls.length, 0);
});

for (const type of ['factory-shutdown-approval', 'stoppage-approval']) {
  test(`negative: a valid human ${type} blocks every restart`, async (t) => {
    const { root, ops, calls, spawnFn } = await setup(t);
    await writeFile(join(root, '.docs', 'approvals.jsonl'), `${human(type)}\n`);
    assert.equal((await tick({ ops, execute: true, now: stale(), spawnFn })).status, 'stoppage-approved');
    assert.equal(calls.length, 0);
  });
}

test('negative: a resumed run that is still alive prevents a duplicate run', async (t) => {
  const { root, ops, calls } = await setup(t);
  const aliveSpawn = (command, args, options) => {
    calls.push({ command, args, options });
    return { pid: process.pid, unref() {}, on() {} };
  };
  const first = await tick({ ops, execute: true, now: stale(), spawnFn: aliveSpawn });
  const second = await tick({ ops, execute: true, now: Date.parse(first.attempt.ts) + 10, spawnFn: aliveSpawn });
  assert.equal(second.status, 'child-running');
  assert.equal(calls.length, 1);
  assert.equal((await logOf(root)).length, 2);
});

test('negative: a stalled resumed run is reported and never killed or replaced', async (t) => {
  const { ops, calls } = await setup(t);
  const aliveSpawn = (command, args, options) => {
    calls.push({ command, args, options });
    return { pid: process.pid, unref() {}, on() {} };
  };
  const first = await tick({ ops, execute: true, now: stale(), spawnFn: aliveSpawn });
  const stalled = await tick({ ops, execute: true, now: Date.parse(first.attempt.ts) + 10 * hour, spawnFn: aliveSpawn });
  assert.equal(stalled.status, 'child-stalled');
  assert.equal(stalled.exit, 1);
  assert.equal(calls.length, 1);
});

test('negative: the cooldown holds before the next restart', async (t) => {
  const { ops, calls, spawnFn } = await setup(t, { supervisor: supervisorConfig({ retry: { maxRestarts: 5, minIntervalMs: 5 * hour, status: 'provisional', source: 'owner' } }) });
  const t0 = stale();
  await tick({ ops, execute: true, now: t0, spawnFn });
  assert.equal((await tick({ ops, execute: true, now: t0 + hour, spawnFn })).status, 'cooldown');
  assert.equal(calls.length, 1);
});

test('negative: the retry limit escalates to the owner instead of restarting', async (t) => {
  const { ops, calls, spawnFn } = await setup(t, { supervisor: supervisorConfig({ retry: { maxRestarts: 2, minIntervalMs: 5 * hour, status: 'provisional', source: 'owner' } }) });
  const t0 = stale();
  assert.equal((await tick({ ops, execute: true, now: t0, spawnFn })).status, 'restarted');
  assert.equal((await tick({ ops, execute: true, now: t0 + 6 * hour, spawnFn })).status, 'restarted');
  const limit = await tick({ ops, execute: true, now: t0 + 12 * hour, spawnFn });
  assert.equal(limit.status, 'restart-limit-reached');
  assert.equal(limit.exit, 1);
  assert.equal(calls.length, 2);
});

test('negative: a failing spawn is logged and still counts toward the retry bound', async (t) => {
  const { root, ops } = await setup(t);
  const failing = () => {
    throw Object.assign(new Error('boom'), { code: 'ENOENT' });
  };
  const result = await tick({ ops, execute: true, now: stale(), spawnFn: failing });
  assert.equal(result.status, 'spawn-failed');
  assert.equal(result.attempt.error, 'ENOENT');
  assert.equal((await stateOf(root)).restarts.length, 1);
});

test('negative: a failing spawn without an error code still records the message', async (t) => {
  const { ops } = await setup(t);
  const failing = () => {
    throw new Error('plain failure');
  };
  assert.equal((await tick({ ops, execute: true, now: stale(), spawnFn: failing })).attempt.error, 'plain failure');
});

test('negative: a spawn that returns no pid is a failure, not a restart', async (t) => {
  const { root, ops } = await setup(t);
  const noPid = () => ({ unref() {}, on() {} });
  const result = await tick({ ops, execute: true, now: stale(), spawnFn: noPid });
  assert.equal(result.status, 'spawn-failed');
  assert.equal(result.attempt.error, 'no-pid');
  assert.equal((await stateOf(root)).childPid, null);
});

test('negative: a corrupt state file requires recovery and never permits a restart', async (t) => {
  const { root, ops, calls, spawnFn } = await setup(t);
  await writeFile(join(root, '.docs', 'supervisor-state.json'), '{ broken');
  const result = await tick({ ops, execute: true, now: stale(), spawnFn });
  assert.equal(result.status, 'state-recovery-required');
  assert.equal(result.exit, 3);
  assert.equal(calls.length, 0);
  assert.equal(await readFile(join(root, '.docs', 'supervisor-state.json'), 'utf8'), '{ broken');
});

for (const [label, content] of [
  ['empty', ''],
  ['null', 'null'],
  ['an array', '[]'],
  ['missing history', '{"childPid":null}'],
  ['non-array history', '{"restarts":{},"childPid":null}'],
  ['missing child PID', '{"restarts":[]}'],
  ['invalid child PID', '{"restarts":[],"childPid":-1}'],
  ['invalid history timestamp', '{"restarts":[{"ts":"invalid","attempt":1,"pid":null}],"childPid":null}'],
  ['invalid attempt number', '{"restarts":[{"ts":"2026-10-19T00:00:00Z","attempt":0,"pid":null}],"childPid":null}'],
  ['invalid history PID', '{"restarts":[{"ts":"2026-10-19T00:00:00Z","attempt":1,"pid":"123"}],"childPid":null}'],
]) {
  test(`negative: supervisor state that is ${label} is preserved and cannot reset restart limits`, async (t) => {
    const { root, ops, calls, spawnFn } = await setup(t);
    const path = join(root, '.docs', 'supervisor-state.json');
    await writeFile(path, content);
    const result = await tick({ ops, execute: true, now: stale(), spawnFn });
    assert.equal(result.status, 'state-recovery-required');
    assert.equal(result.exit, 3);
    assert.equal(calls.length, 0);
    assert.equal(await readFile(path, 'utf8'), content);
    assert.match(result.reason, /state/i);
  });
}

test('negative: overlapping ticks cannot consume a one-restart budget twice', async (t) => {
  const { root, ops, calls } = await setup(t, {
    supervisor: supervisorConfig({ retry: { maxRestarts: 1, minIntervalMs: 1, status: 'confirmed', source: 'synthetic test owner' } }),
  });
  const spawnFn = (command, args, options) => {
    calls.push({ command, args, options });
    return { pid: process.pid, unref() {}, on() {} };
  };
  const now = stale();
  await Promise.all([tick({ ops, execute: true, now, spawnFn }), tick({ ops, execute: true, now, spawnFn })]);
  assert.equal(calls.length, 1);
  assert.equal((await stateOf(root)).restarts.length, 1);
});

test('negative: a held state-write lock prevents launch instead of losing the attempt', async (t) => {
  const { root, ops, calls, spawnFn } = await setup(t);
  await writeFile(join(root, '.docs', 'supervisor-state.json.lock'), JSON.stringify({ pid: process.pid, host: os.hostname(), owner: 'other writer' }));
  const result = await tick({ ops, execute: true, now: stale(), spawnFn });
  assert.equal(calls.length, 0);
  assert.notEqual(result.status, 'restarted');
  assert.notEqual(result.exit, 0);
});

test('positive: the attempt is durably reserved before the configured process is started', async (t) => {
  const { root, ops } = await setup(t);
  let observed;
  const spawnFn = () => {
    observed = JSON.parse(readFileSync(join(root, '.docs', 'supervisor-state.json'), 'utf8'));
    return { pid: deadPid, unref() {}, on() {} };
  };
  const result = await tick({ ops, execute: true, now: stale(), spawnFn });
  assert.equal(result.status, 'restarted');
  assert.equal(observed.restarts.length, 1);
  assert.equal(observed.restarts[0].phase, 'reserved');
  assert.equal(observed.restarts[0].pid, null);
  assert.equal((await stateOf(root)).restarts[0].phase, 'started');
});

test('negative: a reservation that cannot be persisted never starts a process', async (t) => {
  const { ops, calls, spawnFn } = await setup(t, {
    supervisor: supervisorConfig({ statePath: '.docs/missing/state.json' }),
  });
  const result = await tick({ ops, execute: true, now: stale(), spawnFn });
  assert.equal(result.status, 'state-reservation-failed');
  assert.equal(result.exit, 3);
  assert.equal(calls.length, 0);
  assert.match(result.reason, /ENOENT/);
});

test('negative: a held audit lock cannot turn an unrecorded launch event into a successful tick', async (t) => {
  const { root, ops, calls, spawnFn } = await setup(t);
  await writeFile(join(root, '.docs', 'supervisor-log.jsonl.lock'), JSON.stringify({ pid: process.pid, host: os.hostname() }));
  const result = await tick({ ops, execute: true, now: stale(), spawnFn });
  assert.equal(result.status, 'audit-write-failed');
  assert.equal(result.operationStatus, 'restarted');
  assert.equal(result.exit, 3);
  assert.equal(result.attempt.pid, deadPid);
  assert.equal(calls.length, 1);
  assert.equal((await stateOf(root)).restarts.length, 1);
  assert.equal((await stateOf(root)).restarts[0].phase, 'started');
  assert.match(result.reason, /locked/);
});

test('negative: an audit filesystem failure exposes the observed launch and never blindly replays it', async (t) => {
  const { root, ops, calls } = await setup(t, { supervisor: supervisorConfig({ logPath: '.docs/missing/audit.jsonl' }) });
  const spawnFn = (...args) => {
    calls.push(args);
    return { pid: process.pid, unref() {}, on() {} };
  };
  const first = await tick({ ops, execute: true, now: stale(), spawnFn });
  assert.equal(first.status, 'audit-write-failed');
  assert.equal(first.operationStatus, 'restarted');
  assert.equal(first.exit, 3);
  assert.match(first.reason, /ENOENT/);
  const second = await tick({ ops, execute: true, now: stale(), spawnFn });
  assert.equal(second.status, 'audit-write-failed');
  assert.equal(second.operationStatus, 'child-running');
  assert.equal(calls.length, 1);
  assert.equal((await stateOf(root)).childPid, process.pid);
});

for (const phase of ['reserved', undefined]) {
  test(`negative: an unresolved ${phase ?? 'legacy'} attempt cannot be replayed after the cooldown or new progress`, async (t) => {
    const { root, ops, calls, spawnFn } = await setup(t);
    const state = {
      restarts: [{ ts: new Date(Date.now() - hour).toISOString(), attempt: 1, pid: null, ...(phase ? { phase } : {}) }],
      childPid: null,
    };
    const path = join(root, '.docs', 'supervisor-state.json');
    const original = JSON.stringify(state);
    await writeFile(path, original);
    await writeFile(join(root, '.docs', 'progress.jsonl'), JSON.stringify({ ts: new Date().toISOString() }));
    const result = await tick({ ops, execute: true, now: stale(), spawnFn });
    assert.equal(result.status, 'state-recovery-required');
    assert.equal(result.exit, 3);
    assert.equal(calls.length, 0);
    assert.equal(await readFile(path, 'utf8'), original);
  });
}

test('negative: a launch whose final state write fails stays reserved and requires explicit recovery', async (t) => {
  const { root, ops, calls } = await setup(t);
  const spawnFn = (...args) => {
    calls.push(args);
    writeFileSync(join(root, '.docs', 'supervisor-state.json.lock'), JSON.stringify({ pid: process.pid, host: os.hostname() }));
    return { pid: process.pid, unref() {}, on() {} };
  };
  const result = await tick({ ops, execute: true, now: stale(), spawnFn });
  assert.equal(result.status, 'state-recovery-required');
  assert.equal(result.attempt.pid, process.pid);
  assert.equal((await stateOf(root)).restarts[0].phase, 'reserved');
  const next = await tick({ ops, execute: true, now: stale() + hour, spawnFn });
  assert.equal(next.status, 'state-recovery-required');
  assert.equal(calls.length, 1);
});

for (const [phase, pid, error] of [
  ['unknown', null, undefined],
  ['started', null, undefined],
  ['failed', null, undefined],
  ['reserved', 123, undefined],
  ['failed', null, ''],
]) {
  test(`negative: contradictory attempt state ${phase}/${pid}/${error ?? 'no-error'} requires recovery`, async (t) => {
    const { root, ops, calls, spawnFn } = await setup(t);
    await writeFile(join(root, '.docs', 'supervisor-state.json'), JSON.stringify({
      restarts: [{ ts: new Date().toISOString(), attempt: 1, pid, phase, ...(error !== undefined ? { error } : {}) }],
      childPid: null,
    }));
    assert.equal((await tick({ ops, execute: true, now: stale(), spawnFn })).status, 'state-recovery-required');
    assert.equal(calls.length, 0);
  });
}

for (const pid of [0, -1, 1.5, '123']) {
  test(`negative: a spawn with invalid PID ${pid} is recorded as failure, never a started attempt`, async (t) => {
    const { root, ops } = await setup(t);
    const result = await tick({ ops, execute: true, now: stale(), spawnFn: () => ({ pid }) });
    assert.equal(result.status, 'spawn-failed');
    assert.equal(result.attempt.pid, null);
    assert.equal(result.attempt.phase, 'failed');
    assert.equal((await stateOf(root)).childPid, null);
  });
}
