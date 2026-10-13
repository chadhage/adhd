import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { evaluateStop, formatStopResponse, pendingDecisions } from '../stop-gate.mjs';
import { emptyBoard, headingBoard, human, installWorkspace, repoRoot, runNode, tempDir, toolPath } from './helpers.mjs';

async function files(t, { board = headingBoard } = {}) {
  const dir = await tempDir(t);
  const paths = { board: join(dir, 'kanban.md'), approvalsPath: join(dir, 'approvals.jsonl'), queuePath: join(dir, 'queue.jsonl'), dir };
  await writeFile(paths.board, board);
  return { ...paths, args: { boardPaths: [paths.board], approvalsPath: paths.approvalsPath, queuePath: paths.queuePath } };
}
const request = (id) => JSON.stringify({ type: 'request', id });

// ---- policy ----

test('positive: no configured board means the gate is inert', () => {
  assert.equal(evaluateStop({ boardPaths: [] }).decision, 'allow');
  assert.equal(evaluateStop({ boardPaths: ['does-not-exist.md'] }).decision, 'allow');
});

test('positive: a valid human Factory-shutdown approval lets the turn end', async (t) => {
  const f = await files(t);
  await writeFile(f.approvalsPath, `${human('factory-shutdown-approval')}\n`);
  const result = evaluateStop(f.args);
  assert.equal(result.decision, 'allow');
  assert.match(result.reason, /Chad/);
});

test('positive: a pending human decision lets the turn end so the agent can yield', async (t) => {
  const f = await files(t);
  await writeFile(f.queuePath, `${request('AQ-1')}\n`);
  const result = evaluateStop(f.args);
  assert.equal(result.decision, 'allow');
  assert.match(result.reason, /AQ-1/);
});

test('positive: a forced retry is released and reported as a suspected unapproved halt', async (t) => {
  const f = await files(t);
  for (const event of [{ stop_hook_active: true }, { stopHookActive: true }]) {
    const result = evaluateStop({ ...f.args, event });
    assert.equal(result.decision, 'allow');
    assert.equal(result.incident.trigger, 'unapproved halt (suspected)');
  }
});

test('positive: pendingDecisions lists only requests without a decision', () => {
  assert.deepEqual(pendingDecisions(`${request('AQ-1')}\n${request('AQ-2')}\n${JSON.stringify({ type: 'decision', id: 'AQ-1', decision: 'approved' })}\n`), ['AQ-2']);
});

test('positive: an allow result prints an empty object and a block prints decision and reason', () => {
  assert.deepEqual(formatStopResponse({ decision: 'allow' }), {});
  assert.deepEqual(formatStopResponse({ decision: 'block', reason: 'why' }), { decision: 'block', reason: 'why' });
});

test('negative: unfinished work with no approval and no pending decision is blocked once', async (t) => {
  const f = await files(t);
  const result = evaluateStop(f.args);
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /To Do=2, In Progress=1/);
  assert.match(result.reason, /pre-stop test/);
});

test('negative: an empty board is not a shutdown approval', async (t) => {
  const f = await files(t, { board: emptyBoard });
  assert.equal(evaluateStop(f.args).decision, 'block');
});

test('negative: an agent-authored or scoped approval does not count as a Factory shutdown', async (t) => {
  const f = await files(t);
  await writeFile(f.approvalsPath, `${human('factory-shutdown-approval', { approverKind: 'agent' })}\n${human('stoppage-approval')}\n`);
  assert.equal(evaluateStop(f.args).decision, 'block');
});

test('negative: a resolved decision no longer lets the agent yield', async (t) => {
  const f = await files(t);
  await writeFile(f.queuePath, `${request('AQ-1')}\n${JSON.stringify({ type: 'decision', id: 'AQ-1', decision: 'denied' })}\n`);
  assert.deepEqual(pendingDecisions(`${request('AQ-1')}\n${JSON.stringify({ type: 'decision', id: 'AQ-1', decision: 'denied' })}\n`), []);
  assert.equal(evaluateStop(f.args).decision, 'block');
});

test('negative: an unparseable board is reported as unverified, not as empty', async (t) => {
  const f = await files(t, { board: 'unparseable' });
  const result = evaluateStop(f.args);
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /could not be parsed/);
});

test('negative: counts add up across several configured boards', async (t) => {
  const f = await files(t);
  const second = join(f.dir, 'second.md');
  await writeFile(second, headingBoard);
  assert.match(evaluateStop({ ...f.args, boardPaths: [f.board, second] }).reason, /To Do=4, In Progress=2/);
});

// ---- process ----

const camel = (cwd, extra = {}) => ({ sessionId: 's', timestamp: 1, cwd, transcriptPath: 't', stopReason: 'end_turn', stop_hook_active: false, ...extra });
const vscode = (cwd, extra = {}) => ({ hook_event_name: 'Stop', session_id: 's', timestamp: '2026-10-13T00:00:00Z', cwd, transcript_path: 't', stop_reason: 'end_turn', stop_hook_active: false, ...extra });

for (const [shape, payload] of [['camelCase', camel], ['VS Code', vscode]]) {
  test(`positive: the ${shape} agentStop payload is accepted and a released retry is reported on stderr`, async (t) => {
    const f = await files(t);
    const run = (extra) => runNode(toolPath('stop-gate.mjs'), ['--board', f.board, '--approvals', f.approvalsPath, '--queue', f.queuePath], { input: JSON.stringify(payload(f.dir, extra)) });
    const released = run({ stop_hook_active: true });
    assert.deepEqual(JSON.parse(released.stdout), {});
    assert.match(released.stderr, /unapproved halt/);
  });

  test(`negative: the ${shape} agentStop payload is blocked with a non-empty reason`, async (t) => {
    const f = await files(t);
    const blocked = runNode(toolPath('stop-gate.mjs'), ['--board', f.board], { input: JSON.stringify(payload(f.dir)) });
    assert.equal(blocked.status, 0, blocked.stderr);
    const output = JSON.parse(blocked.stdout);
    assert.equal(output.decision, 'block');
    assert.ok(output.reason.length > 0);
  });
}

test('positive: with the default config and no board the process is inert', () => {
  assert.deepEqual(JSON.parse(runNode(toolPath('stop-gate.mjs'), [], { input: JSON.stringify(camel(repoRoot)) }).stdout), {});
});

test('positive: an empty stdin is treated as an empty event', async (t) => {
  const f = await files(t);
  assert.equal(JSON.parse(runNode(toolPath('stop-gate.mjs'), ['--board', f.board], { input: '' }).stdout).decision, 'block');
});

test('negative: invalid JSON on stdin exits 2 and never blocks', () => {
  const run = runNode(toolPath('stop-gate.mjs'), [], { input: '{ not json' });
  assert.equal(run.status, 2);
  assert.equal(run.stdout.includes('block'), false);
});

test('negative: an unreadable config makes the gate inert instead of crashing', async (t) => {
  const dir = await tempDir(t);
  const run = runNode(toolPath('stop-gate.mjs'), ['--config', join(dir, 'missing.json')], { input: '{}' });
  assert.equal(run.status, 0);
  assert.deepEqual(JSON.parse(run.stdout), {});
});

test('negative: the shipped workspace config blocks until a board is configured, then blocks only unapproved stops', async (t) => {
  const ws = await installWorkspace(t);
  const blocked = ws.stop(camel(ws.root));
  assert.equal(JSON.parse(blocked.stdout).decision, 'block');
  await writeFile(ws.docs('approvals.jsonl'), `${human('factory-shutdown-approval')}\n`);
  assert.deepEqual(JSON.parse(ws.stop(camel(ws.root)).stdout), {});
});
