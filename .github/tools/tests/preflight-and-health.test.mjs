import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { parseJsonc, runPreflight, toMarkdown } from '../capability-preflight.mjs';
import { checkHookHealth } from '../hook-health.mjs';
import { installWorkspace, repoRoot, tempDir } from './helpers.mjs';

const supervisor = {
  owner: 'chadhage',
  authorizedBy: 'chat 2026-10-13',
  resume: { command: 'resume-tool', args: [], cwd: '.' },
  restartPacketPath: '.docs/restart.md',
  statePath: '.docs/state.json',
  logPath: '.docs/log.jsonl',
  inhibitPath: '.docs/INHIBIT',
  deadline: { ms: 1000, status: 'provisional', source: 'baseline-calc' },
  retry: { maxRestarts: 2, minIntervalMs: 1000, status: 'provisional', source: 'owner' },
};

async function withSettings(t, settings, config) {
  const ws = await installWorkspace(t, config);
  const settingsPath = join(ws.root, 'settings.json');
  await writeFile(settingsPath, typeof settings === 'string' ? settings : JSON.stringify(settings));
  return { ws, settingsPath };
}
const find = (report, name) => report.capabilities.find((entry) => entry.capability === name);
const status = (report, name) => find(report, name).status;

// ---- jsonc ----

test('positive: the jsonc parser tolerates comments and trailing commas without touching strings', () => {
  assert.deepEqual(parseJsonc('{ // note\n "a": "x // not a comment", /* b */ "b": [1,2,], "c": "q\\"//" }'), { a: 'x // not a comment', b: [1, 2], c: 'q"//' });
});

test('negative: the jsonc parser still rejects genuinely invalid JSON', () => {
  assert.throws(() => parseJsonc('{ "a": }'));
  assert.throws(() => parseJsonc('{ "a": 1 /* never closed'));
});

// ---- preflight ----

test('positive: nested delegation enabled, records writable, and a valid supervisor are all ok', async (t) => {
  const { ws, settingsPath } = await withSettings(t, { 'chat.subagents.allowInvocationsFromSubagents': true }, { supervisor });
  const report = runPreflight({ root: ws.root, settingsPath, recordsDir: ws.docs('') });
  assert.equal(status(report, 'nested-delegation'), 'ok');
  assert.equal(status(report, 'records-write-access'), 'ok');
  assert.equal(status(report, 'supervisor'), 'ok');
  assert.equal(status(report, 'tool-policy-hook'), 'ok');
  assert.deepEqual(report.degraded, []);
});

test('positive: configured board files are reported without promising prompt-free approval', async (t) => {
  const { ws, settingsPath } = await withSettings(t, {});
  const entry = find(runPreflight({ root: ws.root, settingsPath }), 'scoped-board-writes');
  assert.equal(entry.status, 'ok');
  assert.match(entry.evidence, /1 configured/);
  assert.match(entry.effect, /do not grant tool approval/);
});

test('negative: unattended mode with a queue does not imply that host-permitted calls are blocked', async (t) => {
  const { ws, settingsPath } = await withSettings(t, {}, { unattended: true });
  const entry = find(runPreflight({ root: ws.root, settingsPath }), 'approval-availability');
  assert.equal(entry.status, 'unknown');
  assert.match(entry.effect, /Host-permitted actions can proceed unattended/);
  assert.match(entry.effect, /agents can record those requests in the approval queue/);
});

test('positive: an explicit supervisor config file is accepted', async (t) => {
  const { ws, settingsPath } = await withSettings(t, {});
  const file = join(ws.root, 'sup.json');
  await writeFile(file, '{}');
  assert.equal(status(runPreflight({ root: ws.root, settingsPath, supervisorConfig: file }), 'supervisor'), 'ok');
});

test('positive: the markdown report has one row per capability', async (t) => {
  const { ws, settingsPath } = await withSettings(t, { 'chat.agent.sandbox.network.allowNetwork': false });
  const report = runPreflight({ root: ws.root, settingsPath });
  assert.equal(toMarkdown(report).split('\n').length, report.capabilities.length + 2);
  assert.equal(status(report, 'network-access'), 'info');
});

