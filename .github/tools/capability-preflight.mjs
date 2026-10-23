import { accessSync, constants, existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { checkHookHealth } from './hook-health.mjs';
import { loadFactoryOps } from '../hooks/factory-ops.mjs';
import { validateSupervisorConfig } from './supervisor.mjs';

/** Parses VS Code style JSON with comments and trailing commas. */
export function parseJsonc(text) {
  let output = '';
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (inString) {
      output += char;
      if (char === '\\') output += text[++index];
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
      output += char;
    } else if (char === '/' && next === '/') {
      while (index < text.length && text[index] !== '\n') index += 1;
      output += '\n';
    } else if (char === '/' && next === '*') {
      index += 2;
      while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) index += 1;
      index += 1;
    } else {
      output += char;
    }
  }
  return JSON.parse(output.replace(/,(\s*[}\]])/g, '$1'));
}

/**
 * Read-only report of the capabilities a Factory depends on. Each entry names
 * its evidence, effect on unaffected work, and the owner decision that would
 * restore it. The tool changes no settings and grants no authority.
 */
export function runPreflight({
  root = process.cwd(),
  settingsPath = '.vscode/settings.json',
  recordsDir,
  supervisorConfig,
  unattended = false,
} = {}) {
  const capabilities = [];
  const add = (capability, status, evidence, effect, ownerDecision) =>
    capabilities.push({ capability, status, evidence, effect, ownerDecision });

  let settings = {};
  const ops = loadFactoryOps({ root, configPath: resolve(root, '.github/hooks/factory-ops.json') });
  const isUnattended = unattended || ops.unattended;
  const absoluteSettings = resolve(root, settingsPath);
  try {
    settings = parseJsonc(readFileSync(absoluteSettings, 'utf8'));
  } catch (error) {
    add('settings', 'unknown', `Could not read ${absoluteSettings}: ${error.message}`, 'Other settings-based findings are unverified.', 'Provide the effective settings.');
  }

  const nested = settings['chat.subagents.allowInvocationsFromSubagents'];
  if (nested === false) {
    add('nested-delegation', 'degraded', 'chat.subagents.allowInvocationsFromSubagents=false', 'Squad cannot mobilize Fullstackers beneath Factory; the Squad works in its recorded degraded mode.', 'Decide whether to enable nested delegation for Factory engagements.');
  } else if (nested === true) {
    add('nested-delegation', 'unknown', 'chat.subagents.allowInvocationsFromSubagents=true; configured value only, not a live capability observation.', 'Live Factory to Squad to Fullstacker delegation and delivery-leaf command tools remain unverified.', 'Observe one authorized Factory to Squad to Fullstacker invocation and verify the actual delivery-leaf tool surface under the effective host permissions.');
  } else {
    add('nested-delegation', 'unknown', 'Setting not present; the runtime default applies.', 'Unverified until a delegation is observed.', 'Confirm the effective runtime value.');
  }

  const permissionDefault = settings['chat.permissions.default'];
  const agentHostApprovalDefault = settings['chat.defaultConfiguration']?.approvals;
  const globalAutoApprove = settings['chat.tools.global.autoApprove'];
  add(
    'approval-availability',
    'unknown',
    `The active host/session permission level is not observable from workspace settings. Workspace permission default=${permissionDefault ?? 'inherited'}; Agent Host approval default=${agentHostApprovalDefault ?? 'inherited'}; global auto-approve=${globalAutoApprove ?? 'inherited'}.`,
    isUnattended
      ? `Host-permitted actions can proceed unattended. Actions the host still requires a human to approve remain blocked; ${ops.approvalQueuePath ? 'agents can record those requests in the approval queue' : 'no approval queue is configured'}. The pre-tool hook does not invent a denial or queue a permitted call. Authentication requiring human input remains blocked until the human completes it.`
      : 'All tools and subagents follow the effective host permissions. Reuse one session grant across every participating role and nested subagent without per-agent, per-card, or per-tool reapproval. Ask only for chosen prompt exceptions, host-required confirmation, or genuinely missing task authority.',
    'For session-autonomous operation, select Allow all (Bypass Approvals in older/Local hosts) once in the active session permissions picker. Use the native confirmation as the single initial tool-authorization gate; do not also request a chat approval. Choose Manual permissions for per-invocation or selective session tool approvals. Device authentication, CLI authentication, and other authentication requiring human input remain human-only. Verify parent and nested calls; workspace defaults alone do not prove approval. For a session-only choice, do not change workspace defaults or global auto-approval.',
  );

  const health = checkHookHealth({ root });
  add(
    'tool-policy-hook',
    health.ok ? 'ok' : 'degraded',
    health.checks.map((check) => `${check.ok ? 'pass' : 'FAIL'} ${check.name}`).join('; '),
    health.ok ? 'Hook decisions are deterministic.' : 'A failing hook can deny every tool call and halt all work.',
    health.ok ? 'None.' : 'Repair the hook through the normal reviewed change process.',
  );

  if (settings['chat.agent.sandbox.network.allowNetwork'] === false) {
    add('network-access', 'info', 'chat.agent.sandbox.network.allowNetwork=false', 'Work needing external network access is blocked; offline work continues.', 'Approve a narrowly scoped network exception only if a card needs it.');
  } else {
    add('network-access', 'unknown', 'The effective host sandbox and network policy is not observable from workspace settings.', 'Sandbox and network limits are inherited independently of tool approval permissions.', 'Inspect the active harness sandbox/network policy; do not infer network access from an autonomy grant.');
  }

  if (recordsDir) {
    const target = resolve(recordsDir);
    let writable = false;
    try {
      accessSync(target, constants.W_OK);
      writable = true;
    } catch {
      writable = false;
    }
    add('records-write-access', writable ? 'ok' : 'degraded', `${target} writable=${writable}`, writable ? 'Product-owned records can be updated.' : 'Boards and engagement records cannot be mutated; changes stay proposals.', writable ? 'None.' : 'Grant write access to the product-owned records location.');
  } else {
    add('records-write-access', 'unknown', 'No --records-dir supplied.', 'Unverified.', 'Supply the product-owned records directory.');
  }

  add(
    'scoped-board-writes',
    ops.problems.length ? 'degraded' : ops.boardPaths.length ? 'ok' : 'info',
    ops.problems.length ? ops.problems.join('; ') : `${ops.boardPaths.length} configured board file(s)`,
    'Board paths and structural checks do not grant tool approval; every board write follows the effective host permissions.',
    ops.problems.length ? 'Fix factory-ops.json through the reviewed change process.' : 'Configure exact board files for Factory operations; choose tool permissions in the host.',
  );

  if (supervisorConfig && existsSync(resolve(supervisorConfig))) {
    add('supervisor', 'ok', `Found ${resolve(supervisorConfig)}`, 'A supervisor is configured; its authorization and testing are verified separately.', 'Confirm the supervisor is authorized and tested.');
  } else if (ops.supervisor && validateSupervisorConfig(ops.supervisor).length === 0) {
    add('supervisor', 'ok', `Configured in factory-ops.json (owner ${ops.supervisor.owner}; deadline ${ops.supervisor.deadline.status}, retry ${ops.supervisor.retry.status}).`, 'Resumption can run when an external scheduler invokes supervisor.mjs tick; scheduling is verified separately.', 'Confirm the scheduler is installed and that provisional values are confirmed or replaced.');
  } else {
    add('supervisor', 'degraded', ops.supervisor ? `Invalid supervisor config: ${validateSupervisorConfig(ops.supervisor).join('; ')}` : 'No supervisor configuration found.', 'Unattended continuity is unavailable; a session end halts the Factory until a human resumes it.', 'Supply the owner-approved supervisor values and exact resume command, or accept attended operation.');
  }

  add('concurrency', 'unknown', 'Not detectable from the workspace.', 'Concurrent execution is claimed only when observed.', 'Report observed concurrency in the first cycle report.');

  return { generatedAt: new Date().toISOString(), degraded: capabilities.filter((entry) => entry.status === 'degraded').map((entry) => entry.capability), capabilities };
}

export function toMarkdown(report) {
  const rows = report.capabilities.map(
    (entry) => `| ${entry.capability} | ${entry.status} | ${entry.evidence} | ${entry.effect} | ${entry.ownerDecision} |`,
  );
  return ['| Capability | Status | Evidence | Effect | Owner decision |', '|---|---|---|---|---|', ...rows].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({
    options: {
      root: { type: 'string' },
      settings: { type: 'string' },
      'records-dir': { type: 'string' },
      'supervisor-config': { type: 'string' },
      unattended: { type: 'boolean' },
      format: { type: 'string' },
      strict: { type: 'boolean' },
    },
  });
  const report = runPreflight({
    ...(values.root ? { root: resolve(values.root) } : {}),
    ...(values.settings ? { settingsPath: values.settings } : {}),
    recordsDir: values['records-dir'],
    supervisorConfig: values['supervisor-config'],
    unattended: Boolean(values.unattended),
  });
  process.stdout.write(values.format === 'md' ? `${toMarkdown(report)}\n` : `${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = values.strict && report.degraded.length ? 1 : 0;
}
