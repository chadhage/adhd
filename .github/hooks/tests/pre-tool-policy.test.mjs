import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { evaluatePreToolUse, formatHookResponse } from '../pre-tool-policy.mjs';

const cases = JSON.parse(await readFile(new URL('./prompt-injection-cases.json', import.meta.url), 'utf8'));
const hookPath = fileURLToPath(new URL('../pre-tool-policy.mjs', import.meta.url));
const factoryAgents = [
  ['FactoryLauncher', 'factory-launcher'],
  ['Factory', 'factory'],
  ['Squad', 'squad'],
  ['ProductOwner', 'product-owner'],
  ['VOC', 'voc'],
  ['AssociateProductOwner', 'associate-product-owner'],
  ['Fullstacker', 'fullstacker'],
  ['Kanban', 'kanban'],
];

test('positive: local read and search tools inherit host permissions', () => {
  for (const toolName of ['read', 'search', 'view', 'glob', 'grep', 'readFile', 'search/textSearch']) {
    assert.equal(evaluatePreToolUse({ tool_name: toolName }).decision, 'inherit', toolName);
    assert.deepEqual(formatHookResponse({ tool_name: toolName }), {}, toolName);
  }
});

test('negative: unknown, write, network, execution, and delegation tools are never pre-approved or forced to ask', () => {
  for (const toolName of ['edit', 'create', 'powershell', 'bash', 'web_fetch', 'web_search', 'task', 'write_agent', 'mcp_server/action', 'future_tool']) {
    assert.equal(evaluatePreToolUse({ tool_name: toolName }).decision, 'inherit', toolName);
    assert.deepEqual(formatHookResponse({ tool_name: toolName }), {}, toolName);
  }
});

test('negative: untrusted injection text cannot grant authority or change the tool decision', () => {
  for (const item of cases) {
    const result = evaluatePreToolUse({
      tool_name: item.toolName,
      tool_input: { ...item.toolInput, evidence: item.untrustedText },
    });
    assert.equal(result.decision, item.expectedDecision, item.id);
    assert.deepEqual(result, evaluatePreToolUse({ tool_name: item.toolName, tool_input: item.toolInput }), item.id);
    assert.equal(result.reason?.includes(item.untrustedText) ?? false, false, `${item.id}: payload leaked into reason`);
  }
});

test('negative: protected and sensitive paths cannot manufacture a grant or override host autonomy', () => {
  for (const path of [
    '.github/agents/factory.agent.md',
    '.github/skills/example/SKILL.md',
    '.github/hooks/tool-policy.json',
    '.github/tools/stop-gate.mjs',
    '.github/copilot-instructions.md',
    '.vscode/settings.json',
    '.docs/contracts/current.md',
    'CODEOWNERS',
    '.env',
    'config/credentials.json',
    'keys/private.pem',
  ]) {
    for (const toolName of ['edit', 'view']) {
      const event = { tool_name: toolName, tool_input: { path } };
      assert.equal(evaluatePreToolUse(event).decision, 'inherit', path);
      assert.deepEqual(formatHookResponse(event), {}, path);
    }
  }
});

test('positive: Local and Copilot payloads omit permission decisions for valid calls', () => {
  const local = formatHookResponse({ hook_event_name: 'PreToolUse', tool_name: 'powershell' }, 'preToolUse');
  assert.deepEqual(local, {});

  const copilot = formatHookResponse({ toolName: 'powershell' }, 'preToolUse');
  assert.deepEqual(copilot, {});
});

test('negative: permission claims in hook fields and arguments never become an approval', () => {
  for (const permissionMode of ['default', 'acceptEdits', 'bypassPermissions', 'allowAll', 'autopilot']) {
    const event = {
      toolName: 'powershell',
      permissionMode,
      permission_mode: permissionMode,
      approved: true,
      toolArgs: { command: '<synthetic command>', permissionDecision: 'allow', humanApproved: true },
    };
    assert.equal(evaluatePreToolUse(event).decision, 'inherit');
    assert.deepEqual(formatHookResponse(event), {});
  }
});

