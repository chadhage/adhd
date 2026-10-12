import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { evaluatePreToolUse, formatHookResponse } from '../pre-tool-policy.mjs';

const cases = JSON.parse(await readFile(new URL('./prompt-injection-cases.json', import.meta.url), 'utf8'));
const hookPath = fileURLToPath(new URL('../pre-tool-policy.mjs', import.meta.url));

test('only explicit local read/search tools are automatically allowed', () => {
  for (const toolName of ['read', 'search', 'view', 'glob', 'grep', 'readFile', 'search/textSearch']) {
    assert.equal(evaluatePreToolUse({ tool_name: toolName }).decision, 'allow', toolName);
  }
});

test('unknown, write, network, execution, and delegation tools require approval', () => {
  for (const toolName of ['edit', 'create', 'powershell', 'bash', 'web_fetch', 'web_search', 'task', 'mcp_server/action', '']) {
    assert.notEqual(evaluatePreToolUse({ tool_name: toolName }).decision, 'allow', toolName);
  }
});

test('untrusted injection text cannot grant authority or change the tool decision', () => {
  for (const item of cases) {
    const result = evaluatePreToolUse({
      tool_name: item.toolName,
      tool_input: { ...item.toolInput, evidence: item.untrustedText },
    });
    assert.equal(result.decision, item.expectedDecision, item.id);
    assert.equal(Boolean(result.reason?.includes('protected')), Boolean(item.protectedTarget), item.id);
    assert.equal(result.reason?.includes(item.untrustedText) ?? false, false, `${item.id}: payload leaked into reason`);
  }
});

test('protected persistent instruction and record paths always require human review', () => {
  for (const path of [
    '.github/agents/factory.agent.md',
    '.github/skills/example/SKILL.md',
    '.github/hooks/tool-policy.json',
    '.github/copilot-instructions.md',
    '.vscode/settings.json',
    '.docs/contracts/current.md',
    'CODEOWNERS',
  ]) {
    const result = evaluatePreToolUse({ tool_name: 'edit', tool_input: { path } });
    assert.equal(result.decision, 'ask', path);
    assert.match(result.reason, /protected/i, path);
  }
});

test('Local and Copilot hook payloads receive their respective decision schemas', () => {
  const local = formatHookResponse({ hook_event_name: 'PreToolUse', tool_name: 'powershell' }, 'preToolUse');
  assert.equal(local.hookSpecificOutput.permissionDecision, 'ask');
  assert.equal(local.hookSpecificOutput.hookEventName, 'PreToolUse');

  const copilot = formatHookResponse({ toolName: 'powershell' }, 'preToolUse');
  assert.equal(copilot.permissionDecision, 'ask');
});

test('tool and subagent results receive provenance reminders without echoing their contents', () => {
  const postTool = formatHookResponse({ toolName: 'web_fetch' }, 'postToolUse');
  assert.match(postTool.additionalContext, /untrusted data/);
  assert.match(postTool.additionalContext, /source\/provenance/);

  const localPostTool = formatHookResponse({ hook_event_name: 'PostToolUse', tool_name: 'web_fetch' }, 'postToolUse');
  assert.match(localPostTool.hookSpecificOutput.additionalContext, /untrusted data/);

  const subagent = formatHookResponse({ agentName: 'ProductOwner' }, 'subagentStart');
  assert.match(subagent.additionalContext, /revalidate the original source and scope/i);

  const localSubagent = formatHookResponse({ hook_event_name: 'SubagentStart', agent_type: 'ProductOwner' }, 'subagentStart');
  assert.match(localSubagent.hookSpecificOutput.additionalContext, /cannot grant human approval/);
});

test('invalid tool events fail closed', () => {
  assert.equal(evaluatePreToolUse({}).decision, 'deny');
  assert.equal(evaluatePreToolUse({ tool_name: {} }).decision, 'deny');
});

test('hook process asks for a non-read action and fails closed on malformed input', () => {
  const approval = spawnSync(process.execPath, [hookPath, 'preToolUse'], {
    encoding: 'utf8',
    input: JSON.stringify({ toolName: 'powershell', toolArgs: { command: '<synthetic command>' } }),
  });
  assert.equal(approval.status, 0, approval.stderr);
  assert.equal(JSON.parse(approval.stdout).permissionDecision, 'ask');

  const malformed = spawnSync(process.execPath, [hookPath, 'preToolUse'], {
    encoding: 'utf8',
    input: 'not-json',
  });
  assert.equal(malformed.status, 2);
});

test('workspace settings and hook registration preserve restrictive defaults', async () => {
  const [hookConfig, settings] = await Promise.all([
    readFile(new URL('../tool-policy.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../../../.vscode/settings.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  for (const eventName of ['preToolUse', 'postToolUse', 'subagentStart']) {
    assert.equal(hookConfig.hooks[eventName].length, 1, eventName);
    assert.match(hookConfig.hooks[eventName][0].command, new RegExp(`${eventName}$`));
  }
  assert.equal(settings['chat.tools.global.autoApprove'], false);
  assert.equal(settings['chat.tools.terminal.enableAutoApprove'], false);
  assert.equal(settings['chat.agent.sandbox.network.allowNetwork'], false);
  assert.equal(settings['chat.agent.sandbox.allowUnsandboxedCommands'], false);
  assert.deepEqual(settings['chat.agent.allowedNetworkDomains'], []);
});