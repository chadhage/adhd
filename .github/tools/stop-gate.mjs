import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { factoryShutdownType, findApprovals, parseJsonLines } from './lib/approvals.mjs';
import { parseBoard } from './lib/board.mjs';

/**
 * Stop-gate for a Stop hook. Opt-in: it only acts when a board path is supplied
 * and exists. It blocks a stop unless a valid human Factory-shutdown approval is
 * recorded. It is NOT registered in tool-policy.json: harness support for Stop
 * hooks must be verified first.
 */
export function evaluateStop({ event = {}, boardPath, approvalsPath }) {
  if (!boardPath || !existsSync(boardPath)) {
    return { decision: 'allow', reason: 'Not a Factory workspace (no board).' };
  }

  const approvals = approvalsPath && existsSync(approvalsPath)
    ? findApprovals(parseJsonLines(readFileSync(approvalsPath, 'utf8')).entries, [factoryShutdownType])
    : [];
  if (approvals.length) {
    return { decision: 'allow', reason: `Factory shutdown approved by ${approvals.at(-1).approver}.` };
  }

  const board = parseBoard(readFileSync(boardPath, 'utf8'));
  const state = board.parsed
    ? `To Do=${board.todo}, In Progress=${board.inProgress}`
    : 'board could not be parsed, so unfinished work is unverified';

  if (event.stop_hook_active === true || event.stopHookActive === true) {
    return {
      decision: 'allow',
      reason: 'Stop allowed to avoid a hook loop. Record this as a suspected unapproved halt.',
      incident: { trigger: 'unapproved halt (suspected)', boardState: state },
    };
  }

  return {
    decision: 'block',
    reason: `No recorded human approval for a Factory-wide stop (${state}). Apply the pre-stop test in Factory MVP and Recovery: advance authorized work, block only the affected action, or make a Stoppage Request to the invoker.`,
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
    const { values } = parseArgs({ options: { board: { type: 'string' }, approvals: { type: 'string' } } });
    const result = evaluateStop({
      event: await readStdin(),
      boardPath: values.board && resolve(values.board),
      approvalsPath: values.approvals && resolve(values.approvals),
    });
    if (result.incident) process.stderr.write(`${JSON.stringify(result.incident)}\n`);
    process.stdout.write(`${JSON.stringify(formatStopResponse(result))}\n`);
  } catch (error) {
    process.stderr.write(`stop-gate error: ${error.message}\n`);
    process.exitCode = 2;
  }
}
