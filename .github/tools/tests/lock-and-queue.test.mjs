import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { digestOf, enqueue, listRequests, redact, resolveRequest } from '../approval-queue.mjs';
import { parseJsonLines } from '../lib/approvals.mjs';
import { applyIfRevision, readWithRevision, revisionOf } from '../revision-lock.mjs';
import { tempDir } from './helpers.mjs';

const request = (overrides = {}) => ({
  requester: 'Kanban',
  tool: 'edit',
  target: '.docs/kanban.md',
  params: { op: 'move', card: 'CARD-1' },
  purpose: 'Move CARD-1 to In Progress',
  cardId: 'CARD-1',
  ...overrides,
});
const deadPid = 2 ** 22 + 12345;
const queueIn = async (t) => join(await tempDir(t), 'queue.jsonl');

// ---- revision-checked writes ----

test('positive: applyIfRevision writes when the base revision matches', async (t) => {
  const file = join(await tempDir(t), 'board.md');
  await writeFile(file, 'one\n');
  const base = await readWithRevision(file);
  const result = await applyIfRevision(file, base.revision, 'two\n', { owner: 'writer-a' });
  assert.equal(result.ok, true);
  assert.equal(result.revision, revisionOf('two\n'));
  assert.equal(await readFile(file, 'utf8'), 'two\n');
});

test('positive: applyIfRevision creates a new file against the empty revision', async (t) => {
  const file = join(await tempDir(t), 'new.md');
  const base = await readWithRevision(file);
  assert.equal(base.exists, false);
  assert.equal(base.revision, revisionOf(''));
  assert.equal((await applyIfRevision(file, base.revision, 'created\n')).ok, true);
});

test('positive: a lock whose holder process died on this host is reclaimed', async (t) => {
  const file = join(await tempDir(t), 'board.md');
  await writeFile(file, 'one\n');
  const base = await readWithRevision(file);
  await writeFile(`${file}.lock`, JSON.stringify({ pid: deadPid, host: os.hostname(), owner: 'crashed' }));
  assert.equal((await applyIfRevision(file, base.revision, 'two\n')).ok, true);
});

test('negative: a stale base revision returns a mismatch with the proposal and leaves the file untouched', async (t) => {
  const file = join(await tempDir(t), 'board.md');
  await writeFile(file, 'one\n');
  const base = await readWithRevision(file);
  await applyIfRevision(file, base.revision, 'two\n');
  const stale = await applyIfRevision(file, base.revision, 'three\n', { owner: 'writer-b' });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'revision-mismatch');
  assert.equal(stale.proposal.content, 'three\n');
  assert.equal(await readFile(file, 'utf8'), 'two\n');
});

test('negative: a live lock returns the proposal instead of mutating', async (t) => {
  const file = join(await tempDir(t), 'board.md');
  await writeFile(file, 'one\n');
  const base = await readWithRevision(file);
  await writeFile(`${file}.lock`, JSON.stringify({ pid: process.pid, host: os.hostname(), owner: 'other' }));
  const blocked = await applyIfRevision(file, base.revision, 'two\n');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'locked');
  assert.equal(blocked.proposal.baseRevision, base.revision);
  assert.equal(await readFile(file, 'utf8'), 'one\n');
});

test('negative: a lock held on another host is never reclaimed automatically', async (t) => {
  const file = join(await tempDir(t), 'board.md');
  await writeFile(file, 'one\n');
  const base = await readWithRevision(file);
  await writeFile(`${file}.lock`, JSON.stringify({ pid: 1, host: 'some-other-host', owner: 'remote' }));
  assert.equal((await applyIfRevision(file, base.revision, 'two\n')).reason, 'locked');
});

test('negative: an unreadable lock file is treated as held, not reclaimed', async (t) => {
  const file = join(await tempDir(t), 'board.md');
  await writeFile(file, 'one\n');
  const base = await readWithRevision(file);
  await writeFile(`${file}.lock`, 'not json');
  const result = await applyIfRevision(file, base.revision, 'two\n');
  assert.equal(result.reason, 'locked');
  assert.equal(result.holder, null);
});

