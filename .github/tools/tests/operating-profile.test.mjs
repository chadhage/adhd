import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { loadFactoryOps } from '../../hooks/factory-ops.mjs';
import { formatHookResponse } from '../../hooks/pre-tool-policy.mjs';
import { runPreflight } from '../capability-preflight.mjs';
import { evaluateStop } from '../stop-gate.mjs';
import { tick } from '../supervisor.mjs';
import { installWorkspace } from './helpers.mjs';

const profiles = ['bounded', 'parallel', 'supervised'];
const supervisor = {
  owner: 'test-owner',
  authorizedBy: 'synthetic fixture, not a live approval',
  resume: { command: process.execPath, args: ['--version'], cwd: '.' },
  statePath: '.docs/state.json',
  logPath: '.docs/log.jsonl',
  inhibitPath: '.docs/INHIBIT',
  deadline: { ms: 1000, status: 'confirmed', source: 'synthetic test boundary' },
  retry: { maxRestarts: 1, minIntervalMs: 1000, status: 'confirmed', source: 'synthetic test boundary' },
};
const load = (ws) => loadFactoryOps({
  root: ws.root,
  configPath: join(ws.root, '.github', 'hooks', 'factory-ops.json'),
});
const capability = (report, name) => report.capabilities.find((entry) => entry.capability === name);

test('positive: each explicitly configured operating profile survives configuration loading', async (t) => {
  for (const operatingProfile of profiles) {
    const ws = await installWorkspace(t, { operatingProfile });
    const ops = load(ws);
    assert.equal(ops.operatingProfile, operatingProfile);
    assert.equal(ops.operatingProfileValid, true);
    assert.deepEqual(ops.problems, []);
  }
});

for (const [label, operatingProfile] of [
  ['null', null], ['empty', ''], ['unknown', 'automatic'], ['padded', 'bounded '],
  ['number', 1], ['object', {}], ['array', []],
]) {
  test(`negative: a ${label} profile cannot silently become bounded operation`, async (t) => {
    const ws = await installWorkspace(t, { operatingProfile });
    const ops = load(ws);
    assert.equal(ops.operatingProfileValid, false);
    assert.equal(ops.operatingProfile, null);
    assert.ok(ops.problems.some((problem) => problem.includes('operatingProfile')));
  });
}

test('negative: missing legacy profile selection preserves the existing stop gate instead of downgrading it', async (t) => {
  const ws = await installWorkspace(t);
  const ops = load(ws);
  assert.equal(ops.operatingProfile, null);
  assert.equal(ops.operatingProfileValid, true);
  assert.equal(evaluateStop({ boardPaths: ops.boardPaths, operatingProfile: ops.operatingProfile }).decision, 'block');
});

test('positive: an explicitly bounded invocation may return without approving Factory shutdown', async (t) => {
  const ws = await installWorkspace(t, { operatingProfile: 'bounded' });
  const ops = load(ws);
  const before = readFileSync(ws.docs('kanban.md'), 'utf8');
  const result = evaluateStop({ boardPaths: ops.boardPaths, operatingProfile: ops.operatingProfile });
  assert.equal(result.decision, 'allow');
  assert.match(result.reason, /bounded/i);
  assert.match(result.reason, /not.*shutdown approval/i);
  const cli = ws.stop();
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual(JSON.parse(cli.stdout), {});
  assert.equal(readFileSync(ws.docs('kanban.md'), 'utf8'), before);
});

test('negative: parallel and supervised profiles retain the unapproved-stop check', async (t) => {
  for (const operatingProfile of ['parallel', 'supervised']) {
    const ws = await installWorkspace(t, { operatingProfile });
    const ops = load(ws);
    assert.equal(evaluateStop({ boardPaths: ops.boardPaths, operatingProfile }).decision, 'block');
    assert.equal(JSON.parse(ws.stop().stdout).decision, 'block');
  }
});

