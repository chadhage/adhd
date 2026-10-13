import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadFactoryOps, validateBoardContent } from '../factory-ops.mjs';
import { applyUnattendedPolicy, evaluatePreToolUse, formatHookResponse, handleHookInput } from '../pre-tool-policy.mjs';
import { tempDir } from '../../tools/tests/helpers.mjs';

const board = '# Board\n\n## To Do\n\n### CARD-1 First\n\n## In Progress\n\n### CARD-2 Second\n';

async function workspace(t, config = {}, boardText = board) {
  const root = await tempDir(t, 'adhd-ops-');
  await mkdir(join(root, '.docs'), { recursive: true });
  await writeFile(join(root, '.docs', 'kanban.md'), boardText);
  await writeFile(join(root, '.docs', 'other.md'), 'x');
  const configPath = join(root, 'factory-ops.json');
  await writeFile(configPath, JSON.stringify({ version: 1, boardPaths: ['.docs/kanban.md'], approvalsPath: '.docs/approvals.jsonl', approvalQueuePath: '.docs/queue.jsonl', ...config }));
  return { root, configPath, ops: loadFactoryOps({ root, configPath }), boardFile: join(root, '.docs', 'kanban.md') };
}

const edit = (path, oldStr, newStr) => ({ tool_name: 'edit', tool_input: { path, old_str: oldStr, new_str: newStr } });
const decide = (event, ops) => evaluatePreToolUse(event, ops).decision;

// ---- scoped board writes: allowed ----

test('positive: a structurally valid edit of an allowlisted board is allowed without a prompt', async (t) => {
  const { ops, boardFile } = await workspace(t);
  const result = evaluatePreToolUse(edit(boardFile, '### CARD-1 First', '### CARD-1 First (refined)'), ops);
  assert.equal(result.decision, 'allow');
  assert.match(result.reason, /allowlisted/);
});

test('positive: the VS Code field names filePath, oldString, and newString are understood', async (t) => {
  const { ops, boardFile } = await workspace(t);
  assert.equal(decide({ tool_name: 'edit', tool_input: { filePath: boardFile, oldString: 'First', newString: 'Refined' } }, ops), 'allow');
});

test('positive: reads of the allowlisted board are allowed', async (t) => {
  const { ops, boardFile } = await workspace(t);
  assert.equal(decide({ tool_name: 'view', tool_input: { path: boardFile } }, ops), 'allow');
});

test('positive: creating a new valid board is allowed', async (t) => {
  const { ops, boardFile } = await workspace(t);
  await rm(boardFile);
  assert.equal(decide({ tool_name: 'create', tool_input: { path: boardFile, file_text: board } }, ops), 'allow');
});

test('positive: a CRLF board accepts an LF multi-line edit', async (t) => {
  const { ops, boardFile } = await workspace(t, {}, board.replace(/\n/g, '\r\n'));
  assert.equal(decide(edit(boardFile, '## To Do\n\n### CARD-1 First', '## To Do\n\n### CARD-1 First\n### CARD-3 Third'), ops), 'allow');
});

test('positive: validateBoardContent accepts a two-bucket board', () => assert.equal(validateBoardContent(board), null));

test('positive: a valid config yields canonical board paths and no problems', async (t) => {
  const { ops } = await workspace(t);
  assert.equal(ops.boardPaths.length, 1);
  assert.deepEqual(ops.problems, []);
  assert.equal(ops.unattended, false);
});

test('positive: relative approvals, queue, and progress paths resolve against the workspace root', async (t) => {
  const { ops, root } = await workspace(t, { progressPath: '.docs/progress.jsonl' });
  assert.equal(ops.approvalsPath, join(root, '.docs', 'approvals.jsonl'));
  assert.equal(ops.approvalQueuePath, join(root, '.docs', 'queue.jsonl'));
  assert.equal(ops.progressPath, join(root, '.docs', 'progress.jsonl'));
});

// ---- scoped board writes: still asks ----

test('negative: other files in the same directory still ask', async (t) => {
  const { root, ops } = await workspace(t);
  assert.equal(decide(edit(join(root, '.docs', 'other.md'), 'x', 'y'), ops), 'ask');
});

test('negative: path traversal out of the allowlisted directory still asks', async (t) => {
  const { root, ops } = await workspace(t);
  assert.equal(decide(edit(join(root, '.docs', '..', '.github', 'agents', 'factory.agent.md'), 'a', 'b'), ops), 'ask');
});

test('negative: a shell command that mentions the board still asks', async (t) => {
  const { ops, boardFile } = await workspace(t);
  assert.equal(decide({ tool_name: 'powershell', tool_input: { command: `Remove-Item ${boardFile}` } }, ops), 'ask');
});