test('negative: concurrent writers cannot both apply against the same base revision', async (t) => {
  const file = join(await tempDir(t), 'board.md');
  await writeFile(file, 'base\n');
  const base = await readWithRevision(file);
  const results = await Promise.all(['a', 'b', 'c', 'd'].map((name) => applyIfRevision(file, base.revision, `${name}\n`, { owner: name })));
  assert.equal(results.filter((result) => result.ok).length, 1);
});

test('negative: reading a path that is not a file surfaces the error instead of pretending it is absent', async (t) => {
  await assert.rejects(readWithRevision(await tempDir(t)), (error) => error.code !== 'ENOENT');
});

test('negative: a failure other than a held lock is thrown, not swallowed', async (t) => {
  const missingParent = join(await tempDir(t), 'no-such-dir', 'board.md');
  await assert.rejects(applyIfRevision(missingParent, revisionOf(''), 'x'), (error) => error.code === 'ENOENT');
});

// ---- redaction and digests ----

test('positive: redact keeps ordinary parameters and nested structure', () => {
  assert.deepEqual(redact({ command: 'ls', list: [1, 'a'], nested: { n: 2 } }), { command: 'ls', list: [1, 'a'], nested: { n: 2 } });
  assert.equal(redact(7), 7);
  assert.equal(redact(null), null);
});

for (const [label, input] of [
  ['an apiKey key', { apiKey: 'abc' }],
  ['a nested Authorization key', { nested: { Authorization: 'Bearer x' } }],
  ['a password key', { password: 'p' }],
  ['a GitHub token value', { note: 'ghp_abcdefghijkl' }],
  ['an sk- style value', { note: 'sk-abcdefgh1234' }],
  ['a secret inside an array', { list: ['AKIAABCDEFGH1234'] }],
]) {
  test(`negative: redact hides ${label}`, () => {
    assert.match(JSON.stringify(redact(input)), /\[REDACTED\]/);
  });
}

test('positive: digests ignore key order but change with any parameter', () => {
  assert.equal(digestOf('edit', 'x', { a: 1, b: 2 }), digestOf('edit', 'x', { b: 2, a: 1 }));
  assert.notEqual(digestOf('edit', 'x', { a: 1 }), digestOf('edit', 'x', { a: 2 }));
  assert.notEqual(digestOf('edit', 'x', { a: 1 }), digestOf('edit', 'y', { a: 1 }));
});

// ---- approval queue ----

test('positive: enqueue records a request and returns a stable id', async (t) => {
  const queue = await queueIn(t);
  const first = await enqueue(queue, request());
  assert.deepEqual(first, { ok: true, id: 'AQ-1', duplicate: false });
  assert.equal((await listRequests(queue)).requests[0].status, 'pending');
});

test('positive: an identical pending request is idempotent', async (t) => {
  const queue = await queueIn(t);
  await enqueue(queue, request());
  const second = await enqueue(queue, request());
  assert.equal(second.id, 'AQ-1');
  assert.equal(second.duplicate, true);
  assert.equal((await listRequests(queue)).requests.length, 1);
});

test('positive: changed evidence lets a denied action be requested again', async (t) => {
  const queue = await queueIn(t);
  const { id } = await enqueue(queue, request());
  await resolveRequest(queue, id, { decision: 'denied', approver: 'Chad', source: 'chat' });
  const again = await enqueue(queue, request({ changedEvidence: 'Test run shows the card is unblocked.' }));
  assert.equal(again.ok, true);
  assert.notEqual(again.id, id);
});

test('positive: resolve records a human decision and keeps both lines of history', async (t) => {
  const queue = await queueIn(t);
  const { id } = await enqueue(queue, request());
  assert.deepEqual(await resolveRequest(queue, id, { decision: 'approved', approver: 'Chad', source: 'chat' }), { ok: true, id, decision: 'approved' });
  assert.equal((await readFile(queue, 'utf8')).trim().split('\n').length, 2);
  assert.equal((await listRequests(queue)).requests[0].status, 'approved');
});

test('positive: an appended line is separated from a file that lacks a trailing newline', async (t) => {
  const queue = await queueIn(t);
  await writeFile(queue, JSON.stringify({ type: 'request', id: 'AQ-9', digest: 'x', tool: 't', target: 'a', params: {}, purpose: 'p', cardId: 'c', requester: 'r' }));
  await enqueue(queue, request());
  const { entries, invalid } = parseJsonLines(await readFile(queue, 'utf8'));
  assert.equal(entries.length, 2);
  assert.deepEqual(invalid, []);
});

