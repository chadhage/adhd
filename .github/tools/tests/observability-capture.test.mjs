import assert from 'node:assert/strict';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { capture, runCapture } from '../../skills/factory-observability/scripts/capture.mjs';
import { center } from './observability-helpers.mjs';

const payload = (extra = {}) => ({
  session_id: 'session-1', tool_name: 'functions.view', tool_call_id: 'call-1',
  timestamp: '2020-01-01T00:00:00Z', ...extra,
});

test('positive: metadata capture is session-bound, idempotent and does not store tool arguments/results/prompts', async (t) => {
  const ws = await center(t, { copy: true });
  const input = payload({
    tool_input: { prompt: 'PRIVATE-PROMPT', api_key: 'PRIVATE-KEY' },
    tool_result: { output: 'PRIVATE-RESULT' },
    user_message: 'PRIVATE-MESSAGE',
  });
  await capture(ws.base, 'preToolUse', input);
  await capture(ws.base, 'preToolUse', input);
  await capture(ws.base, 'postToolUse', input);
  const saved = await ws.store.read();
  assert.equal(saved.length, 2);
  assert.equal(saved[0].kind, 'tool.requested');
  assert.equal(saved[1].kind, 'tool.observed');
  assert.equal(saved[0].agent, undefined);
  assert.ok(!JSON.stringify(saved).includes('PRIVATE-'));
});

test('negative: unbound sessions are not guessed from a single available Factory', async (t) => {
  const ws = await center(t, { copy: true });
  const result = await capture(ws.base, 'postToolUse', payload({ session_id: 'unrelated-session' }));
  assert.equal(result.captured, 0);
  assert.equal((await ws.store.read()).length, 0);
});

test('negative: ambiguous session bindings cannot copy metadata into two Factories', async (t) => {
  const ws = await center(t, { copy: true });
  await writeFile(join(ws.base, 'registry.json'), JSON.stringify({ version: 1, factories: { alpha: { sessions: ['session-1'] }, beta: { sessions: ['session-1'] } } }));
  await assert.rejects(capture(ws.base, 'postToolUse', payload()), /Ambiguous/);
  assert.equal((await ws.store.read()).length, 0);
});

test('positive: skill loading has separate request/load facts and never implies method completion', async (t) => {
  const ws = await center(t, { copy: true });
  const input = payload({ toolName: 'skill', tool_name: 'functions.skill', toolInput: JSON.stringify({ skill: 'fullstack-empirical-done', other: 'PRIVATE-ARG' }) });
  await capture(ws.base, 'preToolUse', input);
  await capture(ws.base, 'postToolUse', input);
  const data = await ws.store.read();
  assert.ok(data.some((event) => event.kind === 'skill.requested'));
  assert.ok(data.some((event) => event.kind === 'skill.loaded'));
  assert.ok(!data.some((event) => event.kind === 'skill.completed'));
  assert.ok(!JSON.stringify(data).includes('PRIVATE-ARG'));
});

test('positive: explicit tool failure is reported and successful writes expose only safe product artifact metadata', async (t) => {
  const ws = await center(t, { copy: true });
  await capture(ws.base, 'postToolUse', payload({ success: false, tool_input: {} }));
  await capture(ws.base, 'postToolUse', payload({
    tool_name: 'create_file', tool_call_id: 'call-2', tool_success: true,
    tool_input: { filePath: join(ws.root, 'src', 'result.mjs'), content: 'PRIVATE-CONTENT' },
    agent_id: 'worker-1', agent_type: 'Fullstacker',
  }));
  await capture(ws.base, 'postToolUse', payload({
    tool_name: 'edit', tool_call_id: 'call-3', toolResult: { success: true },
    toolInput: { path: 'src\\result.mjs', newString: 'PRIVATE-EDIT' },
  }));
  const data = await ws.store.read();
  assert.ok(data.some((event) => event.kind === 'tool.failed'));
  assert.ok(data.some((event) => event.kind === 'tool.completed'));
  assert.ok(data.some((event) => event.kind === 'item.created' && event.item.type === 'artifact'));
  assert.ok(data.some((event) => event.kind === 'item.updated'));
  assert.ok(!JSON.stringify(data).includes('PRIVATE-'));
});

for (const [name, path] of [
  ['sensitive paths', '.env.local'],
  ['outside product paths', '..\\outside\\private.json'],
  ['self-observation records', '.factory\\observability\\alpha\\events.jsonl'],
]) test(`negative: ${name} are not collected as product artifacts`, async (t) => {
  const ws = await center(t, { copy: true });
  await capture(ws.base, 'postToolUse', payload({ tool_name: 'create', tool_success: true, tool_input: { path } }));
  assert.equal((await ws.store.read()).filter((event) => event.kind.startsWith('item.')).length, 0);
});