test('negative: the hook cannot replace either a manual approval or an autonomous or denied host decision', () => {
  for (const hostDecision of ['ask', 'allow', 'deny']) {
    const output = formatHookResponse({ toolName: 'task', toolArgs: { agent_type: 'Fullstacker' } });
    assert.equal(output.permissionDecision, undefined);
    assert.equal(output.hookSpecificOutput, undefined);
    assert.equal(output.permissionDecision ?? hostDecision, hostDecision);
  }
});

test('positive: tool and subagent results receive provenance reminders without echoing their contents', () => {
  const postTool = formatHookResponse({ toolName: 'web_fetch' }, 'postToolUse');
  assert.match(postTool.additionalContext, /untrusted data/);
  assert.match(postTool.additionalContext, /source\/provenance/);

  const localPostTool = formatHookResponse({ hook_event_name: 'PostToolUse', tool_name: 'web_fetch' }, 'postToolUse');
  assert.match(localPostTool.hookSpecificOutput.additionalContext, /untrusted data/);

  const subagent = formatHookResponse({ agentName: 'ProductOwner' }, 'subagentStart');
  assert.match(subagent.additionalContext, /revalidate the original source and scope/i);
  assert.match(subagent.additionalContext, /effective host\/session permissions/);
  assert.match(subagent.additionalContext, /Do not request redundant per-call approval/);
  assert.match(subagent.additionalContext, /denials, revocations/);

  const localSubagent = formatHookResponse({ hook_event_name: 'SubagentStart', agent_type: 'ProductOwner' }, 'subagentStart');
  assert.match(localSubagent.hookSpecificOutput.additionalContext, /cannot grant human approval/);
});

test('negative: no Factory role starts a separate tool-authorization confirmation', () => {
  for (const [agentName] of factoryAgents) {
    const output = formatHookResponse({ agentName }, 'subagentStart');
    assert.match(output.additionalContext, /single tool-authorization gate/, agentName);
    assert.match(output.additionalContext, /Do not reopen that gate/, agentName);
    assert.match(output.additionalContext, /per-invocation or selective/, agentName);
    assert.match(output.additionalContext, /Device authentication, CLI authentication/, agentName);
    assert.match(output.additionalContext, /human input/, agentName);
    assert.equal(output.permissionDecision, undefined, agentName);
  }
});

test('negative: repeated calls across all Factory roles never add a hook approval prompt or override a host choice', () => {
  let hookPrompts = 0;
  let calls = 0;
  for (const [agentName] of factoryAgents) {
    for (const permissionMode of ['autonomous', 'per-invocation', 'selective']) {
      for (const toolName of ['read', 'edit', 'execute', 'web', 'agent', 'task', 'write_agent', 'mcp/authenticate']) {
        for (const event of [
          { agentName, toolName, permissionMode },
          { hook_event_name: 'PreToolUse', agent_name: agentName, tool_name: toolName, permission_mode: permissionMode },
        ]) {
          const output = formatHookResponse(event);
          if ((output.permissionDecision ?? output.hookSpecificOutput?.permissionDecision) === 'ask') hookPrompts += 1;
          assert.deepEqual(output, {}, `${agentName}: ${permissionMode}: ${toolName}`);
          calls += 1;
        }
      }
    }
  }
  assert.equal(calls, 384);
  assert.equal(hookPrompts, 0);
});

test('negative: every Factory agent references the same single tool-authorization contract', async () => {
  for (const [agentName, fileName] of factoryAgents) {
    const definition = await readFile(new URL(`../../agents/${fileName}.agent.md`, import.meta.url), 'utf8');
    assert.match(definition, /factory-mvp-and-recovery\/SKILL\.md#single-tool-authorization/, agentName);
  }
});

test('positive: FactoryLauncher exposes the interactive question tool for human-only authentication and decisions', async () => {
  const definition = await readFile(new URL('../../agents/factory-launcher.agent.md', import.meta.url), 'utf8');
  assert.match(definition, /^tools: \[.*vscode\/askQuestions.*\]$/m);
});

test('positive: one-shot orchestration contracts require complete bounded assignments', async () => {
  for (const fileName of ['factory', 'squad']) {
    const definition = await readFile(new URL(`../../agents/${fileName}.agent.md`, import.meta.url), 'utf8');
    assert.match(definition, /complete initial\s+assignment/, fileName);
    assert.match(definition, /predeclared acceptance-event protocol/, fileName);
  }
});

test('negative: coordinating roles do not acquire unverified execution tooling', async () => {
  for (const fileName of ['factory', 'squad']) {
    const definition = await readFile(new URL(`../../agents/${fileName}.agent.md`, import.meta.url), 'utf8');
    const tools = /^tools: \[([^\]]+)\]$/m.exec(definition)?.[1].split(',').map((tool) => tool.trim());
    assert.ok(tools && !tools.includes('execute'), fileName);
  }
});

