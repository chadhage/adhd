import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadFactoryOps, scopedBoardDecision, validateBoardContent } from '../factory-ops.mjs';
import { applyUnattendedPolicy, evaluatePreToolUse, formatHookResponse, handleHookInput } from '../pre-tool-policy.mjs';
import { repoRoot, runNode, tempDir } from '../../tools/tests/helpers.mjs';

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
const boardDecision = (event, ops) =>
  scopedBoardDecision(event.tool_name, event.tool_input ?? {}, ops, event.tool_name === 'view' ? 'read' : 'write');
const decide = (event, ops) => boardDecision(event, ops).allow;

// ---- structural board checks, not tool approvals ----

test('positive: a valid configured board edit passes structural checks but inherits host approval', async (t) => {
  const { ops, boardFile } = await workspace(t);
  const event = edit(boardFile, '### CARD-1 First', '### CARD-1 First (refined)');
  const result = boardDecision(event, ops);
  assert.equal(result.allow, true);
  assert.match(result.reason, /allowlisted/);
  assert.equal(evaluatePreToolUse(event).decision, 'inherit');
  assert.deepEqual(formatHookResponse(event), {});
});

test('positive: the VS Code field names filePath, oldString, and newString are understood', async (t) => {
  const { ops, boardFile } = await workspace(t);
  assert.equal(decide({ tool_name: 'edit', tool_input: { filePath: boardFile, oldString: 'First', newString: 'Refined' } }, ops), true);
});

test('positive: reads of a configured board pass the structural target check', async (t) => {
  const { ops, boardFile } = await workspace(t);
  assert.equal(decide({ tool_name: 'view', tool_input: { path: boardFile } }, ops), true);
});

test('positive: creating a new valid board passes structural checks', async (t) => {
  const { ops, boardFile } = await workspace(t);
  await rm(boardFile);
  assert.equal(decide({ tool_name: 'create', tool_input: { path: boardFile, file_text: board } }, ops), true);
});

