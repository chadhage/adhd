import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { enqueue, listRequests, redact, resolveRequest } from '../approval-queue.mjs';
import { applyIfRevision, readWithRevision } from '../revision-lock.mjs';

async function tempDir(t) {
  const dir = await mkdtemp(join(os.tmpdir(), 'adhd-tools-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

const request = (overrides = {}) => ({
  requester: 'Kanban',
  tool: 'edit',
  target: '.docs/kanban.md',
  params: { op: 'move', card: 'CARD-1' },
  purpose: 'Move CARD-1 to In Progress',
  cardId: 'CARD-1',
  ...overrides,
});

test('applyIfRevision writes only when the base revision matches', async (t) => {
  const file = join(await tempDir(t), 'board.md');
  await writeFile(file, 'one\n');
  const base = await readWithRevision(file);

  const first = await applyIfRevision(file, base.revision, 'two\n', { owner: 'writer-a' });
  assert.equal(first.ok, true);
  assert.equal(await readFile(file, 'utf8'), 'two\n');

  const stale = await applyIfRevision(file, base.revision, 'three\n', { owner: 'writer-b' });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'revision-mismatch');
  assert.equal(stale.proposal.content, 'three\n');
  assert.equal(await readFile(file, 'utf8'), 'two\n');
});

test('a live lock returns the proposal instead of mutating, and a dead local holder is reclaimed', async (t) => {
  const file = join(await tempDir(t), 'board.md');
  await writeFile(file, 'one\n');
  const base = await readWithRevision(file);

  await writeFile(`${file}.lock`, JSON.stringify({ pid: process.pid, host: os.hostname(), owner: 'other' }));
  const blocked = await applyIfRevision(file, base.revision, 'two\n');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'locked');
  assert.equal(blocked.proposal.baseRevision, base.revision);
  assert.equal(await readFile(file, 'utf8'), 'one\n');

  await writeFile(`${file}.lock`, JSON.stringify({ pid: 2 ** 22 + 12345, host: os.hostname(), owner: 'crashed' }));
  const reclaimed = await applyIfRevision(file, base.revision, 'two\n');
  assert.equal(reclaimed.ok, true);
});

test('a lock held on another host is never reclaimed automatically', async (t) => {
  const file = join(await tempDir(t), 'board.md');
  await writeFile(file, 'one\n');
  const base = await readWithRevision(file);
  await writeFile(`${file}.lock`, JSON.stringify({ pid: 1, host: 'some-other-host', owner: 'remote' }));
  const result = await applyIfRevision(file, base.revision, 'two\n');
  assert.equal(result.reason, 'locked');
});

test('concurrent writers cannot both apply against the same base revision', async (t) => {
  const file = join(await tempDir(t), 'board.md');
  await writeFile(file, 'base\n');
  const base = await readWithRevision(file);
  const results = await Promise.all(
    ['a', 'b', 'c', 'd'].map((name) => applyIfRevision(file, base.revision, `${name}\n`, { owner: name })),
  );
  assert.equal(results.filter((result) => result.ok).length, 1);
});

test('redact hides secret-looking keys and values but keeps ordinary parameters', () => {
  const result = redact({ command: 'ls', apiKey: 'abc', nested: { Authorization: 'Bearer x' }, note: 'ghp_abcdefghijkl' });
  assert.equal(result.command, 'ls');
  assert.equal(result.apiKey, '[REDACTED]');
  assert.equal(result.nested.Authorization, '[REDACTED]');
  assert.equal(result.note, '[REDACTED]');
});

test('enqueue requires every field and is idempotent for a pending identical request', async (t) => {
  const queue = join(await tempDir(t), 'queue.jsonl');
  await assert.rejects(enqueue(queue, request({ cardId: '' })), /cardId/);

  const first = await enqueue(queue, request());
  const second = await enqueue(queue, request());
  assert.equal(first.id, 'AQ-1');
  assert.equal(second.id, 'AQ-1');
  assert.equal(second.duplicate, true);
  assert.equal((await listRequests(queue)).requests.length, 1);
});

test('a denied action cannot be re-requested without changed evidence', async (t) => {
  const queue = join(await tempDir(t), 'queue.jsonl');
  const { id } = await enqueue(queue, request());
  await resolveRequest(queue, id, { decision: 'denied', approver: 'Chad', source: 'chat 2026-10-13' });

  const retry = await enqueue(queue, request());
  assert.equal(retry.ok, false);
  assert.equal(retry.reason, 'denied-without-changed-evidence');

  const changed = await enqueue(queue, request({ changedEvidence: 'Test run shows the card is unblocked.' }));
  assert.equal(changed.ok, true);
  assert.notEqual(changed.id, id);
});

test('resolve needs a named approver and source, never re-resolves, and keeps history', async (t) => {
  const queue = join(await tempDir(t), 'queue.jsonl');
  const { id } = await enqueue(queue, request());
  await assert.rejects(resolveRequest(queue, id, { decision: 'approved', approver: '', source: 'chat' }), /required/);

  assert.equal((await resolveRequest(queue, id, { decision: 'approved', approver: 'Chad', source: 'chat' })).ok, true);
  const again = await resolveRequest(queue, id, { decision: 'denied', approver: 'Chad', source: 'chat' });
  assert.equal(again.reason, 'not-pending');

  const lines = (await readFile(queue, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal((await listRequests(queue)).requests[0].status, 'approved');
});