test('negative: a global auto-approve workspace setting does not prove the active session permission level', async (t) => {
  const { ws, settingsPath } = await withSettings(t, { 'chat.tools.global.autoApprove': true });
  const entry = find(runPreflight({ root: ws.root, settingsPath }), 'approval-availability');
  assert.equal(entry.status, 'unknown');
  assert.match(entry.evidence, /global auto-approve=true/);
  assert.match(entry.effect, /effective host permissions/);
});

test('negative: workspace permission defaults cannot be mistaken for an active autonomy grant', async (t) => {
  const { ws, settingsPath } = await withSettings(t, { 'chat.permissions.default': 'autopilot' });
  const entry = find(runPreflight({ root: ws.root, settingsPath }), 'approval-availability');
  assert.equal(entry.status, 'unknown');
  assert.match(entry.evidence, /Workspace permission default=autopilot/);
  assert.match(entry.ownerDecision, /workspace defaults alone do not prove approval/);
});

test('negative: an absent workspace sandbox setting does not prove network access', async (t) => {
  const { ws, settingsPath } = await withSettings(t, {});
  const entry = find(runPreflight({ root: ws.root, settingsPath }), 'network-access');
  assert.equal(entry.status, 'unknown');
  assert.match(entry.effect, /independently of tool approval/);
});

test('negative: nested delegation disabled is degraded with an owner decision', async (t) => {
  const { ws, settingsPath } = await withSettings(t, { 'chat.subagents.allowInvocationsFromSubagents': false });
  const entry = find(runPreflight({ root: ws.root, settingsPath }), 'nested-delegation');
  assert.equal(entry.status, 'degraded');
  assert.match(entry.ownerDecision, /Decide whether/);
});

test('negative: an absent nested delegation setting is unknown, not assumed', async (t) => {
  const { ws, settingsPath } = await withSettings(t, {});
  assert.equal(status(runPreflight({ root: ws.root, settingsPath }), 'nested-delegation'), 'unknown');
});

test('negative: unreadable settings are reported as unknown rather than ignored', async (t) => {
  const { ws } = await withSettings(t, {});
  const report = runPreflight({ root: ws.root, settingsPath: 'missing-settings.json' });
  assert.equal(status(report, 'settings'), 'unknown');
});

test('negative: an unattended run without a queue cannot claim host approval or automatic queueing', async (t) => {
  const { ws, settingsPath } = await withSettings(t, {}, { approvalQueuePath: null });
  const entry = find(runPreflight({ root: ws.root, settingsPath, unattended: true }), 'approval-availability');
  assert.equal(entry.status, 'unknown');
  assert.match(entry.effect, /no approval queue/);
});

test('negative: an unwritable or missing records directory is degraded', async (t) => {
  const { ws, settingsPath } = await withSettings(t, {});
  assert.equal(status(runPreflight({ root: ws.root, settingsPath, recordsDir: join(ws.root, 'nope') }), 'records-write-access'), 'degraded');
});

test('negative: no records directory supplied is unknown', async (t) => {
  const { ws, settingsPath } = await withSettings(t, {});
  assert.equal(status(runPreflight({ root: ws.root, settingsPath }), 'records-write-access'), 'unknown');
});

test('negative: no supervisor configured is degraded', async (t) => {
  const { ws, settingsPath } = await withSettings(t, {});
  const entry = find(runPreflight({ root: ws.root, settingsPath }), 'supervisor');
  assert.equal(entry.status, 'degraded');
  assert.match(entry.evidence, /No supervisor configuration/);
});

test('negative: an invalid supervisor config is degraded and lists what is missing', async (t) => {
  const { ws, settingsPath } = await withSettings(t, {}, { supervisor: { owner: 'x' } });
  const entry = find(runPreflight({ root: ws.root, settingsPath }), 'supervisor');
  assert.equal(entry.status, 'degraded');
  assert.match(entry.evidence, /authorizedBy/);
});

test('negative: a config problem degrades scoped board writes and names the problem', async (t) => {
  const { ws, settingsPath } = await withSettings(t, {}, { boardPaths: ['../outside.md'] });
  const entry = find(runPreflight({ root: ws.root, settingsPath }), 'scoped-board-writes');
  assert.equal(entry.status, 'degraded');
  assert.match(entry.evidence, /escapes the workspace/);
});

