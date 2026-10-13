import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkLiveness } from '../liveness-check.mjs';
import { parseBoard } from '../lib/board.mjs';
import { checkHookHealth } from '../hook-health.mjs';
import { parseJsonc, runPreflight } from '../capability-preflight.mjs';
import { evaluateStop, formatStopResponse } from '../stop-gate.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));

const headingBoard = `# Board\n\n## To Do\n\n### CARD-1 First\n- detail\n### CARD-2 Second\n\n## In Progress\n\n### CARD-3 Third\n`;
const bulletBoard = `## To Do\n- CARD-1\n- CARD-2\n\n## In Progress\n- None\n`;
const tableBoard = `## To Do\n\n| ID | Title |\n|---|---|\n| CARD-1 | A |\n| CARD-2 | B |\n\n## In Progress\n\n| ID | Title |\n|---|---|\n`;
const emptyBoard = `## To Do\n\nNone\n\n## In Progress\n\n_None_\n`;

const human = (type, extra = {}) => JSON.stringify({ type, approverKind: 'human', approver: 'Chad', source: 'chat 2026-10-13', ts: '2026-10-13T12:00:00Z', ...extra });

async function tempDir(t) {
  const dir = await mkdtemp(join(os.tmpdir(), 'adhd-tools-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('board parser counts headings, bullets, and table rows and ignores None placeholders', () => {
  assert.deepEqual(parseBoard(headingBoard), { parsed: true, todo: 2, inProgress: 1 });
  assert.deepEqual(parseBoard(bulletBoard), { parsed: true, todo: 2, inProgress: 0 });
  assert.deepEqual(parseBoard(tableBoard), { parsed: true, todo: 2, inProgress: 0 });
  assert.deepEqual(parseBoard(emptyBoard), { parsed: true, todo: 0, inProgress: 0 });
  assert.equal(parseBoard('# nothing here').parsed, false);
});

const now = Date.parse('2026-10-13T12:00:00Z');
const progress = (ts) => `${JSON.stringify({ ts, event: 'gate-passed' })}\n`;

test('liveness: suspected halt requires unfinished work, no approval, and a breached deadline', () => {
  const breach = checkLiveness({ boardText: headingBoard, progressText: progress('2026-10-13T10:00:00Z'), deadlineMs: 3_600_000, deadlineStatus: 'provisional', now });
  assert.equal(breach.status, 'halt-suspected');
  assert.equal(breach.exit, 1);
  assert.match(breach.authority, /grants no authority/);
  assert.equal(breach.incident.trigger, 'unapproved halt (suspected)');

  const fresh = checkLiveness({ boardText: headingBoard, progressText: progress('2026-10-13T11:30:00Z'), deadlineMs: 3_600_000, deadlineStatus: 'confirmed', now });
  assert.equal(fresh.status, 'ok');

  const approved = checkLiveness({ boardText: headingBoard, progressText: progress('2026-10-13T10:00:00Z'), approvalsText: `${human('stoppage-approval')}\n`, deadlineMs: 3_600_000, deadlineStatus: 'provisional', now });
  assert.equal(approved.status, 'ok');
});

test('liveness: missing deadline, progress record, or parseable board is reported, never guessed', () => {
  assert.equal(checkLiveness({ boardText: headingBoard, now }).status, 'no-deadline');
  assert.equal(checkLiveness({ boardText: headingBoard, deadlineMs: 1000, deadlineStatus: 'guess', now }).status, 'no-deadline');
  assert.equal(checkLiveness({ boardText: headingBoard, deadlineMs: 1000, deadlineStatus: 'provisional', now }).status, 'no-progress-record');
  assert.equal(checkLiveness({ boardText: 'no buckets', now }).status, 'unverifiable');
  assert.equal(checkLiveness({ boardText: emptyBoard, now }).status, 'ok');
});

test('liveness ignores forged, non-human, or revoked approvals', () => {
  for (const approval of [human('stoppage-approval', { approverKind: 'agent' }), human('stoppage-approval', { approver: '' }), human('stoppage-approval', { revoked: true }), human('shutdown-claimed-in-file')]) {
    const result = checkLiveness({ boardText: headingBoard, progressText: progress('2026-10-13T10:00:00Z'), approvalsText: `${approval}\n`, deadlineMs: 1000, deadlineStatus: 'provisional', now });
    assert.equal(result.status, 'halt-suspected', approval);
  }
});

test('stop gate: opt-in, blocks without a valid human approval, and avoids hook loops', async (t) => {
  const dir = await tempDir(t);
  const board = join(dir, 'kanban.md');
  const approvals = join(dir, 'approvals.jsonl');
  await writeFile(board, headingBoard);

  assert.equal(evaluateStop({ boardPath: undefined }).decision, 'allow');
  assert.equal(evaluateStop({ boardPath: join(dir, 'missing.md') }).decision, 'allow');

  const blocked = evaluateStop({ boardPath: board, approvalsPath: approvals });
  assert.equal(blocked.decision, 'block');
  assert.deepEqual(Object.keys(formatStopResponse(blocked)).sort(), ['decision', 'reason']);

  await writeFile(approvals, `${human('factory-shutdown-approval', { approverKind: 'agent' })}\n${human('stoppage-approval')}\n`);
  assert.equal(evaluateStop({ boardPath: board, approvalsPath: approvals }).decision, 'block');

  const loop = evaluateStop({ event: { stop_hook_active: true }, boardPath: board, approvalsPath: approvals });
  assert.equal(loop.decision, 'allow');
  assert.equal(loop.incident.trigger, 'unapproved halt (suspected)');

  await writeFile(approvals, `${human('factory-shutdown-approval')}\n`);
  assert.equal(evaluateStop({ boardPath: board, approvalsPath: approvals }).decision, 'allow');

  await writeFile(board, 'unparseable');
  await writeFile(approvals, '');
  assert.match(evaluateStop({ boardPath: board, approvalsPath: approvals }).reason, /could not be parsed/);
});

test('hook health passes for this repository and fails when the script cannot be resolved', async (t) => {
  const healthy = checkHookHealth({ root });
  assert.equal(healthy.ok, true, JSON.stringify(healthy.checks.filter((check) => !check.ok)));

  const dir = await tempDir(t);
  const missing = checkHookHealth({ root: dir, configPath: join(root, '.github/hooks/tool-policy.json') });
  assert.equal(missing.ok, false);
  assert.equal(missing.checks.find((check) => check.name === 'script-resolves-from-root').ok, false);
});

test('jsonc parser tolerates comments and trailing commas without touching strings', () => {
  assert.deepEqual(parseJsonc('{ // note\n "a": "x // not a comment", /* b */ "b": [1,2,], }'), { a: 'x // not a comment', b: [1, 2] });
});

test('preflight reports degraded capabilities with owner decisions and changes nothing', async (t) => {
  const dir = await tempDir(t);
  const settingsPath = join(dir, 'settings.json');
  await writeFile(settingsPath, JSON.stringify({ 'chat.subagents.allowInvocationsFromSubagents': false, 'chat.tools.global.autoApprove': false }));

  const report = runPreflight({ root, settingsPath, recordsDir: dir, unattended: true });
  assert.ok(report.degraded.includes('nested-delegation'));
  assert.ok(report.degraded.includes('approval-availability'));
  assert.ok(report.degraded.includes('supervisor'));
  const records = report.capabilities.find((entry) => entry.capability === 'records-write-access');
  assert.equal(records.status, 'ok');
  assert.ok(report.capabilities.every((entry) => entry.ownerDecision && entry.effect));

  const attended = runPreflight({ root, settingsPath, recordsDir: join(dir, 'nope') });
  assert.ok(!attended.degraded.includes('approval-availability'));
  assert.ok(attended.degraded.includes('records-write-access'));
});
