import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadFactoryOps } from '../hooks/factory-ops.mjs';

const requiredEvents = ['preToolUse', 'postToolUse', 'subagentStart', 'agentStop'];

function runHook(root, scriptPath, eventName, input) {
  const started = performance.now();
  const result = spawnSync(process.execPath, [scriptPath, eventName], {
    cwd: root,
    encoding: 'utf8',
    input,
  });
  return { ...result, elapsedMs: performance.now() - started };
}

function inheritsPermissions(result) {
  if (result.status !== 0) return false;
  try {
    const output = JSON.parse(result.stdout);
    return output !== null && !Array.isArray(output) && typeof output === 'object' && Object.keys(output).length === 0;
  } catch {
    return false;
  }
}

/**
 * Read-only health check of the workspace hook. It exercises the hook as the
 * runtime would and never changes the fail-closed policy it verifies.
 */
export function checkHookHealth({ root = process.cwd(), configPath = '.github/hooks/tool-policy.json' } = {}) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });
  const absoluteConfig = resolve(root, configPath);

  let config;
  try {
    config = JSON.parse(readFileSync(absoluteConfig, 'utf8'));
    add('config-readable', true, absoluteConfig);
  } catch (error) {
    add('config-readable', false, error.message);
    return { ok: false, checks };
  }

  let scriptPath;
  for (const eventName of requiredEvents) {
    const entries = config.hooks?.[eventName] ?? [];
    add(`registered:${eventName}`, entries.length === 1, `${entries.length} entries`);
  }
  const preToolUse = config.hooks?.preToolUse?.[0];
  const scriptMatch = /node\s+(\S+\.mjs)/.exec(preToolUse?.command ?? '');
  if (scriptMatch) {
    scriptPath = resolve(root, scriptMatch[1]);
    add('script-resolves-from-root', existsSync(scriptPath), `${scriptMatch[1]} relative to ${root}`);
  } else {
    add('script-resolves-from-root', false, 'No node .mjs command found for preToolUse');
  }
  if (!scriptPath || !existsSync(scriptPath)) return { ok: false, checks };

  const read = runHook(root, scriptPath, 'preToolUse', JSON.stringify({ toolName: 'read', toolArgs: {} }));
  add('inherits-read-permissions', inheritsPermissions(read), 'Valid calls must return an empty JSON object, leaving approval to the host.');

  const write = runHook(root, scriptPath, 'preToolUse', JSON.stringify({ toolName: 'powershell', toolArgs: { command: 'x' } }));
  add('inherits-non-read-permissions', inheritsPermissions(write), 'Execution must neither be pre-approved nor forced to ask by this hook.');

  const protectedEdit = runHook(root, scriptPath, 'preToolUse', JSON.stringify({
    hook_event_name: 'PreToolUse',
    tool_name: 'edit',
    tool_input: { path: '.github/agents/example.agent.md' },
  }));
  add('inherits-protected-path-permissions', inheritsPermissions(protectedEdit), 'Protected-path approvals also follow the invoker-selected host permissions.');

  const malformed = runHook(root, scriptPath, 'preToolUse', 'not-json');
  add('fails-closed-on-malformed-input', malformed.status === 2, `exit=${malformed.status}`);

  const timeoutSec = preToolUse.timeoutSec;
  const limitMs = typeof timeoutSec === 'number' ? timeoutSec * 1000 : undefined;
  const slowest = Math.max(read.elapsedMs, write.elapsedMs, protectedEdit.elapsedMs);
  add(
    'latency-within-configured-timeout',
    limitMs !== undefined && slowest < limitMs,
    `slowest=${Math.round(slowest)}ms timeout=${limitMs ?? 'unset'}ms`,
  );

  const stopScript = /node\s+(\S+\.mjs)/.exec(config.hooks?.agentStop?.[0]?.command ?? '');
  const stopPath = stopScript && resolve(root, stopScript[1]);
  if (stopPath && existsSync(stopPath)) {
    const stop = spawnSync(process.execPath, [stopPath], {
      cwd: root,
      encoding: 'utf8',
      input: JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: true, cwd: root }),
    });
    add('stop-gate-runs-and-never-traps', stop.status === 0 && !/"block"/.test(stop.stdout), `exit=${stop.status}`);
  } else {
    add('stop-gate-runs-and-never-traps', false, 'agentStop command does not resolve from the workspace root');
  }

  const ops = loadFactoryOps({ root, configPath: resolve(root, '.github/hooks/factory-ops.json') });
  add('factory-ops-config-valid', ops.problems.length === 0, ops.problems.join('; ') || 'no problems');

  return { ok: checks.every((check) => check.ok), checks };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { root: { type: 'string' }, config: { type: 'string' } } });
  const report = checkHookHealth({
    root: values.root ? resolve(values.root) : process.cwd(),
    ...(values.config ? { configPath: values.config } : {}),
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.ok ? 0 : 1;
}