test('negative: an empty board configuration does not force an approval prompt', async (t) => {
  const { ws, settingsPath } = await withSettings(t, {}, { boardPaths: [] });
  const entry = find(runPreflight({ root: ws.root, settingsPath }), 'scoped-board-writes');
  assert.equal(entry.status, 'info');
  assert.match(entry.effect, /every board write follows the effective host permissions/);
});

test('negative: concurrency is never asserted from the workspace', async (t) => {
  const { ws, settingsPath } = await withSettings(t, {});
  assert.equal(status(runPreflight({ root: ws.root, settingsPath }), 'concurrency'), 'unknown');
});

test('negative: a broken hook degrades the preflight', async (t) => {
  const { ws, settingsPath } = await withSettings(t, {});
  await writeFile(join(ws.root, '.github', 'hooks', 'pre-tool-policy.mjs'), 'process.exit(1);\n');
  const report = runPreflight({ root: ws.root, settingsPath });
  assert.equal(status(report, 'tool-policy-hook'), 'degraded');
  assert.ok(report.degraded.includes('tool-policy-hook'));
});

// ---- hook health ----

const readHook = `let s='';for await (const c of process.stdin) s+=c;`;
const hooks = {
  allowAll: `${readHook}console.log(JSON.stringify({permissionDecision:'allow'}));`,
  askAll: `${readHook}console.log(JSON.stringify({permissionDecision:'ask'}));`,
  failOpen: `${readHook}try{const e=JSON.parse(s);console.log(JSON.stringify({permissionDecision:/read/i.test(e.toolName)?'allow':'ask'}));}catch{console.log('{}');}`,
  stopBlocks: `${readHook}console.log(JSON.stringify({decision:'block',reason:'always'}));`,
  stopCrashes: 'process.exit(3);',
};

