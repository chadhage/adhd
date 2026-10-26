import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import test from 'node:test';
import { loadFactoryOps } from '../../hooks/factory-ops.mjs';
import { resolveHookWorkspace } from '../../hooks/pre-tool-policy.mjs';
import { installProductWorkspace, repoRoot, runNode } from './helpers.mjs';

const edit = (path) => ({
  tool_name: 'edit',
  tool_input: { path, old_str: 'First', new_str: 'Refined' },
});

test('positive: explicit relative hook paths resolve from the invoking product workspace', async (t) => {
  const ws = await installProductWorkspace(t);
  assert.deepEqual(resolveHookWorkspace({ root: '.', config: join('.github', 'hooks', 'factory-ops.json') }, ws.root), {
    root: ws.root,
    configPath: ws.configPath,
  });
  assert.deepEqual(resolveHookWorkspace({ root: ws.root }, repoRoot), {
    root: ws.root,
    configPath: ws.configPath,
  });
});

test('negative: invocation cwd alone cannot silently replace the reference hook configuration', async (t) => {
  const ws = await installProductWorkspace(t);
  assert.deepEqual(resolveHookWorkspace({}, ws.root), {
    root: repoRoot,
    configPath: join(repoRoot, '.github', 'hooks', 'factory-ops.json'),
  });
});

test('positive: a separate product fixture binds real reference scripts and paths containing spaces', async (t) => {
  const ws = await installProductWorkspace(t);
  const reference = await realpath(repoRoot);
  const product = await realpath(ws.root);
  const fromReference = relative(reference, product);
  assert.notEqual(product, reference);
  assert.ok(fromReference.startsWith('..') || isAbsolute(fromReference));
  assert.ok(product.includes(' '));
  assert.equal(ws.referenceRoot, repoRoot);
  assert.equal(ws.hookScript, join(repoRoot, '.github', 'hooks', 'pre-tool-policy.mjs'));
  assert.equal(existsSync(ws.hookScript), true);
  const ops = loadFactoryOps({ root: ws.root, configPath: ws.configPath });
  assert.deepEqual(ops.problems, []);
  assert.equal(ops.boardPaths[0], await realpath(ws.docs('kanban.md')));
});

test('negative: a separate product fixture never copies framework executable scripts or human approvals', async (t) => {
  const ws = await installProductWorkspace(t);
  for (const path of [
    join(ws.root, '.github', 'hooks', 'pre-tool-policy.mjs'),
    join(ws.root, '.github', 'tools'),
    join(ws.root, '.github', 'agents'),
    ws.docs('approvals.jsonl'),
  ]) {
    assert.equal(existsSync(path), false, path);
  }
});

test('negative: a reference hook without explicit product binding cannot pre-approve the product board edit', async (t) => {
  const ws = await installProductWorkspace(t);
  const before = await readFile(ws.docs('kanban.md'), 'utf8');
  const run = runNode(ws.hookScript, ['preToolUse'], { cwd: repoRoot, input: JSON.stringify(edit(ws.docs('kanban.md'))) });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), {});
  assert.equal(await readFile(ws.docs('kanban.md'), 'utf8'), before);
});

test('positive: a reference stop executable observes the separate product board using explicit CLI binding', async (t) => {
  const ws = await installProductWorkspace(t);
  const run = ws.stop({ hook_event_name: 'Stop', stop_hook_active: false, cwd: ws.root });
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /To Do=2, In Progress=1/);
});

test('negative: stop retry release from the reference script does not fabricate product shutdown approval', async (t) => {
  const ws = await installProductWorkspace(t);
  const run = ws.stop({ hook_event_name: 'Stop', stop_hook_active: true, cwd: ws.root });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), {});
  assert.equal(JSON.parse(run.stderr).trigger, 'unapproved halt (suspected)');
  assert.equal(existsSync(ws.docs('approvals.jsonl')), false);
});

test('positive: a separate product fixture removes its owned records when the test completes', async (t) => {
  let productRoot;
  await t.test('positive: a disposable product lifecycle', async (child) => {
    const ws = await installProductWorkspace(child);
    productRoot = ws.root;
    const run = ws.stop({ stop_hook_active: true });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(existsSync(ws.docs('kanban.md')), true);
  });
  assert.equal(existsSync(productRoot), false);
});

for (const schema of ['copilot', 'local']) {
  test(`positive: explicit product binding leaves board tool approval to the host using the ${schema} payload`, async (t) => {
    const ws = await installProductWorkspace(t);
    const before = await readFile(ws.docs('kanban.md'), 'utf8');
    const event = schema === 'local'
      ? { hook_event_name: 'PreToolUse', ...edit(ws.docs('kanban.md')) }
      : { toolName: 'edit', toolArgs: edit(ws.docs('kanban.md')).tool_input };
    const run = ws.hook('preToolUse', event);
    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(run.stdout);
    assert.deepEqual(result, {});
    assert.equal(await readFile(ws.docs('kanban.md'), 'utf8'), before);
  });
}

test('positive: an explicit root alone selects that product root configuration', async (t) => {
  const ws = await installProductWorkspace(t);
  const run = runNode(ws.hookScript, ['preToolUse', '--root', ws.root], {
    input: JSON.stringify(edit(ws.docs('kanban.md'))),
  });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), {});
});

test('positive: relative root and config resolve from invocation cwd with options before the event', async (t) => {
  const ws = await installProductWorkspace(t);
  const run = runNode(ws.hookScript, ['--root', '.', '--config', join('.github', 'hooks', 'factory-ops.json'), 'PreToolUse'], {
    cwd: ws.root,
    input: JSON.stringify(edit(ws.docs('kanban.md'))),
  });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), {});
});

