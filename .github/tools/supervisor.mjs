import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadFactoryOps } from '../hooks/factory-ops.mjs';
import { findApprovals, parseJsonLines, stoppageTypes } from './lib/approvals.mjs';
import { checkLiveness } from './liveness-check.mjs';
import { applyIfRevision, readWithRevision } from './revision-lock.mjs';

const nonEmpty = (value) => typeof value === 'string' && value.trim() !== '';
const positiveInteger = (value) => Number.isInteger(value) && value > 0;
const statuses = ['provisional', 'confirmed'];

/**
 * Every operating value must name its status and the source that produced it
 * (for example a baseline-calc.mjs result). There are no defaults: an arbitrary
 * retry count or deadline is exactly what the Factory contract forbids.
 */
export function validateSupervisorConfig(config) {
  const problems = [];
  if (!nonEmpty(config?.owner)) problems.push('owner is required');
  if (!nonEmpty(config?.authorizedBy)) problems.push('authorizedBy (source of the human authorization) is required');
  if (!nonEmpty(config?.resume?.command)) problems.push('resume.command is required');
  if (!Array.isArray(config?.resume?.args) || !config.resume.args.every((arg) => typeof arg === 'string')) {
    problems.push('resume.args must be an array of strings (no shell is used)');
  }
  for (const name of ['statePath', 'logPath', 'inhibitPath']) {
    if (!nonEmpty(config?.[name])) problems.push(`${name} is required`);
  }
  const bounded = [
    ['deadline', ['ms']],
    ['retry', ['maxRestarts', 'minIntervalMs']],
  ];
  for (const [section, fields] of bounded) {
    for (const field of fields) {
      if (!positiveInteger(config?.[section]?.[field])) {
        problems.push(`${section}.${field} must be a positive integer measured or approved by the owner (see baseline-calc.mjs)`);
      }
    }
    if (!statuses.includes(config?.[section]?.status)) problems.push(`${section}.status must be provisional or confirmed`);
    if (!nonEmpty(config?.[section]?.source)) problems.push(`${section}.source (where the value came from) is required`);
  }
  return problems;
}

async function appendLine(path, entry) {
  for (;;) {
    const snapshot = await readWithRevision(path);
    const prefix = snapshot.content === '' || snapshot.content.endsWith('\n') ? '' : '\n';
    const result = await applyIfRevision(path, snapshot.revision, `${snapshot.content}${prefix}${JSON.stringify(entry)}\n`, { owner: 'supervisor' });
    if (result.ok || result.reason !== 'revision-mismatch') return result;
  }
}

async function writeState(path, state, expectedRevision) {
  try {
    return await applyIfRevision(path, expectedRevision, `${JSON.stringify(state, null, 2)}\n`, { owner: 'supervisor' });
  } catch (error) {
    if (typeof error.code !== 'string') throw error;
    return { ok: false, reason: error.code };
  }
}