test('negative: two different path fields in one call still ask', async (t) => {
  const { root, ops, boardFile } = await workspace(t);
  assert.equal(decide({ tool_name: 'edit', tool_input: { path: boardFile, filePath: join(root, '.docs', 'other.md'), old_str: 'a', new_str: 'b' } }, ops), 'ask');
});

test('negative: a call with no path at all still asks', async (t) => {
  const { ops } = await workspace(t);
  assert.equal(decide({ tool_name: 'edit', tool_input: { old_str: 'a', new_str: 'b' } }, ops), 'ask');
  assert.equal(decide({ tool_name: 'edit' }, ops), 'ask');
});

test('negative: an edit whose old text is absent still asks', async (t) => {
  const { ops, boardFile } = await workspace(t);
  assert.equal(decide(edit(boardFile, 'not present anywhere', 'z'), ops), 'ask');
});

test('negative: an edit whose old text is ambiguous still asks', async (t) => {
  const { ops, boardFile } = await workspace(t, {}, '## To Do\n### A\n### A\n## In Progress\n');
  assert.equal(decide(edit(boardFile, '### A', '### B'), ops), 'ask');
});

for (const [label, input] of [
  ['an empty old text', { old_str: '', new_str: 'x' }],
  ['a missing new text', { old_str: 'First' }],
  ['a non-string new text', { old_str: 'First', new_str: 5 }],
]) {
  test(`negative: an edit with ${label} still asks`, async (t) => {
    const { ops, boardFile } = await workspace(t);
    assert.equal(decide({ tool_name: 'edit', tool_input: { path: boardFile, ...input } }, ops), 'ask');
  });
}

test('negative: editing a board that does not exist still asks', async (t) => {
  const { ops, boardFile } = await workspace(t);
  await rm(boardFile);
  assert.equal(decide(edit(boardFile, 'a', 'b'), ops), 'ask');
});

test('negative: renaming a bucket would lose the board structure and asks', async (t) => {
  const { ops, boardFile } = await workspace(t);
  assert.equal(decide(edit(boardFile, '## In Progress', '## Underway'), ops), 'ask');
});

for (const name of ['Done', 'Completed', 'Archive', 'Archived', 'Finished', 'Closed']) {
  test(`negative: adding a "${name}" bucket asks because the board has only two buckets`, async (t) => {
    const { ops, boardFile } = await workspace(t);
    assert.equal(decide(edit(boardFile, '## In Progress', `## ${name}\n\n## In Progress`), ops), 'ask');
    assert.match(validateBoardContent(`## To Do\n## In Progress\n## ${name}\n`), /completed\/archive/);
  });
}

test('negative: a board missing a bucket fails validation', () => {
  assert.match(validateBoardContent('## To Do\n'), /lose its To Do or In Progress/);
});

test('negative: create over an existing board still asks', async (t) => {
  const { ops, boardFile } = await workspace(t);
  assert.equal(decide({ tool_name: 'create', tool_input: { path: boardFile, file_text: board } }, ops), 'ask');
});

test('negative: create with invalid or missing content still asks', async (t) => {
  const { ops, boardFile } = await workspace(t);
  await rm(boardFile);
  assert.equal(decide({ tool_name: 'create', tool_input: { path: boardFile, file_text: '# no buckets' } }, ops), 'ask');
  assert.equal(decide({ tool_name: 'create', tool_input: { path: boardFile } }, ops), 'ask');
});

test('negative: tools other than edit and create never get a scoped write', async (t) => {
  const { ops, boardFile } = await workspace(t);
  assert.equal(decide({ tool_name: 'delete', tool_input: { path: boardFile } }, ops), 'ask');
});

test('negative: reads of other .docs files still ask', async (t) => {
  const { root, ops } = await workspace(t);
  assert.equal(decide({ tool_name: 'view', tool_input: { path: join(root, '.docs', 'other.md') } }, ops), 'ask');
});

test('negative: an empty allowlist allows nothing', async (t) => {
  const { ops, boardFile } = await workspace(t, { boardPaths: [] });
  assert.equal(decide(edit(boardFile, 'First', 'Refined'), ops), 'ask');
});

// ---- allowlist validation ----

for (const [label, entry] of [
  ['a path that escapes the workspace', '../outside.md'],
  ['an agent definition path', '.github/agents/x.md'],
  ['a skill path', '.github/skills/x.md'],
  ['a hook path', '.github/hooks/board.md'],
  ['a tools path', '.github/tools/board.md'],
  ['a .vscode path', '.vscode/board.md'],
  ['a non-markdown file', '.docs/notes.txt'],
  ['the approvals file', '.docs/approvals.jsonl'],
  ['a secrets file name', '.docs/secrets.md'],
  ['the workspace root itself', '.'],
  ['an empty string', '  '],
  ['a non-string entry', 5],
]) {
  test(`negative: an allowlist entry for ${label} is dropped with a reason`, async (t) => {
    const { ops } = await workspace(t, { boardPaths: [entry] });
    assert.deepEqual(ops.boardPaths, []);
    assert.equal(ops.problems.length, 1, ops.problems.join('; '));
  });
}

