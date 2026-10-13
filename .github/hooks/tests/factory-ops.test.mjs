import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadFactoryOps, validateBoardContent } from '../factory-ops.mjs';
import { applyUnattendedPolicy, evaluatePreToolUse } from '../pre-tool-policy.mjs';

const board = '# Board\n\n## To Do\n\n### CARD-1 First\n\n## In Progress\n\n### CARD-2 Second\n';

async function workspace(t, config = {}, boardText = board) {
  const root = await mkdtemp(join(os.tmpdir(), 'adhd-ops-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, '.docs'), { recursive: true });
  await writeFile(join(root, '.docs', 'kanban.md'), boardText);
  await writeFile(join(root, '.docs', 'other.md'), 'x');
  const configPath = join(root, 'factory-ops.json');
  await writeFile(
    configPath,
    JSON.stringify({ version: 1, boardPaths: ['.docs/kanban.md'], approvalsPath: '.docs/approvals.jsonl', approvalQueuePath: '.docs/queue.jsonl', ...config }),
  );
  return { root, ops: loadFactoryOps({ root, configPath }), boardFile: join(root, '.docs', 'kanban.md') };
}

const edit = (path, oldStr, newStr) => ({ tool_name: 'edit', tool_input: { path, old_str: oldStr, new_str: newStr } });

test('a structurally valid edit of an allowlisted board is allowed without a prompt', async (t) => {
  const { ops, boardFile } = await workspace(t);
  const result = evaluatePreToolUse(edit(boardFile, '### CARD-1 First', '### CARD-1 First (refined)'), ops);
  assert.equal(result.decision, 'allow');
  assert.match(result.reason, /allowlisted/);
});

test('allowlisted board access is exact: other files, other tools, and traversal still ask', async (t) => {
  const { root, ops, boardFile } = await workspace(t);
  assert.equal(evaluatePreToolUse(edit(join(root, '.docs', 'other.md'), 'x', 'y'), ops).decision, 'ask');
  assert.equal(evaluatePreToolUse(edit(join(root, '.docs', '..', '.github', 'agents', 'factory.agent.md'), 'a', 'b'), ops).decision, 'ask');
  assert.equal(evaluatePreToolUse({ tool_name: 'powershell', tool_input: { command: `Remove-Item ${boardFile}` } }, ops).decision, 'ask');
  assert.equal(evaluatePreToolUse({ tool_name: 'edit', tool_input: { path: boardFile, filePath: join(root, '.docs', 'other.md'), old_str: 'a', new_str: 'b' } }, ops).decision, 'ask');
  assert.equal(evaluatePreToolUse(edit(boardFile, 'not present anywhere', 'z'), ops).decision, 'ask');
});

test('edits that break the two-bucket structure ask a human instead of being allowed', async (t) => {
  const { ops, boardFile } = await workspace(t);
  assert.equal(evaluatePreToolUse(edit(boardFile, '## In Progress', '## Underway'), ops).decision, 'ask');
  const archive = evaluatePreToolUse(edit(boardFile, '## In Progress', '## Done\n\n## In Progress'), ops);
  assert.equal(archive.decision, 'ask');
  assert.match(validateBoardContent('## To Do\n## In Progress\n## Archive\n'), /archive/);
  assert.equal(validateBoardContent(board), null);
});

test('create is allowed only for a new valid board; overwriting or invalid content asks', async (t) => {
  const { root, ops, boardFile } = await workspace(t);
  const overwrite = { tool_name: 'create', tool_input: { path: boardFile, file_text: board } };
  assert.equal(evaluatePreToolUse(overwrite, ops).decision, 'ask');

  await rm(boardFile);
  assert.equal(evaluatePreToolUse(overwrite, ops).decision, 'allow');
  assert.equal(evaluatePreToolUse({ tool_name: 'create', tool_input: { path: boardFile, file_text: '# no buckets' } }, ops).decision, 'ask');
  assert.equal(root.length > 0, true);
});

test('reads of the allowlisted board are allowed and other .docs reads still ask', async (t) => {
  const { root, ops, boardFile } = await workspace(t);
  assert.equal(evaluatePreToolUse({ tool_name: 'view', tool_input: { path: boardFile } }, ops).decision, 'allow');
  assert.equal(evaluatePreToolUse({ tool_name: 'view', tool_input: { path: join(root, '.docs', 'other.md') } }, ops).decision, 'ask');
});

test('a CRLF board accepts an LF multi-line edit', async (t) => {
  const { ops, boardFile } = await workspace(t, {}, board.replace(/\n/g, '\r\n'));
  const result = evaluatePreToolUse(edit(boardFile, '## To Do\n\n### CARD-1 First', '## To Do\n\n### CARD-1 First\n### CARD-3 Third'), ops);
  assert.equal(result.decision, 'allow');
});

test('unsafe allowlist entries are dropped with a reason and an empty config allows nothing', async (t) => {
  const { ops } = await workspace(t, {
    boardPaths: ['.docs/kanban.md', '../outside.md', '.github/agents/x.md', '.vscode/board.md', '.docs/notes.txt', '.docs/approvals.jsonl', '.docs/secrets.md', '.github/tools/board.md', '.github/hooks/board.md'],
  });
  assert.equal(ops.boardPaths.length, 1);
  assert.equal(ops.problems.length, 8, ops.problems.join('\n'));

  const none = loadFactoryOps({ root: os.tmpdir(), configPath: join(os.tmpdir(), 'does-not-exist-factory-ops.json') });
  assert.deepEqual(none.boardPaths, []);
  assert.equal(none.unattended, false);
  assert.ok(none.problems.length >= 1);
});

test('malformed config fails to the most restrictive state without throwing', async (t) => {
  const { root } = await workspace(t);
  const bad = join(root, 'bad.json');
  await writeFile(bad, '{ not json');
  const ops = loadFactoryOps({ root, configPath: bad });
  assert.deepEqual(ops.boardPaths, []);
  assert.equal(ops.unattended, false);
  assert.equal(evaluatePreToolUse({ tool_name: 'edit', tool_input: { path: join(root, '.docs', 'kanban.md'), old_str: 'a', new_str: 'b' } }, ops).decision, 'ask');
});

test('hook-executed tooling is a protected path that requires human review', () => {
  for (const path of ['.github/tools/stop-gate.mjs', '.github/tools/supervisor.mjs', '.github/hooks/factory-ops.json']) {
    const result = evaluatePreToolUse({ tool_name: 'edit', tool_input: { path } }, loadFactoryOps());
    assert.equal(result.decision, 'ask', path);
    assert.match(result.reason, /protected/i, path);
  }
});

test('unattended: ask becomes an explicit deny and the exact action is queued without secrets or payload echo', async (t) => {
  const { root, ops } = await workspace(t, { unattended: true });
  const event = { tool_name: 'powershell', tool_input: { command: 'npm test', apiKey: 'sk-supersecretvalue1234' } };
  const asked = evaluatePreToolUse(event, ops);
  assert.equal(asked.decision, 'ask');

  const result = await applyUnattendedPolicy(event, asked, ops);
  assert.equal(result.decision, 'deny');
  assert.match(result.reason, /AQ-1/);
  assert.equal(result.reason.includes('npm test'), false);

  const queued = await readFile(join(root, '.docs', 'queue.jsonl'), 'utf8');
  assert.match(queued, /npm test/);
  assert.equal(queued.includes('supersecret'), false);

  const again = await applyUnattendedPolicy(event, asked, ops);
  assert.match(again.reason, /AQ-1/);
});

test('unattended policy never widens: allow stays allow, attended ask stays ask, and no queue still denies', async (t) => {
  const attended = await workspace(t);
  const askEvent = { tool_name: 'powershell', tool_input: { command: 'x' } };
  const asked = evaluatePreToolUse(askEvent, attended.ops);
  assert.equal((await applyUnattendedPolicy(askEvent, asked, attended.ops)).decision, 'ask');

  const unattended = await workspace(t, { unattended: true, approvalQueuePath: null });
  assert.equal((await applyUnattendedPolicy({ tool_name: 'read', tool_input: {} }, { decision: 'allow' }, unattended.ops)).decision, 'allow');
  const noQueue = await applyUnattendedPolicy(askEvent, asked, unattended.ops);
  assert.equal(noQueue.decision, 'deny');
  assert.match(noQueue.reason, /no approval queue/);
});