function isAlive(pid) {
  if (!Number.isInteger(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

const readIfPresent = (path) => (path && existsSync(path) ? readFileSync(path, 'utf8') : '');

async function readSupervisorState(path) {
  const snapshot = await readWithRevision(path);
  if (!snapshot.exists) return { ok: true, state: { restarts: [], childPid: null }, revision: snapshot.revision };
  let state;
  try {
    state = JSON.parse(snapshot.content);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { ok: false, reason: 'Supervisor state is not valid JSON; preserve it for explicit recovery.' };
  }
  const validPid = (pid) => pid === null || positiveInteger(pid);
  if (!state || typeof state !== 'object' || Array.isArray(state)
    || !Array.isArray(state.restarts) || !validPid(state.childPid)
    || !state.restarts.every((attempt) => attempt && typeof attempt === 'object'
      && typeof attempt.ts === 'string' && Number.isFinite(Date.parse(attempt.ts))
      && positiveInteger(attempt.attempt) && validPid(attempt.pid))) {
    return { ok: false, reason: 'Supervisor state has an invalid history or child PID; preserve it for explicit recovery.' };
  }
  return { ok: true, state, revision: snapshot.revision };
}

/**
 * One supervisor pass, meant to be run by an external scheduler. It resumes a
 * Factory only when unfinished work, no valid approval, and no progress within the
 * deadline all hold; never while inhibited, approved-stopped, or already running;
 * and never beyond the retry bounds. Default is a dry run.
 */
export async function tick({ ops = loadFactoryOps(), execute = false, now = Date.now(), spawnFn = nodeSpawn } = {}) {
  const supervisor = ops.supervisor;
  const finish = async (result) => {
    const entry = { ts: new Date(now).toISOString(), execute, ...result };
    if (supervisor && nonEmpty(supervisor.logPath) && result.status !== 'invalid-config') {
      await appendLine(resolve(ops.root, supervisor.logPath), entry);
    }
    return entry;
  };

  if (!supervisor) return { status: 'not-configured', exit: 3, reason: 'No supervisor is configured; unattended continuity is unavailable.' };
  const problems = validateSupervisorConfig(supervisor);
  if (problems.length) return { status: 'invalid-config', exit: 3, problems };
  const boards = ops.boardPaths.filter((path) => existsSync(path));
  if (!boards.length) return finish({ status: 'no-board', exit: 3, reason: 'No configured board file exists.' });

  if (existsSync(resolve(ops.root, supervisor.inhibitPath))) {
    return finish({ status: 'inhibited', exit: 0, reason: 'Inhibit file present: stop or revocation propagated; no restart.' });
  }
  const approvals = findApprovals(parseJsonLines(readIfPresent(ops.approvalsPath)).entries, stoppageTypes);
  if (approvals.length) {
    return finish({ status: 'stoppage-approved', exit: 0, reason: `Stoppage approved by ${approvals.at(-1).approver}; no restart.` });
  }

  const statePath = resolve(ops.root, supervisor.statePath);
  const loaded = await readSupervisorState(statePath);
  if (!loaded.ok) return finish({ status: 'state-recovery-required', exit: 3, reason: loaded.reason });
  const { state } = loaded;
  const liveness = checkLiveness({
    boardText: boards.map((path) => readFileSync(path, 'utf8')).join('\n'),
    progressText: readIfPresent(ops.progressPath),
    approvalsText: '',
    deadlineMs: supervisor.deadline.ms,
    deadlineStatus: supervisor.deadline.status,
    now,
    extraProgressMs: boards.map((path) => statSync(path).mtimeMs),
  });
  const lastRestart = state.restarts.length ? Date.parse(state.restarts.at(-1).ts) : 0;

  if (isAlive(state.childPid)) {
    if (liveness.status === 'halt-suspected' && now - lastRestart > supervisor.deadline.ms) {
      return finish({ status: 'child-stalled', exit: 1, incident: liveness.incident, reason: `Resumed run pid ${state.childPid} is alive but made no progress within the deadline. The supervisor never kills it; owner or Factory decides.` });
    }
    return finish({ status: 'child-running', exit: 0, reason: `Resumed run pid ${state.childPid} is still alive; no duplicate run.` });
  }

  if (liveness.status !== 'halt-suspected') {
    return finish({ status: liveness.status, exit: liveness.exit, reason: liveness.reason ?? 'Progress is within the deadline.' });
  }

  const lastProgress = Date.parse(liveness.lastProgress);
  const sinceProgress = state.restarts.filter((restart) => Date.parse(restart.ts) > lastProgress);
  if (sinceProgress.length >= supervisor.retry.maxRestarts) {
    return finish({ status: 'restart-limit-reached', exit: 1, incident: liveness.incident, reason: `${sinceProgress.length} restarts since last progress; owner decision required.` });
  }
  if (now - lastRestart < supervisor.retry.minIntervalMs) {
    return finish({ status: 'cooldown', exit: 0, reason: 'Within the minimum interval since the last restart.' });
  }
  if (!execute) {
    return finish({ status: 'would-restart', exit: 1, incident: liveness.incident, reason: 'Dry run: pass --execute to resume the Factory.' });
  }

  const attempt = { ts: new Date(now).toISOString(), attempt: state.restarts.length + 1, pid: null, phase: 'reserved' };
  state.restarts.push(attempt);
  state.childPid = null;
  const reservation = await writeState(statePath, state, loaded.revision);
  if (!reservation.ok) {
    return finish({
      status: 'state-reservation-failed',
      exit: 3,
      reason: `Could not reserve the restart attempt: ${reservation.reason}. No process was started.`,
    });
  }
  try {
    const child = spawnFn(supervisor.resume.command, supervisor.resume.args, {
      cwd: resolve(ops.root, supervisor.resume.cwd ?? '.'),
      detached: true,
      stdio: 'ignore',
      shell: false,
      windowsHide: true,
    });
    child.on?.('error', () => {});
    child.unref?.();
    attempt.pid = child.pid ?? null;
    // spawn reports a missing executable asynchronously; no pid means nothing started.
    if (!Number.isInteger(attempt.pid)) attempt.error = 'no-pid';
  } catch (error) {
    attempt.error = error.code ?? error.message;
  }
  attempt.phase = attempt.error ? 'failed' : 'started';
  state.childPid = attempt.pid;
  const recorded = await writeState(statePath, state, reservation.revision);
  if (!recorded.ok) {
    return finish({
      status: 'state-recovery-required',
      exit: 3,
      reason: `Could not record the launch result: ${recorded.reason}. Reconcile the reserved attempt before any retry.`,
      attempt,
    });
  }
  return finish({
    status: attempt.error ? 'spawn-failed' : 'restarted',
    exit: attempt.error ? 1 : 0,
    incident: liveness.incident,
    attempt,
    restartPacket: supervisor.restartPacketPath && existsSync(resolve(ops.root, supervisor.restartPacketPath)) ? 'present' : 'missing',
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: { config: { type: 'string' }, root: { type: 'string' }, execute: { type: 'boolean' } } });
    if (positionals[0] !== 'tick') throw new Error('Usage: supervisor.mjs tick [--execute] [--config <factory-ops.json>] [--root <workspace>]');
    const ops = loadFactoryOps({ ...(values.root ? { root: resolve(values.root) } : {}), ...(values.config ? { configPath: resolve(values.config) } : {}) });
    const result = await tick({ ops, execute: Boolean(values.execute) });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.exit;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
