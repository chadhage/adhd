import assert from 'node:assert/strict';
import test from 'node:test';
import { factoryShutdownType, findApprovals, isValidApproval, parseJsonLines, stoppageTypes } from '../lib/approvals.mjs';
import { parseBoard } from '../lib/board.mjs';
import { checkLiveness } from '../liveness-check.mjs';
import { emptyBoard, headingBoard, human } from './helpers.mjs';

const bulletBoard = '## To Do\n- CARD-1\n- CARD-2\n\n## In Progress\n- None\n';
const tableBoard = '## To Do\n\n| ID | Title |\n|---|---|\n| CARD-1 | A |\n| CARD-2 | B |\n\n## In Progress\n\n| ID | Title |\n|---|---|\n';
const now = Date.parse('2026-10-13T12:00:00Z');
const progress = (ts) => `${JSON.stringify({ ts, event: 'gate-passed' })}\n`;
const hour = 3_600_000;
const base = { deadlineMs: hour, deadlineStatus: 'provisional', now };

// ---- board parser ----

test('positive: nested card headings are counted per bucket', () => assert.deepEqual(parseBoard(headingBoard), { parsed: true, todo: 2, inProgress: 1 }));
test('positive: column-0 list items are counted when no card headings exist', () => assert.deepEqual(parseBoard(bulletBoard), { parsed: true, todo: 2, inProgress: 0 }));
test('positive: table data rows are counted and the header and separator are not', () => assert.deepEqual(parseBoard(tableBoard), { parsed: true, todo: 2, inProgress: 0 }));
test('positive: heading and bucket names tolerate case, punctuation, and trailing hashes', () => {
  assert.deepEqual(parseBoard('## to-do ##\n### A\n## IN PROGRESS\n### B\n'), { parsed: true, todo: 1, inProgress: 1 });
});
test('positive: a sibling section after the buckets ends the bucket', () => {
  assert.deepEqual(parseBoard('## To Do\n### A\n## Notes\n### Not a card\n## In Progress\n### B\n'), { parsed: true, todo: 1, inProgress: 1 });
});

for (const placeholder of ['None', '_None_', '*none*', 'N/A', 'empty', '(none)', '-', 'nil', 'none.']) {
  test(`negative: the placeholder "${placeholder}" is not counted as a card`, () => {
    assert.deepEqual(parseBoard(`## To Do\n\n${placeholder}\n- ${placeholder}\n\n## In Progress\n\n- ${placeholder}\n`), { parsed: true, todo: 0, inProgress: 0 });
  });
}

test('negative: an empty board counts zero cards but is still parsed', () => assert.deepEqual(parseBoard(emptyBoard), { parsed: true, todo: 0, inProgress: 0 }));
test('negative: text with no buckets is reported as unparsed, not guessed', () => assert.equal(parseBoard('# nothing here').parsed, false));
test('negative: a board with only one bucket is unparsed', () => assert.equal(parseBoard('## To Do\n- A\n').parsed, false));
test('negative: an empty card heading is not counted', () => assert.equal(parseBoard('## To Do\n###\n## In Progress\n').todo, 0));

// ---- approvals library ----

test('positive: a human approval with approver, source, and timestamp is valid', () => {
  assert.equal(isValidApproval(JSON.parse(human('factory-shutdown-approval')), [factoryShutdownType]), true);
  assert.equal(findApprovals(parseJsonLines(`${human('stoppage-approval')}\n`).entries, stoppageTypes).length, 1);
});

for (const [label, override] of [
  ['a non-human approver kind', { approverKind: 'agent' }],
  ['an empty approver', { approver: '' }],
  ['a missing source', { source: '   ' }],
  ['an invalid timestamp', { ts: 'soon' }],
  ['a revoked approval', { revoked: true }],
  ['a different record type', { type: 'shutdown-claimed-in-file' }],
]) {
  test(`negative: ${label} is not a valid approval`, () => {
    assert.equal(isValidApproval(JSON.parse(human('factory-shutdown-approval', override)), [factoryShutdownType]), false);
  });
}