async function brokenWorkspace(t, mutate) {
  const ws = await installWorkspace(t);
  const configPath = join(ws.root, '.github', 'hooks', 'tool-policy.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  await mutate(ws, config);
  await writeFile(configPath, JSON.stringify(config));
  return ws;
}
const failed = (report) => report.checks.filter((check) => !check.ok).map((check) => check.name);

test('positive: the shipped hook is healthy in this repository', () => {
  const report = checkHookHealth({ root: repoRoot });
  assert.equal(report.ok, true, JSON.stringify(failed(report)));
  assert.ok(report.checks.length >= 12);
});

test('negative: an unreadable hook config fails fast', async (t) => {
  const report = checkHookHealth({ root: await tempDir(t) });
  assert.equal(report.ok, false);
  assert.deepEqual(failed(report), ['config-readable']);
});

for (const eventName of ['preToolUse', 'postToolUse', 'subagentStart', 'agentStop']) {
  test(`negative: a missing ${eventName} registration is reported`, async (t) => {
    const ws = await brokenWorkspace(t, (_, config) => {
      delete config.hooks[eventName];
    });
    assert.ok(failed(checkHookHealth({ root: ws.root })).includes(`registered:${eventName}`));
  });
}

test('negative: a preToolUse command that is not a node script cannot resolve', async (t) => {
  const ws = await brokenWorkspace(t, (_, config) => {
    config.hooks.preToolUse[0].command = 'echo nothing';
  });
  assert.ok(failed(checkHookHealth({ root: ws.root })).includes('script-resolves-from-root'));
});

test('negative: a hook script that does not exist from the workspace root is reported', async (t) => {
  const ws = await brokenWorkspace(t, (_, config) => {
    config.hooks.preToolUse[0].command = 'node .github/hooks/missing.mjs preToolUse';
  });
  const report = checkHookHealth({ root: ws.root });
  assert.equal(report.ok, false);
  assert.ok(failed(report).includes('script-resolves-from-root'));
});

test('negative: a hook that allows non-read tools fails the policy check', async (t) => {
  const ws = await brokenWorkspace(t, async (w) => writeFile(join(w.root, '.github', 'hooks', 'pre-tool-policy.mjs'), hooks.allowAll));
  assert.ok(failed(checkHookHealth({ root: ws.root })).includes('inherits-non-read-permissions'));
});

test('negative: a hook that forces every call to ask also fails host permission inheritance', async (t) => {
  const ws = await brokenWorkspace(t, async (w) => writeFile(join(w.root, '.github', 'hooks', 'pre-tool-policy.mjs'), hooks.askAll));
  assert.ok(failed(checkHookHealth({ root: ws.root })).includes('inherits-non-read-permissions'));
});

for (const [label, output] of [
  ['malformed JSON', 'not-json'],
  ['a null output', 'null'],
  ['an array output', '[]'],
  ['a scalar output', '1'],
  ['a stop decision', '{"continue":false}'],
  ['a nested approval', '{"hookSpecificOutput":{"permissionDecision":"allow"}}'],
]) {
  test(`negative: health probes reject ${label} instead of mistaking it for inheritance`, async (t) => {
    const ws = await brokenWorkspace(t, async (w) =>
      writeFile(join(w.root, '.github', 'hooks', 'pre-tool-policy.mjs'), `${readHook}console.log(${JSON.stringify(output)});`));
    assert.ok(failed(checkHookHealth({ root: ws.root })).includes('inherits-read-permissions'));
  });
}

test('negative: a hook that fails open on malformed input is caught', async (t) => {
  const ws = await brokenWorkspace(t, async (w) => writeFile(join(w.root, '.github', 'hooks', 'pre-tool-policy.mjs'), hooks.failOpen));
  assert.ok(failed(checkHookHealth({ root: ws.root })).includes('fails-closed-on-malformed-input'));
});

test('negative: a hook slower than its configured timeout is reported', async (t) => {
  const ws = await brokenWorkspace(t, (_, config) => {
    config.hooks.preToolUse[0].timeoutSec = 0.000001;
  });
  assert.ok(failed(checkHookHealth({ root: ws.root })).includes('latency-within-configured-timeout'));
});

test('negative: a missing timeout is reported rather than assumed', async (t) => {
  const ws = await brokenWorkspace(t, (_, config) => {
    delete config.hooks.preToolUse[0].timeoutSec;
  });
  assert.ok(failed(checkHookHealth({ root: ws.root })).includes('latency-within-configured-timeout'));
});

test('negative: a stop gate that blocks even a forced retry could trap a session and is caught', async (t) => {
  const ws = await brokenWorkspace(t, async (w) => writeFile(join(w.root, '.github', 'tools', 'stop-gate.mjs'), hooks.stopBlocks));
  assert.ok(failed(checkHookHealth({ root: ws.root })).includes('stop-gate-runs-and-never-traps'));
});

test('negative: a crashing stop gate is caught', async (t) => {
  const ws = await brokenWorkspace(t, async (w) => writeFile(join(w.root, '.github', 'tools', 'stop-gate.mjs'), hooks.stopCrashes));
  assert.ok(failed(checkHookHealth({ root: ws.root })).includes('stop-gate-runs-and-never-traps'));
});

test('negative: an agentStop command that does not resolve is caught', async (t) => {
  const ws = await brokenWorkspace(t, (_, config) => {
    config.hooks.agentStop[0].command = 'node .github/tools/missing-gate.mjs';
  });
  assert.ok(failed(checkHookHealth({ root: ws.root })).includes('stop-gate-runs-and-never-traps'));
});

test('negative: an invalid factory-ops config is surfaced by the health check', async (t) => {
  const ws = await installWorkspace(t, { boardPaths: ['.vscode/board.md'] });
  const report = checkHookHealth({ root: ws.root });
  assert.ok(failed(report).includes('factory-ops-config-valid'));
});

test('negative: unattended health probes never create an operational approval queue', async (t) => {
  const ws = await installWorkspace(t, { unattended: true });
  assert.equal(existsSync(ws.docs('queue.jsonl')), false);
  checkHookHealth({ root: ws.root });
  assert.equal(existsSync(ws.docs('queue.jsonl')), false);
});

test('positive: a healthy unattended policy is not mistaken for an attended policy failure', async (t) => {
  const ws = await installWorkspace(t, { unattended: true });
  const report = checkHookHealth({ root: ws.root });
  assert.equal(report.ok, true, JSON.stringify(failed(report)));
});

test('negative: preflight does not append probes to an existing operational queue', async (t) => {
  const { ws, settingsPath } = await withSettings(t, {}, { unattended: true });
  const initial = `${JSON.stringify({ type: 'request', id: 'EXISTING', purpose: 'synthetic fixture' })}\n`;
  await writeFile(ws.docs('queue.jsonl'), initial);
  runPreflight({ root: ws.root, settingsPath });
  assert.equal(await readFile(ws.docs('queue.jsonl'), 'utf8'), initial);
});