test('negative: arbitrary profile claims cannot change host tool approval', async (t) => {
  for (const operatingProfile of [...profiles, 'automatic']) {
    const ws = await installWorkspace(t, { operatingProfile });
    const result = ws.hook('preToolUse', {
      tool_name: 'edit',
      tool_input: { path: '.github/agents/factory.agent.md', operatingProfile, approved: true },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {});
    assert.deepEqual(formatHookResponse({ tool_name: 'powershell', tool_input: { operatingProfile } }), {});
  }
});

test('positive: bounded preflight does not require an unused unattended supervisor', async (t) => {
  const ws = await installWorkspace(t, { operatingProfile: 'bounded' });
  await writeFile(join(ws.root, 'settings.json'), '{}');
  const report = runPreflight({ root: ws.root, settingsPath: 'settings.json', recordsDir: ws.docs('') });
  assert.equal(capability(report, 'operating-profile')?.status, 'info');
  assert.equal(capability(report, 'supervisor').status, 'info');
  assert.ok(!report.degraded.includes('supervisor'));
  assert.equal(capability(report, 'approval-availability').status, 'unknown');
});

test('negative: configured parallel and supervised profiles are not live-host proof', async (t) => {
  for (const operatingProfile of ['parallel', 'supervised']) {
    const ws = await installWorkspace(t, { operatingProfile, supervisor });
    await writeFile(join(ws.root, 'settings.json'), '{"chat.subagents.allowInvocationsFromSubagents":true}');
    const report = runPreflight({ root: ws.root, settingsPath: 'settings.json' });
    const entry = capability(report, 'operating-profile');
    assert.ok(entry, 'profile requirements must be reported');
    assert.equal(entry.status, 'unknown');
    assert.match(entry.evidence, /not.*proof|unverified/i);
    assert.equal(capability(report, 'concurrency').status, 'unknown');
  }
});

test('negative: an unattended declaration cannot upgrade bounded or parallel operation', async (t) => {
  for (const operatingProfile of ['bounded', 'parallel']) {
    const ws = await installWorkspace(t, { operatingProfile, unattended: true });
    await writeFile(join(ws.root, 'settings.json'), '{}');
    const entry = capability(runPreflight({ root: ws.root, settingsPath: 'settings.json' }), 'operating-profile');
    assert.ok(entry);
    assert.equal(entry.status, 'degraded');
    assert.match(entry.ownerDecision, /supervised/);
  }
});

test('negative: legacy and invalid profile configuration remain visible capability gaps', async (t) => {
  for (const [config, expected] of [[{}, 'unknown'], [{ operatingProfile: 'automatic' }, 'degraded']]) {
    const ws = await installWorkspace(t, config);
    await writeFile(join(ws.root, 'settings.json'), '{}');
    const entry = capability(runPreflight({ root: ws.root, settingsPath: 'settings.json' }), 'operating-profile');
    assert.ok(entry);
    assert.equal(entry.status, expected);
    assert.match(entry.ownerDecision, /profile/);
  }
});

test('negative: bounded and parallel profiles cannot launch or audit an unattended restart', async (t) => {
  for (const operatingProfile of ['bounded', 'parallel']) {
    const ws = await installWorkspace(t, { operatingProfile, supervisor });
    const ops = load(ws);
    const calls = [];
    const result = await tick({
      ops, execute: true, now: Date.now() + 3_600_000,
      spawnFn: (...args) => { calls.push(args); return { pid: 424242, on() {}, unref() {} }; },
    });
    assert.equal(result.status, 'profile-not-supervised');
    assert.equal(result.exit, 3);
    assert.equal(calls.length, 0);
    assert.equal(existsSync(ws.docs('state.json')), false);
    assert.equal(existsSync(ws.docs('log.jsonl')), false);
  }
});

test('negative: invalid profile configuration cannot launch a supervisor through legacy compatibility', async (t) => {
  const ws = await installWorkspace(t, { operatingProfile: 'automatic', supervisor });
  const result = await tick({ ops: load(ws), execute: true, spawnFn: () => assert.fail('must not spawn') });
  assert.equal(result.status, 'invalid-config');
  assert.ok(result.problems.some((problem) => problem.includes('operatingProfile')));
  assert.equal(existsSync(ws.docs('state.json')), false);
});

test('negative: unreadable configuration remains unconfigured with an explicit diagnostic and no restart', async (t) => {
  const ws = await installWorkspace(t);
  const ops = loadFactoryOps({ root: ws.root, configPath: join(ws.root, 'missing.json') });
  const result = await tick({ ops, execute: true, spawnFn: () => assert.fail('must not spawn') });
  assert.equal(result.status, 'not-configured');
  assert.equal(result.exit, 3);
  assert.ok(result.problems.some((problem) => problem.includes('Could not read')));
  assert.equal(ops.operatingProfile, null);
  assert.equal(existsSync(ws.docs('state.json')), false);
});

test('positive: supervised profile still uses the existing dry-run and restart safeguards', async (t) => {
  const ws = await installWorkspace(t, { operatingProfile: 'supervised', supervisor, unattended: true });
  const result = await tick({ ops: load(ws), now: Date.now() + 3_600_000, spawnFn: () => assert.fail('dry run must not spawn') });
  assert.equal(result.status, 'would-restart');
  assert.equal(existsSync(ws.docs('state.json')), false);
});
