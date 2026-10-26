import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadFactoryOps } from '../hooks/factory-ops.mjs';
import { factoryShutdownType, findApprovals, parseJsonLines } from './lib/approvals.mjs';
import { parseBoard } from './lib/board.mjs';

const readIfPresent = (path) => (path && existsSync(path) ? readFileSync(path, 'utf8') : '');

/** Pending queue requests are decisions a human still owes; the agent may yield for them. */
export function pendingDecisions(queueText) {
  const requests = new Map();
  for (const entry of parseJsonLines(queueText).entries) {
    if (entry.type === 'request') requests.set(entry.id, 'pending');
    else if (entry.type === 'decision' && requests.has(entry.id)) requests.set(entry.id, entry.decision);
  }
  return [...requests].filter(([, status]) => status === 'pending').map(([id]) => id);
}

/**
 * Gate for the `agentStop` hook. That event fires at the end of every main-agent
 * turn, not at session end, so a turn that legitimately yields to a human must
 * pass. An explicitly bounded profile may return without closing the Factory.
 * Opt-in: it only acts when a configured board file exists. A continuous turn may end
 * when a valid human Factory-shutdown approval exists, or when a human decision
 * is pending in the approval queue. Otherwise the first attempt is blocked and
 * the forced retry is released (stop_hook_active) and reported as a suspected
 * unapproved halt, so the gate can never trap a session.
 */
export function evaluateStop({ event = {}, boardPaths = [], approvalsPath, queuePath, operatingProfile = null }) {
  const boards = boardPaths.filter((path) => existsSync(path));
  if (!boards.length) return { decision: 'allow', reason: 'Not a Factory workspace (no configured board).' };

  if (operatingProfile === 'bounded') {
    return {
      decision: 'allow',
      reason: 'Bounded turn may return; this is not Factory shutdown approval. The coordinator must retain its checkpoint, next owner and resume route.',
    };
  }

  const approvals = findApprovals(parseJsonLines(readIfPresent(approvalsPath)).entries, [factoryShutdownType]);
  if (approvals.length) return { decision: 'allow', reason: `Factory shutdown approved by ${approvals.at(-1).approver}.` };

  const pending = pendingDecisions(readIfPresent(queuePath));
  if (pending.length) return { decision: 'allow', reason: `Yielding to the human: pending decisions ${pending.join(', ')}.` };

  const counts = boards.map((path) => parseBoard(readFileSync(path, 'utf8')));
  const state = counts.every((board) => board.parsed)
    ? `To Do=${counts.reduce((sum, board) => sum + board.todo, 0)}, In Progress=${counts.reduce((sum, board) => sum + board.inProgress, 0)}`
    : 'a board could not be parsed, so unfinished work is unverified';

  if (event.stop_hook_active === true || event.stopHookActive === true) {
    return {
      decision: 'allow',
      reason: 'Turn end allowed to avoid a hook loop. Record this as a suspected unapproved halt.',
      incident: { trigger: 'unapproved halt (suspected)', boardState: state },
    };
  }

  return {
    decision: 'block',
    reason: `Do not stop yet: no recorded human approval for a Factory-wide stop (${state}). Apply the pre-stop test in Factory MVP and Recovery. Advance authorized work, or block only the affected action. If you need a human decision, record it with .github/tools/approval-queue.mjs enqueue (or ask the invoker a Yes/No question), then end your turn. For a stoppage, make the Stoppage Request to the invoker.`,
  };
}

export function formatStopResponse(result) {
  return result.decision === 'block' ? { decision: 'block', reason: result.reason } : {};
}

async function readStdin() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  return input.trim() === '' ? {} : JSON.parse(input);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({
      options: { config: { type: 'string' }, root: { type: 'string' }, board: { type: 'string' }, approvals: { type: 'string' }, queue: { type: 'string' } },
    });
    const ops = loadFactoryOps({ ...(values.root ? { root: resolve(values.root) } : {}), ...(values.config ? { configPath: resolve(values.config) } : {}) });
    if (ops.problems.length) process.stderr.write(`Stop configuration warning: ${ops.problems.join('; ')}\n`);
    const result = evaluateStop({
      event: await readStdin(),
      boardPaths: values.board ? [resolve(values.board)] : ops.boardPaths,
      approvalsPath: values.approvals ? resolve(values.approvals) : ops.approvalsPath,
      queuePath: values.queue ? resolve(values.queue) : ops.approvalQueuePath,
      operatingProfile: ops.operatingProfile,
    });
    if (result.incident) process.stderr.write(`${JSON.stringify(result.incident)}\n`);
    process.stdout.write(`${JSON.stringify(formatStopResponse(result))}\n`);
  } catch (error) {
    process.stderr.write(`stop-gate error: ${error.message}\n`);
    process.exitCode = 2;
  }
}