test('negative: the queue and progress files cannot be allowlisted as boards', async (t) => {
  const { ops } = await workspace(t, { boardPaths: ['.docs/queue.jsonl.md', '.docs/progress.md'], approvalQueuePath: '.docs/queue.jsonl.md', progressPath: '.docs/progress.md' });
  assert.deepEqual(ops.boardPaths, []);
  assert.equal(ops.problems.length, 2);
});

// ---- config loading ----

test('negative: a missing config yields the most restrictive state with a problem', () => {
  const ops = loadFactoryOps({ root: os.tmpdir(), configPath: join(os.tmpdir(), 'no-such-factory-ops.json') });
  assert.deepEqual(ops.boardPaths, []);
  assert.equal(ops.unattended, false);
  assert.ok(ops.problems.length >= 1);
});

for (const [label, content] of [['malformed JSON', '{ not json'], ['a wrong version', '{"version":2}'], ['a null document', 'null']]) {
  test(`negative: ${label} falls back to asking without throwing`, async (t) => {
    const { root } = await workspace(t);
    const bad = join(root, 'bad.json');
    await writeFile(bad, content);
    const ops = loadFactoryOps({ root, configPath: bad });
    assert.deepEqual(ops.boardPaths, []);
    assert.equal(decide(edit(join(root, '.docs', 'kanban.md'), 'a', 'b'), ops), 'ask');
  });
}

test('negative: non-string optional paths are reported and ignored', async (t) => {
  const { ops } = await workspace(t, { approvalsPath: 7, approvalQueuePath: '', progressPath: {} });
  assert.equal(ops.approvalsPath, null);
  assert.equal(ops.problems.length, 3);
});

test('negative: a non-array boardPaths or non-object supervisor is ignored', async (t) => {
  const { ops } = await workspace(t, { boardPaths: 'x', supervisor: 'nope' });
  assert.deepEqual(ops.boardPaths, []);
  assert.equal(ops.supervisor, null);
});

test('negative: only an explicit true enables unattended mode', async (t) => {
  assert.equal((await workspace(t, { unattended: 'yes' })).ops.unattended, false);
  assert.equal((await workspace(t, { unattended: true })).ops.unattended, true);
});

// ---- protected tooling ----

for (const path of ['.github/tools/stop-gate.mjs', '.github/tools/supervisor.mjs', '.github/hooks/factory-ops.json', '.github/agents/factory.agent.md', '.vscode/settings.json']) {
  test(`negative: an edit of ${path} is a protected path that requires human review`, () => {
    const result = evaluatePreToolUse({ tool_name: 'edit', tool_input: { path } }, loadFactoryOps());
    assert.equal(result.decision, 'ask');
    assert.match(result.reason, /protected/i);
  });
}

// ---- unattended policy ----

test('negative: unattended turns an ask into a deny and queues the exact action without secrets or payload echo', async (t) => {
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
});

test('negative: the same blocked action is not queued twice', async (t) => {
  const { root, ops } = await workspace(t, { unattended: true });
  const event = { tool_name: 'powershell', tool_input: { command: 'npm test' } };
  const asked = evaluatePreToolUse(event, ops);
  await applyUnattendedPolicy(event, asked, ops);
  assert.match((await applyUnattendedPolicy(event, asked, ops)).reason, /AQ-1/);
  assert.equal((await readFile(join(root, '.docs', 'queue.jsonl'), 'utf8')).trim().split('\n').length, 1);
});

test('negative: an action a human already denied is not re-queued without changed evidence', async (t) => {
  const { root, ops } = await workspace(t, { unattended: true });
  const event = { tool_name: 'powershell', tool_input: { command: 'npm test' } };
  const asked = evaluatePreToolUse(event, ops);
  await applyUnattendedPolicy(event, asked, ops);
  const { resolveRequest } = await import('../../tools/approval-queue.mjs');
  await resolveRequest(join(root, '.docs', 'queue.jsonl'), 'AQ-1', { decision: 'denied', approver: 'Chad', source: 'chat' });
  assert.match((await applyUnattendedPolicy(event, asked, ops)).reason, /already denied/);
});

test('negative: with no queue configured an unattended ask is still denied', async (t) => {
  const { ops } = await workspace(t, { unattended: true, approvalQueuePath: null });
  const event = { tool_name: 'powershell', tool_input: { command: 'x' } };
  const result = await applyUnattendedPolicy(event, evaluatePreToolUse(event, ops), ops);
  assert.equal(result.decision, 'deny');
  assert.match(result.reason, /no approval queue/);
});