test('negative: opaque or malformed tool payloads never become raw telemetry or fabricated item facts', async (t) => {
  const ws = await center(t, { copy: true });
  await capture(ws.base, 'postToolUse', payload({ tool_name: 'skill', tool_input: 'not-json-PRIVATE', tool_call_id: 'call-a' }));
  await capture(ws.base, 'postToolUse', payload({ tool_name: 'create', tool_input: {}, tool_call_id: 'call-b' }));
  await capture(ws.base, 'postToolUse', payload({ tool_name: 'functions.apply_patch', tool_input: 'PRIVATE-PATCH', tool_call_id: 'call-c' }));
  const events = await ws.store.read();
  assert.ok(!JSON.stringify(events).includes('PRIVATE'));
  assert.equal(events.some((event) => event.kind === 'skill.completed'), false);
  assert.equal(events.some((event) => event.kind === 'item.created'), false);
});

test('positive: actual nested agent boundaries and session metadata preserve attribution without approval claims', async (t) => {
  const ws = await center(t, { copy: true });
  const actor = { agent_id: 'actual-child', agent_name: 'Squad', parent_session_id: 'session-1', session_id: 'child-session' };
  await capture(ws.base, 'subagentStart', payload(actor));
  await capture(ws.base, 'subagentStop', payload(actor));
  await capture(ws.base, 'agentStop', { sessionId: 'session-1' });
  await capture(ws.base, 'sessionStart', { sessionId: 'session-1' });
  await capture(ws.base, 'sessionEnd', { sessionId: 'session-1' });
  const events = await ws.store.read();
  assert.equal(events[0].agent.id, 'actual-child');
  assert.equal(events[1].kind, 'agent.returned');
  assert.ok(events.slice(2).every((event) => event.kind === 'evidence.recorded'));
  assert.equal(events.some((event) => event.kind === 'factory.stopped'), false);
});

for (const [name, event, input] of [
  ['unknown hook event', 'execute', payload()],
  ['non-object payload', 'preToolUse', []],
  ['missing tool name', 'preToolUse', { session_id: 'session-1' }],
  ['unsafe tool name', 'preToolUse', payload({ tool_name: '\nPRIVATE' })],
]) test(`negative: ${name} fails without permissive hook output`, async (t) => {
  const ws = await center(t, { copy: true });
  await assert.rejects(capture(ws.base, event, input));
});

test('negative: invalid or linked registry targets cannot redirect capture into another location', async (t) => {
  const ws = await center(t, { copy: true });
  await writeFile(join(ws.base, 'registry.json'), '{"version":2}');
  await assert.rejects(capture(ws.base, 'preToolUse', payload()), /registry/);
  await writeFile(join(ws.base, 'registry.json'), JSON.stringify({ version: 1, factories: { '../escape': { sessions: ['session-1'] } } }));
  await assert.rejects(capture(ws.base, 'preToolUse', payload()), /identity/);
  const outside = join(ws.root, 'outside');
  await mkdir(outside);
  await symlink(outside, join(ws.base, 'beta'), 'junction');
  await writeFile(join(ws.base, 'registry.json'), JSON.stringify({ version: 1, factories: { beta: { sessions: ['session-1'] } } }));
  await assert.rejects(capture(ws.base, 'preToolUse', payload()), /link/);
});

test('positive: actual hook runner emits only permission-neutral output for a valid bound event', async (t) => {
  const ws = await center(t, { copy: true });
  let output = '';
  const status = await runCapture(['preToolUse'], Readable.from([JSON.stringify(payload())]), { write(value) { output += value; } }, ws.base);
  assert.equal(status, 0);
  assert.deepEqual(JSON.parse(output), {});
  assert.equal((await readFile(ws.path('events.jsonl'), 'utf8')).includes('tool.requested'), true);
});

test('negative: malformed registry JSON fails without echoing raw configuration through hook output', async (t) => {
  const ws = await center(t, { copy: true });
  await writeFile(join(ws.base, 'registry.json'), '{PRIVATE-CONFIGURATION');
  let output = '';
  assert.equal(await runCapture(['preToolUse'], Readable.from([JSON.stringify(payload())]), { write(value) { output += value; } }, ws.base), 1);
  assert.deepEqual(JSON.parse(output), {});
});

for (const [name, args, input] of [
  ['unsupported arguments', [], '{}'],
  ['malformed JSON', ['preToolUse'], '{PRIVATE'],
  ['oversized hook input', ['preToolUse'], 'x'.repeat(1024 * 1024 + 1)],
]) test(`negative: hook runner reports ${name} without a permission override`, async (t) => {
  const ws = await center(t, { copy: true });
  let output = '';
  const status = await runCapture(args, Readable.from([input]), { write(value) { output += value; } }, ws.base);
  assert.equal(status, 1);
  assert.deepEqual(JSON.parse(output), {});
});
