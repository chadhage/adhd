import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const toolPath = (name) => join(repoRoot, '.github', 'tools', name);

export const headingBoard = '# Board\n\n## To Do\n\n### CARD-1 First\n- detail\n### CARD-2 Second\n\n## In Progress\n\n### CARD-3 Third\n';
export const emptyBoard = '## To Do\n\nNone\n\n## In Progress\n\n_None_\n';

export async function tempDir(t, prefix = 'adhd-test-') {
  const dir = await mkdtemp(join(os.tmpdir(), prefix));
  // Windows keeps a directory busy briefly while a child process using it winds down.
  t.after(() => rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }));
  return dir;
}

/** Runs a Node script as a real process and returns the spawnSync result. */
export function runNode(script, args = [], { input, cwd = repoRoot } = {}) {
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', input });
}

export const human = (type, extra = {}) =>
  JSON.stringify({ type, approverKind: 'human', approver: 'Chad', source: 'chat 2026-10-13', ts: '2026-10-13T12:00:00Z', ...extra });

/**
 * Copies the real hooks and tools into a temporary workspace so acceptance tests
 * can drive the shipped scripts as black boxes against a product-like layout.
 */
export async function installWorkspace(t, config = {}, { board = headingBoard } = {}) {
  const root = await tempDir(t, 'adhd-ws-');
  const filter = (source) => !source.includes(join('.github', 'tools', 'tests')) && !source.includes(join('.github', 'hooks', 'tests'));
  await cp(join(repoRoot, '.github', 'hooks'), join(root, '.github', 'hooks'), { recursive: true, filter });
  await cp(join(repoRoot, '.github', 'tools'), join(root, '.github', 'tools'), { recursive: true, filter });
  await mkdir(join(root, '.docs'), { recursive: true });
  await writeFile(join(root, '.docs', 'kanban.md'), board);
  await writeFile(
    join(root, '.github', 'hooks', 'factory-ops.json'),
    JSON.stringify({
      version: 1,
      boardPaths: ['.docs/kanban.md'],
      approvalsPath: '.docs/approvals.jsonl',
      approvalQueuePath: '.docs/queue.jsonl',
      progressPath: '.docs/progress.jsonl',
      ...config,
    }),
  );
  return {
    root,
    docs: (name) => join(root, '.docs', name),
    hook: (event, input) => runNode(join(root, '.github', 'hooks', 'pre-tool-policy.mjs'), [event], { input: JSON.stringify(input), cwd: root }),
    tool: (name, args = [], input) => runNode(join(root, '.github', 'tools', name), args, { input, cwd: root }),
    stop: (payload = {}) => runNode(join(root, '.github', 'tools', 'stop-gate.mjs'), [], { input: JSON.stringify(payload), cwd: root }),
  };
}

export async function installProductWorkspace(t, config = {}, { board = headingBoard } = {}) {
  const root = await tempDir(t, 'adhd product-');
  const recordsDir = join(root, '.docs');
  const configPath = join(root, '.github', 'hooks', 'factory-ops.json');
  const hookScript = join(repoRoot, '.github', 'hooks', 'pre-tool-policy.mjs');
  await mkdir(recordsDir, { recursive: true });
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(join(recordsDir, 'kanban.md'), board);
  await writeFile(
    configPath,
    JSON.stringify({
      version: 1,
      boardPaths: ['.docs/kanban.md'],
      approvalsPath: '.docs/approvals.jsonl',
      approvalQueuePath: '.docs/queue.jsonl',
      progressPath: '.docs/progress.jsonl',
      ...config,
    }),
  );
  const binding = ['--root', root, '--config', configPath];
  return {
    root,
    configPath,
    hookScript,
    referenceRoot: repoRoot,
    docs: (name) => join(recordsDir, name),
    hook: (event, input, { args = [], cwd = repoRoot } = {}) =>
      runNode(hookScript, [event, ...binding, ...args], { input: JSON.stringify(input), cwd }),
    tool: (name, args = [], input) => runNode(toolPath(name), [...args, ...binding], { input, cwd: repoRoot }),
    stop: (payload = {}) => runNode(toolPath('stop-gate.mjs'), binding, { input: JSON.stringify(payload), cwd: repoRoot }),
  };
}