test('negative: if the queue is locked the action is still denied, never allowed', async (t) => {
  const { root, ops } = await workspace(t, { unattended: true });
  await writeFile(join(root, '.docs', 'queue.jsonl.lock'), JSON.stringify({ pid: process.pid, host: os.hostname() }));
  const event = { tool_name: 'powershell', tool_input: { command: 'x' } };
  const result = await applyUnattendedPolicy(event, evaluatePreToolUse(event, ops), ops);
  assert.equal(result.decision, 'deny');
  assert.match(result.reason, /could not be queued/);
});

test('negative: a non-object tool input is still queued and denied', async (t) => {
  const { ops } = await workspace(t, { unattended: true });
  const event = { tool_name: 'powershell', tool_input: 'just a string' };
  assert.equal((await applyUnattendedPolicy(event, { decision: 'ask' }, ops)).decision, 'deny');
});

test('positive: unattended policy never widens: allow stays allow and an attended ask stays ask', async (t) => {
  const attended = await workspace(t);
  const askEvent = { tool_name: 'powershell', tool_input: { command: 'x' } };
  assert.equal((await applyUnattendedPolicy(askEvent, evaluatePreToolUse(askEvent, attended.ops), attended.ops)).decision, 'ask');
  const unattended = await workspace(t, { unattended: true });
  assert.equal((await applyUnattendedPolicy({ tool_name: 'read', tool_input: {} }, { decision: 'allow' }, unattended.ops)).decision, 'allow');
});

// ---- stdin handler ----

test('positive: a read tool is allowed with exit 0', async () => {
  const result = await handleHookInput(JSON.stringify({ toolName: 'read', toolArgs: {} }), 'preToolUse', loadFactoryOps());
  assert.equal(result.exitCode, 0);
  assert.equal(JSON.parse(result.stdout).permissionDecision, 'allow');
});

test('positive: the VS Code payload shape receives hookSpecificOutput', async () => {
  const result = await handleHookInput(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'read' }), undefined, loadFactoryOps());
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'allow');
});

test('positive: post-tool and subagent events return context without a permission decision', async () => {
  const post = JSON.parse((await handleHookInput(JSON.stringify({ toolName: 'web_fetch' }), 'postToolUse', loadFactoryOps())).stdout);
  const sub = JSON.parse((await handleHookInput(JSON.stringify({ agentName: 'ProductOwner' }), 'subagentStart', loadFactoryOps())).stdout);
  assert.match(post.additionalContext, /untrusted data/);
  assert.match(sub.additionalContext, /revalidate/i);
  assert.equal(post.permissionDecision, undefined);
});

test('positive: formatHookResponse defaults to a pre-tool decision when no event is named', () => {
  assert.equal(formatHookResponse({ toolName: 'read' }, undefined, { decision: 'allow' }).permissionDecision, 'allow');
});

test('negative: oversized input exits 2 and prints no decision', async () => {
  const result = await handleHookInput(`{"toolName":"read","pad":"${'x'.repeat(1024 * 1024 + 10)}"}`, 'preToolUse', loadFactoryOps());
  assert.equal(result.exitCode, 2);
  assert.equal(result.stdout, undefined);
});

test('negative: invalid JSON exits 2 so the tool call is denied', async () => {
  const result = await handleHookInput('{ not json', 'preToolUse', loadFactoryOps());
  assert.equal(result.exitCode, 2);
  assert.match(result.stderr, /invalid/);
});

test('negative: a null document or a missing tool name is denied', async () => {
  for (const input of ['null', '{}', '{"toolName":"  "}', '{"toolName":7}']) {
    const result = await handleHookInput(input, 'preToolUse', loadFactoryOps());
    assert.equal(JSON.parse(result.stdout).permissionDecision, 'deny', input);
  }
});

test('negative: a non-read tool is asked about, never allowed, through the handler', async () => {
  const result = await handleHookInput(JSON.stringify({ toolName: 'powershell', toolArgs: { command: 'x' } }), 'preToolUse', loadFactoryOps());
  assert.equal(JSON.parse(result.stdout).permissionDecision, 'ask');
});

test('negative: sensitive read paths ask instead of being allowed', () => {
  for (const path of ['.env', 'config/secrets.json', 'keys/id.pem', '.docs/anything.md']) {
    assert.equal(decide({ tool_name: 'read', tool_input: { path } }, loadFactoryOps()), 'ask', path);
  }
});

test('negative: an unserializable tool input is treated as protected', () => {
  const circular = {};
  circular.self = circular;
  assert.equal(decide({ tool_name: 'edit', tool_input: circular }, loadFactoryOps()), 'ask');
});