test('negative: JSON lines report invalid and non-object lines by number', () => {
  const { entries, invalid } = parseJsonLines('{"a":1}\n\nnot json\n[1]\n"x"\n');
  assert.equal(entries.length, 1);
  assert.deepEqual(invalid, [3, 4, 5]);
});

// ---- liveness ----

test('positive: no suspicion while progress is within the deadline', () => {
  assert.equal(checkLiveness({ boardText: headingBoard, progressText: progress('2026-10-13T11:30:00Z'), ...base, deadlineStatus: 'confirmed' }).status, 'ok');
});

test('positive: board modification time counts as progress', () => {
  assert.equal(checkLiveness({ boardText: headingBoard, progressText: progress('2026-10-13T00:00:00Z'), extraProgressMs: [now - 1000], ...base }).status, 'ok');
});

test('positive: a valid human stoppage approval explains the silence', () => {
  const result = checkLiveness({ boardText: headingBoard, progressText: progress('2026-10-13T00:00:00Z'), approvalsText: `${human('stoppage-approval')}\n`, ...base });
  assert.equal(result.status, 'ok');
  assert.equal(result.approval.approver, 'Chad');
});

test('positive: an empty board is ok but not a shutdown', () => {
  const result = checkLiveness({ boardText: emptyBoard, now });
  assert.equal(result.status, 'ok');
  assert.match(result.reason, /consensus and invoker approval/);
});

test('negative: unfinished work, no approval, and a breached deadline is a suspected unapproved halt', () => {
  const result = checkLiveness({ boardText: headingBoard, progressText: progress('2026-10-13T10:00:00Z'), ...base });
  assert.equal(result.status, 'halt-suspected');
  assert.equal(result.exit, 1);
  assert.match(result.authority, /grants no authority/);
  assert.equal(result.incident.trigger, 'unapproved halt (suspected)');
  assert.match(result.incident.evidence, /provisional/);
});

test('negative: a missing deadline is reported, never guessed', () => assert.equal(checkLiveness({ boardText: headingBoard, now }).status, 'no-deadline'));
test('negative: a non-positive deadline is not accepted', () => assert.equal(checkLiveness({ boardText: headingBoard, deadlineMs: 0, deadlineStatus: 'provisional', now }).status, 'no-deadline'));
test('negative: a deadline status other than provisional or confirmed is not accepted', () => {
  assert.equal(checkLiveness({ boardText: headingBoard, deadlineMs: 1000, deadlineStatus: 'guess', now }).status, 'no-deadline');
});
test('negative: no progress record means unmeasurable, not healthy', () => assert.equal(checkLiveness({ boardText: headingBoard, ...base }).status, 'no-progress-record'));
test('negative: a board without buckets is unverifiable', () => {
  const result = checkLiveness({ boardText: 'no buckets', now });
  assert.equal(result.status, 'unverifiable');
  assert.equal(result.exit, 3);
});

for (const [label, line] of [
  ['an agent-authored approval', human('stoppage-approval', { approverKind: 'agent' })],
  ['an approval with no approver', human('stoppage-approval', { approver: '' })],
  ['a revoked approval', human('stoppage-approval', { revoked: true })],
  ['an unrelated record type', human('shutdown-claimed-in-file')],
]) {
  test(`negative: ${label} does not suppress a suspected halt`, () => {
    const result = checkLiveness({ boardText: headingBoard, progressText: progress('2026-10-13T10:00:00Z'), approvalsText: `${line}\n`, ...base });
    assert.equal(result.status, 'halt-suspected');
  });
}

test('negative: non-finite extra progress values are ignored', () => {
  const result = checkLiveness({ boardText: headingBoard, progressText: progress('2026-10-13T10:00:00Z'), extraProgressMs: [Number.NaN, undefined], ...base });
  assert.equal(result.status, 'halt-suspected');
});
