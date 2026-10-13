/**
 * Acceptance tests for the Continuity Acceptance Scenarios in
 * .github/skills/factory-mvp-and-recovery/SKILL.md.
 *
 * Each group (AC-n) drives the shipped hook and tools as real processes against a
 * temporary product-like workspace. Scenarios that depend on agent judgment rather
 * than tooling (reserve refinement, blocked WIP, role availability, authority
 * renewal, attestation consensus) are listed in .github/tools/README.md as not
 * machine-testable.
 */
import assert from 'node:assert/strict';
import { readFile, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { emptyBoard, human, installWorkspace, tempDir } from './helpers.mjs';

const longAgo = new Date('2020-01-01T00:00:00Z');
const json = (run) => JSON.parse(run.stdout);
const stopEvent = (cwd, extra = {}) => ({ hook_event_name: 'Stop', session_id: 's', timestamp: '2026-10-13T00:00:00Z', cwd, transcript_path: 't', stop_reason: 'end_turn', stop_hook_active: false, ...extra });
const resume = (args, { deadlineMs = 1000 } = {}) => ({
  owner: 'chadhage',
  authorizedBy: 'chat 2026-10-13',
  resume: { command: process.execPath, args, cwd: '.' },
  restartPacketPath: '.docs/restart.md',
  statePath: '.docs/state.json',
  logPath: '.docs/log.jsonl',
  inhibitPath: '.docs/INHIBIT',
  deadline: { ms: deadlineMs, status: 'provisional', source: 'baseline-calc' },
  retry: { maxRestarts: 1, minIntervalMs: 1, status: 'provisional', source: 'owner' },
});

// Board modification time counts as progress, so a stalled Factory needs an aged board too.
async function stall(ws) {
  await writeFile(ws.docs('progress.jsonl'), `${JSON.stringify({ ts: longAgo.toISOString() })}\n`);
  await utimes(ws.docs('kanban.md'), longAgo, longAgo);
}
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
async function waitForExit(pid) {
  const deadline = Date.now() + 30_000;
  while (alive(pid) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
}
async function waitUntilDead(pid) {
  await waitForExit(pid);
  assert.equal(alive(pid), false, 'resumed child should have exited');
}

// AC-1: an assignment completes with unfinished authorized cards -> no automatic furlough
test('negative: [AC-1] a turn ending with unfinished work and no approval is blocked, not treated as completion', async (t) => {
  const ws = await installWorkspace(t);
  const run = ws.stop(stopEvent(ws.root));
  assert.equal(json(run).decision, 'block');
  assert.match(json(run).reason, /To Do=2, In Progress=1/);
});

test('positive: [AC-1] the same turn end is allowed once the invoker has recorded a Factory shutdown approval', async (t) => {
  const ws = await installWorkspace(t);
  await writeFile(ws.docs('approvals.jsonl'), `${human('factory-shutdown-approval')}\n`);
  assert.deepEqual(json(ws.stop(stopEvent(ws.root))), {});
});

// A resumed child that lives until the test releases it, so liveness never depends on timing under load.
const holdUntilReleased = "const f=process.argv[1];const i=setInterval(()=>{if(require('fs').existsSync(f))process.exit(0)},25);setTimeout(()=>process.exit(0),180000);";

// AC-5: session ends, crashes, or a call returns -> supervisor resumes within limits, or the gap is disclosed
test('positive: [AC-5] a stalled Factory is resumed by a real process and a duplicate run is prevented while it lives', async (t) => {
  const dir = await tempDir(t);
  const release = join(dir, 'release');
  // A deadline far above any scheduling delay: the stalled-child rule must not depend on load.
  const ws = await installWorkspace(t, { supervisor: resume(['-e', holdUntilReleased, release], { deadlineMs: 600_000 }) });
  await stall(ws);
  const first = ws.tool('supervisor.mjs', ['tick', '--execute']);
  assert.equal(json(first).status, 'restarted', first.stdout + first.stderr);
  const pid = json(first).attempt.pid;
  // Release and reap the child inside the test: cleanup hooks run in registration order and
  // would otherwise delete the workspace while the child still holds it open (EBUSY on Windows).
  try {
    assert.ok(Number.isInteger(pid) && pid > 0);
    assert.equal(alive(pid), true);
    assert.equal(json(ws.tool('supervisor.mjs', ['tick', '--execute'])).status, 'child-running');
    assert.equal(JSON.parse(await readFile(ws.docs('state.json'), 'utf8')).restarts.length, 1);
  } finally {
    await writeFile(release, 'done');
    await waitForExit(pid);
    if (alive(pid)) process.kill(pid);
  }
});

test('negative: [AC-5] with no supervisor the interruption is disclosed and nothing is started or promised', async (t) => {
  const ws = await installWorkspace(t);
  await stall(ws);
  const run = ws.tool('supervisor.mjs', ['tick', '--execute']);
  assert.equal(run.status, 3);
  assert.equal(json(run).status, 'not-configured');
  assert.match(json(run).reason, /unattended continuity is unavailable/);
});

test('negative: [AC-5] after the retry bound the supervisor escalates to the owner instead of restarting again', async (t) => {
  const ws = await installWorkspace(t, { supervisor: resume(['-e', '0']) });
  await stall(ws);
  const first = json(ws.tool('supervisor.mjs', ['tick', '--execute']));
  assert.equal(first.status, 'restarted');
  await waitUntilDead(first.attempt.pid);
  await new Promise((done) => setTimeout(done, 10));
  const second = ws.tool('supervisor.mjs', ['tick', '--execute']);
  assert.equal(json(second).status, 'restart-limit-reached');
  assert.equal(second.status, 1);
  assert.equal(JSON.parse(await readFile(ws.docs('state.json'), 'utf8')).restarts.length, 1);
});

// AC-7: voluntary stop, revocation, or safety incident
test('negative: [AC-7] an inhibit file stops restarts even though the Factory is stalled', async (t) => {
  const ws = await installWorkspace(t, { supervisor: resume(['-e', '0']) });
  await stall(ws);
  await writeFile(ws.docs('INHIBIT'), 'authority revoked');
  const run = ws.tool('supervisor.mjs', ['tick', '--execute']);
  assert.equal(json(run).status, 'inhibited');
  await assert.rejects(readFile(ws.docs('state.json'), 'utf8'), { code: 'ENOENT' });
});

test('negative: [AC-7] an agent-authored approval file does not make a stop legitimate', async (t) => {
  const ws = await installWorkspace(t);
  await writeFile(ws.docs('approvals.jsonl'), `${human('factory-shutdown-approval', { approverKind: 'agent' })}\n`);
  assert.equal(json(ws.stop(stopEvent(ws.root))).decision, 'block');
});

test('positive: [AC-7] a recorded human stoppage approval is honored by both the stop gate and the supervisor', async (t) => {
  const ws = await installWorkspace(t, { supervisor: resume(['-e', '0']) });
  await stall(ws);
  await writeFile(ws.docs('approvals.jsonl'), `${human('factory-shutdown-approval')}\n`);
  assert.deepEqual(json(ws.stop(stopEvent(ws.root))), {});
  assert.equal(json(ws.tool('supervisor.mjs', ['tick', '--execute'])).status, 'stoppage-approved');
});

// AC-8: validated queue exhaustion without invoker-approved shutdown -> no autonomous halt
test('negative: [AC-8] an empty board without an invoker-approved shutdown is still blocked', async (t) => {
  const ws = await installWorkspace(t, {}, { board: emptyBoard });
  const run = ws.stop(stopEvent(ws.root));
  assert.equal(json(run).decision, 'block');
  assert.match(json(run).reason, /To Do=0, In Progress=0/);
});

test('negative: [AC-8] an empty board is reported ok by the supervisor but never treated as shutdown approval', async (t) => {
  const ws = await installWorkspace(t, { supervisor: resume(['-e', '0']) }, { board: emptyBoard });
  await stall(ws);
  const run = ws.tool('supervisor.mjs', ['tick', '--execute']);
  assert.equal(json(run).status, 'ok');
  await assert.rejects(readFile(ws.docs('state.json'), 'utf8'), { code: 'ENOENT' });
});

// AC-10: a non-read tool approval is pending, timed out, or denied
test('negative: [AC-10] a non-read tool is asked about, never silently allowed', async (t) => {
  const ws = await installWorkspace(t);
  const run = ws.hook('preToolUse', { toolName: 'powershell', toolArgs: { command: 'npm test' } });
  assert.equal(json(run).permissionDecision, 'ask');
});

test('negative: [AC-10] when unattended the action is denied explicitly and parked in the queue with its exact parameters', async (t) => {
  const ws = await installWorkspace(t, { unattended: true });
  const run = ws.hook('preToolUse', { toolName: 'powershell', toolArgs: { command: 'npm test', token: 'sk-secretsecretsecret1' } });
  assert.equal(json(run).permissionDecision, 'deny');
  assert.match(json(run).permissionDecisionReason, /AQ-1/);
  const queued = await readFile(ws.docs('queue.jsonl'), 'utf8');
  assert.match(queued, /npm test/);
  assert.equal(queued.includes('secretsecret'), false);
});

test('positive: [AC-10] a pending human decision lets the agent yield instead of being forced to continue', async (t) => {
  const ws = await installWorkspace(t, { unattended: true });
  ws.hook('preToolUse', { toolName: 'powershell', toolArgs: { command: 'npm test' } });
  assert.deepEqual(json(ws.stop(stopEvent(ws.root))), {});
});

test('negative: [AC-10] a human-denied action is not retried without changed evidence', async (t) => {
  const ws = await installWorkspace(t, { unattended: true });
  const event = { toolName: 'powershell', toolArgs: { command: 'npm test' } };
  ws.hook('preToolUse', event);
  const denied = ws.tool('approval-queue.mjs', ['resolve', '--queue', ws.docs('queue.jsonl'), '--id', 'AQ-1', '--decision', 'denied', '--approver', 'Chad', '--source', 'chat']);
  assert.equal(denied.status, 0, denied.stderr);
  const retry = ws.hook('preToolUse', event);
  assert.equal(json(retry).permissionDecision, 'deny');
  assert.match(json(retry).permissionDecisionReason, /already denied/);
});

test('positive: [AC-10] other authorized work continues: a scoped board edit needs no prompt while a shell command still asks', async (t) => {
  const ws = await installWorkspace(t);
  const edit = ws.hook('preToolUse', { toolName: 'edit', toolArgs: { path: ws.docs('kanban.md'), old_str: '### CARD-1 First', new_str: '### CARD-1 First (refined)' } });
  assert.equal(json(edit).permissionDecision, 'allow');
  assert.equal(json(ws.hook('preToolUse', { toolName: 'powershell', toolArgs: { command: 'x' } })).permissionDecision, 'ask');
});

test('negative: [AC-10] a board edit that adds a Done bucket, or touches a protected path, still asks', async (t) => {
  const ws = await installWorkspace(t);
  const done = ws.hook('preToolUse', { toolName: 'edit', toolArgs: { path: ws.docs('kanban.md'), old_str: '## In Progress', new_str: '## Done\n\n## In Progress' } });
  assert.equal(json(done).permissionDecision, 'ask');
  const protectedEdit = ws.hook('preToolUse', { toolName: 'edit', toolArgs: { path: '.github/agents/factory.agent.md', old_str: 'a', new_str: 'b' } });
  assert.equal(json(protectedEdit).permissionDecision, 'ask');
  assert.match(json(protectedEdit).permissionDecisionReason, /protected/);
});

test('negative: [AC-10] a malformed hook payload fails closed with exit 2', async (t) => {
  const ws = await installWorkspace(t);
  const run = ws.hook('preToolUse', undefined);
  assert.notEqual(run.status, 0);
});

// AC-11: an engagement term is missing -> measured proposal, never an arbitrary default
test('positive: [AC-11] a missing sizing bar becomes a measured, owner-facing proposal', async (t) => {
  const dir = await tempDir(t);
  const rows = [90, 240, 120].map((m, i) => `S${i},2026-10-01T00:00:00Z,${new Date(Date.UTC(2026, 9, 1) + m * 60_000).toISOString()},CRUD`);
  await writeFile(join(dir, 's.csv'), `id,start,end,class\n${rows.join('\n')}\n`);
  const ws = await installWorkspace(t);
  const run = ws.tool('baseline-calc.mjs', ['--input', join(dir, 's.csv'), '--statistic', 'median', '--unit', 'minutes', '--sample', '3', '--seed', '7']);
  assert.equal(json(run).value, 120);
  assert.match(json(run).authority, /Provisional until the human owner confirms or replaces it/);
});

test('negative: [AC-11] with no samples the tool reports no-data and invents nothing', async (t) => {
  const dir = await tempDir(t);
  await writeFile(join(dir, 's.csv'), 'id,start,end,class\n');
  const ws = await installWorkspace(t);
  const run = ws.tool('baseline-calc.mjs', ['--input', join(dir, 's.csv'), '--statistic', 'median', '--unit', 'minutes']);
  assert.equal(json(run).status, 'no-data');
  assert.equal(json(run).value, undefined);
});

test('negative: [AC-11] the supervisor refuses to run on a retry bound or deadline that has no source', async (t) => {
  const config = resume(['-e', '0']);
  delete config.retry.source;
  delete config.deadline.status;
  const ws = await installWorkspace(t, { supervisor: config });
  await stall(ws);
  const run = ws.tool('supervisor.mjs', ['tick', '--execute']);
  assert.equal(run.status, 3);
  assert.equal(json(run).status, 'invalid-config');
});

test('negative: [AC-11] the liveness check will not judge a halt without a deadline', async (t) => {
  const ws = await installWorkspace(t);
  const run = ws.tool('liveness-check.mjs', ['--board', ws.docs('kanban.md'), '--progress', ws.docs('progress.jsonl')]);
  assert.equal(run.status, 3);
  assert.equal(json(run).status, 'no-deadline');
});

// AC-12: the designated writer is unavailable or exclusive ownership cannot be established
test('negative: [AC-12] a held lock yields a queued proposal and no mutation, not an exception', async (t) => {
  const ws = await installWorkspace(t);
  await writeFile(`${ws.docs('queue.jsonl')}.lock`, JSON.stringify({ pid: process.pid, host: os.hostname(), owner: 'other writer' }));
  const run = ws.tool('approval-queue.mjs', ['enqueue', '--queue', ws.docs('queue.jsonl'), '--requester', 'Kanban', '--tool', 'edit', '--target', 'x', '--params', '{}', '--purpose', 'p', '--card', 'C-1']);
  assert.equal(run.status, 1);
  assert.equal(json(run).reason, 'locked');
  await assert.rejects(readFile(ws.docs('queue.jsonl'), 'utf8'), { code: 'ENOENT' });
});

test('positive: [AC-12] once the lock is released the same request is recorded', async (t) => {
  const ws = await installWorkspace(t);
  const run = ws.tool('approval-queue.mjs', ['enqueue', '--queue', ws.docs('queue.jsonl'), '--requester', 'Kanban', '--tool', 'edit', '--target', 'x', '--params', '{}', '--purpose', 'p', '--card', 'C-1']);
  assert.equal(run.status, 0);
  assert.equal(json(run).id, 'AQ-1');
});

// AC-13: a required runtime capability is missing
async function settingsFor(ws, settings) {
  const path = join(ws.root, 'settings.json');
  await writeFile(path, JSON.stringify(settings));
  return path;
}

test('positive: [AC-13] with every capability present the preflight reports no degradation', async (t) => {
  const ws = await installWorkspace(t, { supervisor: resume(['-e', '0']) });
  const settings = await settingsFor(ws, { 'chat.subagents.allowInvocationsFromSubagents': true });
  const run = ws.tool('capability-preflight.mjs', ['--root', ws.root, '--settings', settings, '--records-dir', ws.docs('')]);
  assert.deepEqual(json(run).degraded, []);
});

test('negative: [AC-13] missing nested delegation and supervisor are reported with the owner decision before work depends on them', async (t) => {
  const ws = await installWorkspace(t);
  const settings = await settingsFor(ws, { 'chat.subagents.allowInvocationsFromSubagents': false });
  const run = ws.tool('capability-preflight.mjs', ['--root', ws.root, '--settings', settings, '--strict']);
  const report = json(run);
  assert.equal(run.status, 1);
  assert.ok(report.degraded.includes('nested-delegation'));
  assert.ok(report.degraded.includes('supervisor'));
  assert.match(report.capabilities.find((entry) => entry.capability === 'nested-delegation').ownerDecision, /Decide whether/);
});

test('negative: [AC-13] the preflight never edits settings or hooks while reporting', async (t) => {
  const ws = await installWorkspace(t);
  const settings = await settingsFor(ws, { 'chat.subagents.allowInvocationsFromSubagents': false });
  ws.tool('capability-preflight.mjs', ['--root', ws.root, '--settings', settings]);
  assert.equal(JSON.parse(await readFile(settings, 'utf8'))['chat.subagents.allowInvocationsFromSubagents'], false);
});

// AC-14: an idle or lapsed role with no recorded approval
test('negative: [AC-14] a lapsed Factory with no approval is logged as an unapproved halt and is never relabeled approved', async (t) => {
  const ws = await installWorkspace(t);
  await stall(ws);
  const run = ws.tool('liveness-check.mjs', ['--board', ws.docs('kanban.md'), '--progress', ws.docs('progress.jsonl'), '--deadline-ms', '1000', '--deadline-status', 'provisional']);
  assert.equal(run.status, 1);
  assert.equal(json(run).incident.trigger, 'unapproved halt (suspected)');
  assert.equal(json(run).incident.approvalStatus, 'none found');
  assert.match(json(run).incident.nextAction, /resumes the affected work/);
});

test('positive: [AC-14] after progress resumes the same check is healthy', async (t) => {
  const ws = await installWorkspace(t);
  await writeFile(ws.docs('progress.jsonl'), `${JSON.stringify({ ts: new Date().toISOString() })}\n`);
  const run = ws.tool('liveness-check.mjs', ['--board', ws.docs('kanban.md'), '--progress', ws.docs('progress.jsonl'), '--deadline-ms', '86400000', '--deadline-status', 'confirmed']);
  assert.equal(run.status, 0);
  assert.equal(json(run).status, 'ok');
});