test('positive: a CRLF board accepts an LF multi-line edit', async (t) => {
  const { ops, boardFile } = await workspace(t, {}, board.replace(/\n/g, '\r\n'));
  assert.equal(decide(edit(boardFile, '## To Do\n\n### CARD-1 First', '## To Do\n\n### CARD-1 First\n### CARD-3 Third'), ops), true);
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

// ---- structurally out-of-scope board changes ----

test('negative: other files in the same directory are not scoped boards', async (t) => {
  const { root, ops } = await workspace(t);
  assert.equal(decide(edit(join(root, '.docs', 'other.md'), 'x', 'y'), ops), false);
});

test('negative: path traversal is not a scoped board edit', async (t) => {
  const { root, ops } = await workspace(t);
  assert.equal(decide(edit(join(root, '.docs', '..', '.github', 'agents', 'factory.agent.md'), 'a', 'b'), ops), false);
});

test('negative: a shell command mentioning the board is not a structural board edit', async (t) => {
  const { ops, boardFile } = await workspace(t);
  assert.equal(decide({ tool_name: 'powershell', tool_input: { command: `Remove-Item ${boardFile}` } }, ops), false);
});

test('negative: two different path fields fail the scoped board check', async (t) => {
  const { root, ops, boardFile } = await workspace(t);
  assert.equal(decide({ tool_name: 'edit', tool_input: { path: boardFile, filePath: join(root, '.docs', 'other.md'), old_str: 'a', new_str: 'b' } }, ops), false);
});

test('negative: a call with no path fails the scoped board check', async (t) => {
  const { ops } = await workspace(t);
  assert.equal(decide({ tool_name: 'edit', tool_input: { old_str: 'a', new_str: 'b' } }, ops), false);
  assert.equal(decide({ tool_name: 'edit' }, ops), false);
});

test('negative: an edit whose old text is absent fails structural checks', async (t) => {
  const { ops, boardFile } = await workspace(t);
  assert.equal(decide(edit(boardFile, 'not present anywhere', 'z'), ops), false);
});

test('negative: an edit whose old text is ambiguous fails structural checks', async (t) => {
  const { ops, boardFile } = await workspace(t, {}, '## To Do\n### A\n### A\n## In Progress\n');
  assert.equal(decide(edit(boardFile, '### A', '### B'), ops), false);
});

for (const [label, input] of [
  ['an empty old text', { old_str: '', new_str: 'x' }],
  ['a missing new text', { old_str: 'First' }],
  ['a non-string new text', { old_str: 'First', new_str: 5 }],
]) {
  test(`negative: an edit with ${label} fails structural checks`, async (t) => {
    const { ops, boardFile } = await workspace(t);
    assert.equal(decide({ tool_name: 'edit', tool_input: { path: boardFile, ...input } }, ops), false);
  });
}

test('negative: editing a board that does not exist fails structural checks', async (t) => {
  const { ops, boardFile } = await workspace(t);
  await rm(boardFile);
  assert.equal(decide(edit(boardFile, 'a', 'b'), ops), false);
});

test('negative: renaming a bucket fails board structure validation', async (t) => {
  const { ops, boardFile } = await workspace(t);
  assert.equal(decide(edit(boardFile, '## In Progress', '## Underway'), ops), false);
});

for (const name of ['Done', 'Completed', 'Archive', 'Archived', 'Finished', 'Closed']) {
  test(`negative: adding a "${name}" bucket fails the two-bucket structural check`, async (t) => {
    const { ops, boardFile } = await workspace(t);
    assert.equal(decide(edit(boardFile, '## In Progress', `## ${name}\n\n## In Progress`), ops), false);
    assert.match(validateBoardContent(`## To Do\n## In Progress\n## ${name}\n`), /completed\/archive/);
  });
}

test('negative: a board missing a bucket fails validation', () => {
  assert.match(validateBoardContent('## To Do\n'), /lose its To Do or In Progress/);
});

test('negative: create over an existing board fails structural checks', async (t) => {
  const { ops, boardFile } = await workspace(t);
  assert.equal(decide({ tool_name: 'create', tool_input: { path: boardFile, file_text: board } }, ops), false);
});

test('negative: create with invalid or missing content fails structural checks', async (t) => {
  const { ops, boardFile } = await workspace(t);
  await rm(boardFile);
  assert.equal(decide({ tool_name: 'create', tool_input: { path: boardFile, file_text: '# no buckets' } }, ops), false);
  assert.equal(decide({ tool_name: 'create', tool_input: { path: boardFile } }, ops), false);
});

test('negative: tools other than edit and create never pass structural write checks', async (t) => {
  const { ops, boardFile } = await workspace(t);
  assert.equal(decide({ tool_name: 'delete', tool_input: { path: boardFile } }, ops), false);
});

test('negative: reads of other .docs files fail the scoped board target check', async (t) => {
  const { root, ops } = await workspace(t);
  assert.equal(decide({ tool_name: 'view', tool_input: { path: join(root, '.docs', 'other.md') } }, ops), false);
});

test('negative: an empty board list contains no structurally scoped targets', async (t) => {
  const { ops, boardFile } = await workspace(t, { boardPaths: [] });
  assert.equal(decide(edit(boardFile, 'First', 'Refined'), ops), false);
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
  test(`negative: ${label} produces no scoped board targets without throwing`, async (t) => {
    const { root } = await workspace(t);
    const bad = join(root, 'bad.json');
    await writeFile(bad, content);
    const ops = loadFactoryOps({ root, configPath: bad });
    assert.deepEqual(ops.boardPaths, []);
    assert.equal(decide(edit(join(root, '.docs', 'kanban.md'), 'a', 'b'), ops), false);
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
  test(`negative: an edit of ${path} cannot override host permission checks`, () => {
    const event = { tool_name: 'edit', tool_input: { path } };
    assert.equal(evaluatePreToolUse(event).decision, 'inherit');
    assert.deepEqual(formatHookResponse(event), {});
  });
}

// ---- unattended policy ----

test('negative: the unattended helper narrows an explicit blocked decision and queues it without secrets or payload echo', async (t) => {
  const { root, ops } = await workspace(t, { unattended: true });
  const event = { tool_name: 'powershell', tool_input: { command: 'npm test', apiKey: 'sk-supersecretvalue1234' } };
  const asked = { decision: 'ask' };
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
  const asked = { decision: 'ask' };
  await applyUnattendedPolicy(event, asked, ops);
  assert.match((await applyUnattendedPolicy(event, asked, ops)).reason, /AQ-1/);
  assert.equal((await readFile(join(root, '.docs', 'queue.jsonl'), 'utf8')).trim().split('\n').length, 1);
});

test('negative: an action a human already denied is not re-queued without changed evidence', async (t) => {
  const { root, ops } = await workspace(t, { unattended: true });
  const event = { tool_name: 'powershell', tool_input: { command: 'npm test' } };
  const asked = { decision: 'ask' };
  await applyUnattendedPolicy(event, asked, ops);
  const { resolveRequest } = await import('../../tools/approval-queue.mjs');
  await resolveRequest(join(root, '.docs', 'queue.jsonl'), 'AQ-1', { decision: 'denied', approver: 'Chad', source: 'chat' });
  assert.match((await applyUnattendedPolicy(event, asked, ops)).reason, /already denied/);
});

test('negative: with no queue configured an unattended ask is still denied', async (t) => {
  const { ops } = await workspace(t, { unattended: true, approvalQueuePath: null });
  const event = { tool_name: 'powershell', tool_input: { command: 'x' } };
  const result = await applyUnattendedPolicy(event, { decision: 'ask' }, ops);
  assert.equal(result.decision, 'deny');
  assert.match(result.reason, /no approval queue/);
});

test('negative: if the queue is locked the action is still denied, never allowed', async (t) => {
  const { root, ops } = await workspace(t, { unattended: true });
  await writeFile(join(root, '.docs', 'queue.jsonl.lock'), JSON.stringify({ pid: process.pid, host: os.hostname() }));
  const event = { tool_name: 'powershell', tool_input: { command: 'x' } };
  const result = await applyUnattendedPolicy(event, { decision: 'ask' }, ops);
  assert.equal(result.decision, 'deny');
  assert.match(result.reason, /could not be queued/);
});

test('negative: a non-object tool input is still queued and denied', async (t) => {
  const { ops } = await workspace(t, { unattended: true });
  const event = { tool_name: 'powershell', tool_input: 'just a string' };
  assert.equal((await applyUnattendedPolicy(event, { decision: 'ask' }, ops)).decision, 'deny');
});

test('positive: the unattended helper preserves explicit decisions and host inheritance', async (t) => {
  const attended = await workspace(t);
  const askEvent = { tool_name: 'powershell', tool_input: { command: 'x' } };
  assert.equal((await applyUnattendedPolicy(askEvent, { decision: 'ask' }, attended.ops)).decision, 'ask');
  const unattended = await workspace(t, { unattended: true });
  assert.equal((await applyUnattendedPolicy({ tool_name: 'read', tool_input: {} }, { decision: 'allow' }, unattended.ops)).decision, 'allow');
  assert.equal((await applyUnattendedPolicy(askEvent, evaluatePreToolUse(askEvent), unattended.ops)).decision, 'inherit');
  assert.equal((await applyUnattendedPolicy(askEvent, { decision: 'deny' }, unattended.ops)).decision, 'deny');
});

test('negative: an unattended hook does not deny or queue a call before the host permission decision', async (t) => {
  const { root, ops } = await workspace(t, { unattended: true });
  const result = await handleHookInput(JSON.stringify({ toolName: 'powershell', toolArgs: { command: 'npm test' } }), 'preToolUse', ops);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {});
  await assert.rejects(readFile(join(root, '.docs', 'queue.jsonl'), 'utf8'), { code: 'ENOENT' });
});

// ---- stdin handler ----

test('positive: a read tool inherits host permissions with exit 0', async () => {
  const result = await handleHookInput(JSON.stringify({ toolName: 'read', toolArgs: {} }), 'preToolUse', loadFactoryOps());
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {});
});

test('positive: the VS Code payload shape also leaves permission decisions unset', async () => {
  const result = await handleHookInput(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'read' }), undefined, loadFactoryOps());
  assert.deepEqual(JSON.parse(result.stdout), {});
});

test('positive: post-tool and subagent events return context without a permission decision', async () => {
  const post = JSON.parse((await handleHookInput(JSON.stringify({ toolName: 'web_fetch' }), 'postToolUse', loadFactoryOps())).stdout);
  const sub = JSON.parse((await handleHookInput(JSON.stringify({ agentName: 'ProductOwner' }), 'subagentStart', loadFactoryOps())).stdout);
  assert.match(post.additionalContext, /untrusted data/);
  assert.match(sub.additionalContext, /revalidate/i);
  assert.equal(post.permissionDecision, undefined);
});

test('positive: formatHookResponse defaults to host inheritance when no event is named', () => {
  assert.deepEqual(formatHookResponse({ toolName: 'read' }), {});
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

test('negative: the handler cannot pre-approve or force a prompt for a valid non-read tool', async () => {
  const result = await handleHookInput(JSON.stringify({ toolName: 'powershell', toolArgs: { command: 'x' } }), 'preToolUse', loadFactoryOps());
  assert.deepEqual(JSON.parse(result.stdout), {});
});

test('negative: sensitive read paths never bypass host permissions', () => {
  for (const path of ['.env', 'config/secrets.json', 'keys/id.pem', '.docs/anything.md']) {
    assert.deepEqual(formatHookResponse({ tool_name: 'read', tool_input: { path } }), {}, path);
  }
});

test('negative: tool input cannot manufacture a hook approval even when it is unserializable', () => {
  const circular = {};
  circular.self = circular;
  assert.deepEqual(formatHookResponse({ tool_name: 'edit', tool_input: circular }), {});
});

test('positive: a reference-checkout hook leaves separate product tool permissions to the host', async (t) => {
  const { root, configPath, boardFile } = await workspace(t);
  const run = runNode(
    join(repoRoot, '.github', 'hooks', 'pre-tool-policy.mjs'),
    ['preToolUse', '--root', root, '--config', configPath],
    { cwd: repoRoot, input: JSON.stringify(edit(boardFile, 'First', 'Refined')) },
  );
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), {});
});

test('negative: a payload cannot reroute a configured pre-tool event to avoid invalid-tool denial', async () => {
  const result = await handleHookInput(JSON.stringify({ hook_event_name: 'PostToolUse' }), 'preToolUse');
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.hookEventName, 'PreToolUse');
});

test('negative: unsupported or non-string hook events fail closed', async () => {
  for (const event of ['notAnEvent', 7]) {
    const result = await handleHookInput(JSON.stringify({ hookEventName: event, toolName: 'read' }));
    assert.equal(result.exitCode, 2);
    assert.equal(result.stdout, undefined);
  }
});
