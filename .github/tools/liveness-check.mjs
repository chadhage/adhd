import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { findApprovals, parseJsonLines, stoppageTypes } from './lib/approvals.mjs';
import { parseBoard } from './lib/board.mjs';

/**
 * Read-only halt detector. It never restarts, resumes, or edits anything; it only
 * reports a suspected unapproved halt (unfinished work, no recorded approval, no
 * progress within the supplied deadline). The deadline is required: it is an
 * operating value that must be measured (baseline-calc.mjs) or owner-approved.
 */
export function checkLiveness({ boardText, progressText = '', approvalsText = '', deadlineMs, deadlineStatus, now = Date.now() }) {
  const board = parseBoard(boardText);
  if (!board.parsed) {
    return { status: 'unverifiable', exit: 3, reason: 'Board has no To Do / In Progress buckets; unfinished work cannot be counted.' };
  }
  if (board.todo + board.inProgress === 0) {
    return { status: 'ok', exit: 0, board, reason: 'No unfinished work. Queue exhaustion still needs consensus and invoker approval before any shutdown.' };
  }
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) {
    return { status: 'no-deadline', exit: 3, board, reason: 'No deadline supplied. Run baseline-calc.mjs and propose one to the owner; until then, check at the next handoff or cycle checkpoint.' };
  }
  if (!['provisional', 'confirmed'].includes(deadlineStatus)) {
    return { status: 'no-deadline', exit: 3, board, reason: 'deadlineStatus must be provisional or confirmed.' };
  }

  const approvals = findApprovals(parseJsonLines(approvalsText).entries, stoppageTypes);
  if (approvals.length) {
    return { status: 'ok', exit: 0, board, reason: `Stoppage approved by ${approvals.at(-1).approver}; verify scope and resume guidance.`, approval: approvals.at(-1) };
  }

  const stamps = parseJsonLines(progressText)
    .entries.map((entry) => Date.parse(entry.ts))
    .filter(Number.isFinite);
  if (!stamps.length) {
    return { status: 'no-progress-record', exit: 3, board, reason: 'No dated progress entries. Start recording observed progress at each transition or gate.' };
  }

  const lastProgress = Math.max(...stamps);
  const elapsedMs = now - lastProgress;
  if (elapsedMs <= deadlineMs) {
    return { status: 'ok', exit: 0, board, elapsedMs, deadlineMs, deadlineStatus, lastProgress: new Date(lastProgress).toISOString() };
  }
  return {
    status: 'halt-suspected',
    exit: 1,
    board,
    elapsedMs,
    deadlineMs,
    deadlineStatus,
    lastProgress: new Date(lastProgress).toISOString(),
    authority: 'Detection only; a provisional deadline grants no authority.',
    incident: {
      trigger: 'unapproved halt (suspected)',
      evidence: `Unfinished work (To Do=${board.todo}, In Progress=${board.inProgress}), no valid approval found, ${elapsedMs}ms since last progress against a ${deadlineStatus} deadline of ${deadlineMs}ms.`,
      requester: 'liveness-check',
      approvalStatus: 'none found',
      nextAction: 'Factory convenes the recovery panel and resumes the affected work; resumption needs no approval.',
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({
      options: {
        board: { type: 'string' },
        progress: { type: 'string' },
        approvals: { type: 'string' },
        'deadline-ms': { type: 'string' },
        'deadline-status': { type: 'string' },
      },
    });
    if (!values.board) throw new Error('--board is required');
    const readIfPresent = (path) => (path && existsSync(resolve(path)) ? readFileSync(resolve(path), 'utf8') : '');
    const result = checkLiveness({
      boardText: readFileSync(resolve(values.board), 'utf8'),
      progressText: readIfPresent(values.progress),
      approvalsText: readIfPresent(values.approvals),
      deadlineMs: values['deadline-ms'] === undefined ? undefined : Number(values['deadline-ms']),
      deadlineStatus: values['deadline-status'],
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.exit;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