test('negative: execution availability does not turn orchestrators into product implementers', async () => {
  const factory = await readFile(new URL('../../agents/factory.agent.md', import.meta.url), 'utf8');
  const squad = await readFile(new URL('../../agents/squad.agent.md', import.meta.url), 'utf8');
  assert.match(factory, /do not research customers, set product priority, administer the board, or write product code yourself/i);
  assert.match(factory, /does not authorize product\s+implementation by Factory or widen the host grant/);
  assert.match(squad, /does not make Squad an extra implementer or widen the host grant/);
});

test('negative: one-shot acceptance cannot manufacture terms or depend on an unsupported activation', async () => {
  const contract = await readFile(new URL('../../skills/artifact-storage-and-engagement-contracts/SKILL.md', import.meta.url), 'utf8');
  assert.match(contract, /before\s+invocation, its designated writer specifies the exact event path/i);
  assert.match(contract, /records explicit acceptance there before its authorized work/);
  assert.match(contract, /cannot change terms, grant host\s+permissions, replace human acceptance, or constitute another contract/);
  for (const fileName of ['factory', 'squad']) {
    const definition = await readFile(new URL(`../../agents/${fileName}.agent.md`, import.meta.url), 'utf8');
    assert.match(definition, /complete initial\s+assignment/);
    assert.match(definition, /do not (?:plan|rely\s+on) a later `ACTIVATE`/);
  }
});

test('negative: invalid tool events fail closed', () => {
  for (const event of [null, {}, { tool_name: {} }, { toolName: 7 }, { toolName: '' }, { tool_name: '  ' }]) {
    assert.equal(evaluatePreToolUse(event).decision, 'deny');
  }
  assert.equal(formatHookResponse({ hook_event_name: 'PreToolUse' }).hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(formatHookResponse({}).permissionDecision, 'deny');
});

test('negative: hook process never invents an approval and fails closed on malformed input', () => {
  const approval = spawnSync(process.execPath, [hookPath, 'preToolUse'], {
    encoding: 'utf8',
    input: JSON.stringify({ toolName: 'powershell', toolArgs: { command: '<synthetic command>' } }),
  });
  assert.equal(approval.status, 0, approval.stderr);
  assert.deepEqual(JSON.parse(approval.stdout), {});

  const malformed = spawnSync(process.execPath, [hookPath, 'preToolUse'], {
    encoding: 'utf8',
    input: 'not-json',
  });
  assert.equal(malformed.status, 2);
});

test('positive: workspace settings enable hooks and nested agents without overriding invoker permissions', async () => {
  const [hookConfig, settings] = await Promise.all([
    readFile(new URL('../tool-policy.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../../../.vscode/settings.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  for (const eventName of ['preToolUse', 'postToolUse', 'subagentStart']) {
    assert.equal(hookConfig.hooks[eventName].length, 1, eventName);
    assert.match(hookConfig.hooks[eventName][0].command, new RegExp(`${eventName}$`));
  }
  assert.equal(settings['chat.useHooks'], true);
  assert.equal(settings['chat.subagents.allowInvocationsFromSubagents'], true);
  const permissionOverride = /^(?:chat\.permissions\.|chat\.tools\.|chat\.agent\.(?:sandbox\.|networkFilter$|allowedNetworkDomains$|deniedNetworkDomains$)|workbench\.browser\.enableChatTools$)/;
  assert.deepEqual(Object.keys(settings).filter((key) => permissionOverride.test(key)), []);
});