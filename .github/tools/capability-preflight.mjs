import { accessSync, constants, existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { checkHookHealth } from './hook-health.mjs';

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
    add('nested-delegation', 'ok', 'chat.subagents.allowInvocationsFromSubagents=true', 'Factory to Squad to Fullstacker delegation is permitted.', 'None.');
  } else {
    add('nested-delegation', 'unknown', 'Setting not present; the runtime default applies.', 'Unverified until a delegation is observed.', 'Confirm the effective runtime value.');
  }

  const humanRequired = settings['chat.tools.global.autoApprove'] !== true;
  if (humanRequired && unattended) {
    add('approval-availability', 'degraded', 'Non-read tools ask for approval and the run is declared unattended.', 'A runtime with no interactive human treats ask as deny, so every non-read action blocks.', 'Decide how non-read approvals are handled when no human is present; do not weaken the gate without approval.');
  } else if (humanRequired) {
    add('approval-availability', 'info', 'Non-read tools ask for approval; a human is assumed present.', 'Pending approvals block only the exact action; queue them with approval-queue.mjs.', 'Stay reachable for approvals or declare the run unattended.');
  } else {
    add('approval-availability', 'info', 'Global auto-approve is enabled.', 'Approvals are not a halt vector, but the security gate is weakened.', 'Review whether global auto-approve is intended.');
  }

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

  if (supervisorConfig && existsSync(resolve(supervisorConfig))) {
    add('supervisor', 'ok', `Found ${resolve(supervisorConfig)}`, 'A supervisor is configured; its authorization and testing are verified separately.', 'Confirm the supervisor is authorized and tested.');
  } else {
    add('supervisor', 'degraded', 'No supervisor configuration found.', 'Unattended continuity is unavailable; a session end halts the Factory until a human resumes it.', 'Authorize a supervisor, or accept attended operation.');
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