test('negative: config without a product root cannot pre-approve an outside-root product board', async (t) => {
  const ws = await installProductWorkspace(t);
  const run = runNode(ws.hookScript, ['preToolUse', '--config', ws.configPath], {
    input: JSON.stringify(edit(ws.docs('kanban.md'))),
  });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), {});
});

for (const target of ['unlisted-board', 'protected-instruction']) {
  test(`negative: explicit product binding cannot pre-approve an ${target} edit`, async (t) => {
    const ws = await installProductWorkspace(t);
    const path = target === 'unlisted-board'
      ? ws.docs('unlisted.md')
      : join(ws.root, '.github', 'agents', 'factory.agent.md');
    const run = ws.hook('preToolUse', edit(path));
    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(run.stdout);
    assert.deepEqual(result, {});
    assert.equal(existsSync(path), false);
  });
}

test('negative: selected unattended configuration does not deny or queue a command before host approval', async (t) => {
  const ws = await installProductWorkspace(t, { unattended: true });
  const run = ws.hook('preToolUse', { toolName: 'powershell', toolArgs: { command: '<synthetic command, never executed>' } });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), {});
  await assert.rejects(readFile(ws.docs('queue.jsonl'), 'utf8'), { code: 'ENOENT' });
});

test('positive: omitted CLI event and binding options preserve both default payload schemas', () => {
  for (const event of [
    { toolName: 'read', toolArgs: {} },
    { hook_event_name: 'PreToolUse', tool_name: 'read', tool_input: {} },
  ]) {
    const run = runNode(join(repoRoot, '.github', 'hooks', 'pre-tool-policy.mjs'), [], { input: JSON.stringify(event) });
    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(run.stdout);
    assert.deepEqual(result, {});
  }
});

test('positive: explicit binding preserves post-tool and subagent-start context schemas', async (t) => {
  const ws = await installProductWorkspace(t);
  for (const [name, localName, field] of [
    ['postToolUse', 'PostToolUse', 'toolName'],
    ['subagentStart', 'SubagentStart', 'agentName'],
  ]) {
    for (const local of [false, true]) {
      const event = local ? { hook_event_name: localName, [field]: 'synthetic' } : { [field]: 'synthetic' };
      const run = ws.hook(name, event);
      assert.equal(run.status, 0, run.stderr);
      const result = JSON.parse(run.stdout);
      const context = local ? result.hookSpecificOutput : result;
      assert.match(context.additionalContext, /untrusted/);
      if (local) assert.equal(context.hookEventName, localName);
      assert.equal(context.permissionDecision, undefined);
    }
  }
});

for (const [label, makeArgs] of [
  ['unknown option', () => ['preToolUse', '--unknown']],
  ['missing root value', () => ['preToolUse', '--root']],
  ['missing config value', () => ['preToolUse', '--config']],
  ['empty root', () => ['preToolUse', '--root=']],
  ['blank root', () => ['preToolUse', '--root', '   ']],
  ['empty config', () => ['preToolUse', '--config=']],
  ['blank config', () => ['preToolUse', '--config', '   ']],
  ['duplicate root', (ws) => ['preToolUse', '--root', ws.root, '--root', ws.root]],
  ['duplicate config', (ws) => ['preToolUse', '--config', ws.configPath, '--config', ws.configPath]],
  ['unknown event', () => ['notAnEvent']],
  ['extra event', () => ['preToolUse', 'postToolUse']],
]) {
  test(`negative: the hook CLI rejects ${label} instead of silently using defaults`, async (t) => {
    const ws = await installProductWorkspace(t);
    const run = runNode(ws.hookScript, makeArgs(ws), { input: JSON.stringify({ toolName: 'read' }) });
    assert.equal(run.status, 2, run.stderr);
    assert.equal(run.stdout, '');
    assert.match(run.stderr, /Hook (arguments|configuration) invalid:/);
    assert.equal(existsSync(ws.docs('queue.jsonl')), false);
  });
}

test('negative: unreadable explicitly selected config fails without falling back to the reference config', async (t) => {
  const ws = await installProductWorkspace(t);
  const run = ws.hook('preToolUse', { toolName: 'read' }, { args: [] });
  const missing = runNode(ws.hookScript, ['preToolUse', '--root', ws.root, '--config', ws.docs('missing.json')], {
    input: JSON.stringify({ toolName: 'read' }),
  });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(missing.status, 2, missing.stderr);
  assert.equal(missing.stdout, '');
  assert.match(missing.stderr, /Hook configuration invalid:.*Could not read/);
});

test('negative: malformed explicitly selected config fails without producing a permission response', async (t) => {
  const ws = await installProductWorkspace(t);
  await writeFile(ws.configPath, '{ broken');
  const run = ws.hook('preToolUse', { toolName: 'read' });
  assert.equal(run.status, 2, run.stderr);
  assert.equal(run.stdout, '');
  assert.match(run.stderr, /Hook configuration invalid:.*Could not read/);
});

for (const content of ['null', '[]', '{}', '{"version":2}', '42']) {
  test(`negative: selected configuration ${content} cannot silently become an empty valid configuration`, async (t) => {
    const ws = await installProductWorkspace(t);
    await writeFile(ws.configPath, content);
    const run = ws.hook('preToolUse', { toolName: 'read', cwd: repoRoot, approved: true });
    assert.equal(run.status, 2, run.stderr);
    assert.equal(run.stdout, '');
    assert.match(run.stderr, /Hook configuration invalid:/);
    assert.equal(existsSync(ws.docs('queue.jsonl')), false);
  });
}
