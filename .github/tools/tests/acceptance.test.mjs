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
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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

for (const [scenario, workerCount, forceContention] of [
  ['synchronized independent supervisor processes cannot launch twice from a one-restart budget', 2, false],
  ['post-spawn state contention cannot erase a real launch or permit a duplicate', 1, true],
]) {
  test(`negative: [AC-5] ${scenario}`, { timeout: 30_000 }, async (t) => {
    const dir = await tempDir(t);
    const release = join(dir, 'release');
    const ws = await installWorkspace(t, { supervisor: resume(['-e', holdUntilReleased, release], { deadlineMs: 600_000 }) });
    await stall(ws);
    const script = `
      import { spawn } from 'node:child_process';
      import { renameSync, writeFileSync } from 'node:fs';
      import { hostname } from 'node:os';
      import { pathToFileURL } from 'node:url';
      const { tick } = await import(pathToFileURL(process.argv[2]));
      const launches = [];
      process.once('message', async () => {
        try {
          console.log(JSON.stringify(await tick({ execute: true, spawnFn: (...args) => {
            const child = spawn(...args);
            try {
              launches.push(child.pid ?? null);
              writeFileSync(process.argv[3] + '.tmp', JSON.stringify(launches));
              renameSync(process.argv[3] + '.tmp', process.argv[3]);
              if (process.argv[4] === 'hold-state-lock') {
                writeFileSync(process.argv[5], JSON.stringify({ pid: process.pid, host: hostname() }), { flag: 'wx' });
              }
            } catch (error) {
              child.kill();
              throw error;
            }
            return child;
          }})));
        }
        catch (error) { console.error(error.stack); process.exitCode = 2; }
        finally { process.disconnect(); }
      });
      process.send('ready');
    `;
    const worker = join(dir, 'supervisor-worker.mjs');
    await writeFile(worker, script);
    const runners = Array.from({ length: workerCount }, (_, index) => {
      const tracePath = join(dir, `spawn-${index}.json`);
      const child = spawn(process.execPath, [worker, join(ws.root, '.github', 'tools', 'supervisor.mjs'), tracePath,
        forceContention ? 'hold-state-lock' : 'normal', ws.docs('state.json.lock')], {
        cwd: ws.root,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      const ready = new Promise((resolve, reject) => {
        child.once('message', resolve);
        child.once('error', reject);
        child.once('exit', () => reject(new Error('Supervisor exited before its start barrier.')));
      });
      const completed = new Promise((resolve) => {
        child.once('error', (error) => resolve({ error: error.message, stdout, stderr }));
        child.once('close', (code) => {
          try { resolve({ code, result: JSON.parse(stdout), stderr }); }
          catch (error) { resolve({ code, error: error.message, stdout, stderr }); }
        });
      });
      return { child, ready, completed, tracePath };
    });
    const observedLaunches = () => runners.flatMap(({ tracePath }) =>
      existsSync(tracePath) ? JSON.parse(readFileSync(tracePath, 'utf8')) : []);
    const pids = new Set();
    let resumedPid;
    try {
      await Promise.all(runners.map((runner) => runner.ready));
      for (const runner of runners) runner.child.send('start');
      const results = await Promise.all(runners.map((runner) => runner.completed));
      for (const pid of observedLaunches()) if (Number.isInteger(pid) && pid > 0) pids.add(pid);
      for (const result of results) {
        assert.equal(result.error, undefined, JSON.stringify(results));
        assert.equal(result.code, 0, JSON.stringify(results));
        assert.equal(result.stderr, '', JSON.stringify(results));
      }
      const launches = observedLaunches();
      const diagnostic = JSON.stringify({ results, observedLaunches: launches });
      assert.equal(launches.length, 1, diagnostic);
      resumedPid = launches[0];
      assert.ok(Number.isInteger(resumedPid) && resumedPid > 0, diagnostic);
      for (const { result } of results) {
        assert.ok(['restarted', 'state-reservation-failed', 'state-recovery-required', 'child-running']
          .includes(result.operationStatus ?? result.status), diagnostic);
      }
      const original = await readFile(ws.docs('state.json'), 'utf8');
      const state = JSON.parse(original);
      assert.equal(state.restarts.length, 1);
      if (forceContention) assert.equal(state.restarts[0].phase, 'reserved', diagnostic);
      if (state.restarts[0].phase === 'reserved') {
        assert.equal(state.childPid, null);
        assert.equal(state.restarts[0].pid, null);
        assert.ok(results.some(({ result }) => (result.operationStatus ?? result.status) === 'state-recovery-required'
          && result.attempt?.pid === resumedPid), diagnostic);
        const next = ws.tool('supervisor.mjs', ['tick', '--execute']);
        const result = json(next);
        if (result.attempt?.pid) pids.add(result.attempt.pid);
        assert.equal(result.status, 'state-recovery-required');
        assert.equal(next.status, 3);
        assert.equal(await readFile(ws.docs('state.json'), 'utf8'), original);
      } else {
        assert.equal(state.restarts[0].phase, 'started');
        assert.equal(state.restarts[0].pid, resumedPid);
        assert.equal(state.childPid, resumedPid);
      }
      assert.equal(alive(resumedPid), true);
    } finally {
      for (const runner of runners) if (runner.child.exitCode === null) runner.child.kill();
      for (const pid of observedLaunches()) if (Number.isInteger(pid) && pid > 0) pids.add(pid);
      await writeFile(release, 'done');
      for (const pid of pids) {
        await waitForExit(pid);
        if (alive(pid)) process.kill(pid);
      }
    }
  });
}

for (const point of ['before-spawn', 'after-spawn']) {
  test(`negative: [AC-5] a supervisor process exiting ${point} leaves a reservation that cannot be blindly replayed`, { timeout: 30_000 }, async (t) => {
    const dir = await tempDir(t);
    const release = join(dir, 'release');
    const marker = join(dir, 'observed-child');
    const config = resume(['-e', holdUntilReleased, release], { deadlineMs: 600_000 });
    config.retry.maxRestarts = 2;
    const ws = await installWorkspace(t, { supervisor: config });
    await stall(ws);
    const script = `
      import { spawn } from 'node:child_process';
      import { writeFileSync } from 'node:fs';
      import { pathToFileURL } from 'node:url';
      const { tick } = await import(pathToFileURL(process.argv[2]));
      await tick({ execute: true, spawnFn: (...args) => {
        if (process.argv[3] === 'after-spawn') {
          const child = spawn(...args);
          child.unref();
          writeFileSync(process.argv[4], String(child.pid));
        }
        process.exit(77);
      }});
    `;
    const worker = join(dir, 'interrupted-supervisor.mjs');
    await writeFile(worker, script);
    const pids = new Set();
    try {
      const interrupted = spawnSync(process.execPath, [
        worker,
        join(ws.root, '.github', 'tools', 'supervisor.mjs'), point, marker,
      ], { cwd: ws.root, encoding: 'utf8', timeout: 15_000 });
      if (point === 'after-spawn') pids.add(Number(await readFile(marker, 'utf8')));
      assert.equal(interrupted.status, 77, interrupted.stdout + interrupted.stderr);
      const original = await readFile(ws.docs('state.json'), 'utf8');
      assert.equal(JSON.parse(original).restarts[0].phase, 'reserved');
      const resumed = ws.tool('supervisor.mjs', ['tick', '--execute']);
      const result = json(resumed);
      if (result.attempt?.pid) pids.add(result.attempt.pid);
      assert.equal(result.status, 'state-recovery-required');
      assert.equal(resumed.status, 3);
      assert.equal(await readFile(ws.docs('state.json'), 'utf8'), original);
      for (const pid of pids) assert.equal(alive(pid), true);
    } finally {
      await writeFile(release, 'done');
      for (const pid of pids) {
        await waitForExit(pid);
        if (alive(pid)) process.kill(pid);
      }
    }
  });
}

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
const queueBlocked = (ws, event) => ws.tool('approval-queue.mjs', [
  'enqueue', '--queue', ws.docs('queue.jsonl'), '--requester', 'Fullstacker',
  '--tool', event.toolName, '--target', 'synthetic-shell',
  '--params', JSON.stringify(event.toolArgs), '--purpose', 'Synthetic host approval pending', '--card', 'CARD-1',
]);

test('negative: [AC-10] a non-read hook cannot pre-approve a call or force an extra prompt', async (t) => {
  const ws = await installWorkspace(t);
  const run = ws.hook('preToolUse', { toolName: 'powershell', toolArgs: { command: 'npm test' } });
  assert.deepEqual(json(run), {});
});

test('negative: [AC-10] unattended mode does not deny or queue a call before the host permission decision', async (t) => {
  const ws = await installWorkspace(t, { unattended: true });
  const run = ws.hook('preToolUse', { toolName: 'powershell', toolArgs: { command: 'npm test', token: 'sk-secretsecretsecret1' } });
  assert.deepEqual(json(run), {});
  await assert.rejects(readFile(ws.docs('queue.jsonl'), 'utf8'), { code: 'ENOENT' });
});

test('negative: [AC-10] an explicitly queued host-blocked action does not retain credentials', async (t) => {
  const ws = await installWorkspace(t, { unattended: true });
  const run = queueBlocked(ws, { toolName: 'powershell', toolArgs: { command: 'npm test', token: 'sk-secretsecretsecret1' } });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(json(run).id, 'AQ-1');
  const queued = await readFile(ws.docs('queue.jsonl'), 'utf8');
  assert.match(queued, /npm test/);
  assert.equal(queued.includes('secretsecret'), false);
});

test('positive: [AC-10] a pending human decision lets the agent yield instead of being forced to continue', async (t) => {
  const ws = await installWorkspace(t, { unattended: true });
  assert.equal(queueBlocked(ws, { toolName: 'powershell', toolArgs: { command: 'npm test' } }).status, 0);
  assert.deepEqual(json(ws.stop(stopEvent(ws.root))), {});
});

test('negative: [AC-10] a human-denied action is not retried without changed evidence', async (t) => {
  const ws = await installWorkspace(t, { unattended: true });
  const event = { toolName: 'powershell', toolArgs: { command: 'npm test' } };
  assert.equal(queueBlocked(ws, event).status, 0);
  const denied = ws.tool('approval-queue.mjs', ['resolve', '--queue', ws.docs('queue.jsonl'), '--id', 'AQ-1', '--decision', 'denied', '--approver', 'Chad', '--source', 'chat']);
  assert.equal(denied.status, 0, denied.stderr);
  const retry = queueBlocked(ws, event);
  assert.equal(retry.status, 1);
  assert.equal(json(retry).reason, 'denied-without-changed-evidence');
});

test('negative: [AC-10] a configured board edit and a shell command both leave host approval intact', async (t) => {
  const ws = await installWorkspace(t);
  const edit = ws.hook('preToolUse', { toolName: 'edit', toolArgs: { path: ws.docs('kanban.md'), old_str: '### CARD-1 First', new_str: '### CARD-1 First (refined)' } });
  assert.deepEqual(json(edit), {});
  assert.deepEqual(json(ws.hook('preToolUse', { toolName: 'powershell', toolArgs: { command: 'x' } })), {});
});

test('negative: [AC-10] board content and protected paths cannot manufacture a tool approval', async (t) => {
  const ws = await installWorkspace(t);
  const done = ws.hook('preToolUse', { toolName: 'edit', toolArgs: { path: ws.docs('kanban.md'), old_str: '## In Progress', new_str: '## Done\n\n## In Progress' } });
  assert.deepEqual(json(done), {});
  const protectedEdit = ws.hook('preToolUse', { toolName: 'edit', toolArgs: { path: '.github/agents/factory.agent.md', old_str: 'a', new_str: 'b' } });
  assert.deepEqual(json(protectedEdit), {});
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