for (const field of ['requester', 'tool', 'target', 'purpose', 'cardId']) {
  test(`negative: enqueue rejects a missing ${field}`, async (t) => {
    await assert.rejects(enqueue(await queueIn(t), request({ [field]: '  ' })), new RegExp(field));
  });
}

test('negative: enqueue rejects missing params', async (t) => {
  await assert.rejects(enqueue(await queueIn(t), request({ params: undefined })), /params/);
});

test('negative: a denied action cannot be re-requested without changed evidence', async (t) => {
  const queue = await queueIn(t);
  const { id } = await enqueue(queue, request());
  await resolveRequest(queue, id, { decision: 'denied', approver: 'Chad', source: 'chat' });
  const retry = await enqueue(queue, request());
  assert.equal(retry.ok, false);
  assert.equal(retry.reason, 'denied-without-changed-evidence');
});

test('negative: secrets in params never reach the queue file', async (t) => {
  const queue = await queueIn(t);
  await enqueue(queue, request({ params: { command: 'x', token: 'supersecretvalue' } }));
  assert.equal((await readFile(queue, 'utf8')).includes('supersecretvalue'), false);
});

test('negative: enqueue returns locked, not an exception, when the queue is held', async (t) => {
  const queue = await queueIn(t);
  await writeFile(`${queue}.lock`, JSON.stringify({ pid: process.pid, host: os.hostname(), owner: 'other' }));
  const result = await enqueue(queue, request());
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'locked');
});

for (const [label, args] of [
  ['an empty approver', { decision: 'approved', approver: '', source: 'chat' }],
  ['an empty source', { decision: 'approved', approver: 'Chad', source: '' }],
]) {
  test(`negative: resolve rejects ${label}`, async (t) => {
    const queue = await queueIn(t);
    const { id } = await enqueue(queue, request());
    await assert.rejects(resolveRequest(queue, id, args), /required/);
  });
}

test('negative: resolve rejects a decision other than approved or denied', async (t) => {
  const queue = await queueIn(t);
  const { id } = await enqueue(queue, request());
  await assert.rejects(resolveRequest(queue, id, { decision: 'maybe', approver: 'Chad', source: 'chat' }), /approved or denied/);
});

test('negative: resolve refuses an unknown request id', async (t) => {
  assert.equal((await resolveRequest(await queueIn(t), 'AQ-99', { decision: 'approved', approver: 'Chad', source: 'chat' })).reason, 'unknown-request');
});

test('negative: resolve refuses a request that is already decided', async (t) => {
  const queue = await queueIn(t);
  const { id } = await enqueue(queue, request());
  await resolveRequest(queue, id, { decision: 'approved', approver: 'Chad', source: 'chat' });
  const again = await resolveRequest(queue, id, { decision: 'denied', approver: 'Chad', source: 'chat' });
  assert.equal(again.reason, 'not-pending');
  assert.equal(again.status, 'approved');
});

test('negative: resolve returns locked when the queue is held', async (t) => {
  const queue = await queueIn(t);
  const { id } = await enqueue(queue, request());
  await writeFile(`${queue}.lock`, JSON.stringify({ pid: process.pid, host: os.hostname(), owner: 'other' }));
  assert.equal((await resolveRequest(queue, id, { decision: 'approved', approver: 'Chad', source: 'chat' })).reason, 'locked');
});

test('negative: corrupt queue lines are reported, never silently dropped', async (t) => {
  const queue = await queueIn(t);
  await writeFile(queue, 'not json\n[1]\n');
  const { requests, invalidLines } = await listRequests(queue);
  assert.deepEqual(requests, []);
  assert.deepEqual(invalidLines, [1, 2]);
});

test('negative: a decision for an unknown request is ignored when folding the queue', async (t) => {
  const queue = await queueIn(t);
  await writeFile(queue, `${JSON.stringify({ type: 'decision', id: 'AQ-7', decision: 'approved' })}\n`);
  assert.deepEqual((await listRequests(queue)).requests, []);
});
