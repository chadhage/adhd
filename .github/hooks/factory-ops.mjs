import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBoard } from '../tools/lib/board.mjs';

const hooksDir = dirname(fileURLToPath(import.meta.url));
export const defaultRoot = resolve(hooksDir, '..', '..');
export const defaultConfigPath = resolve(hooksDir, 'factory-ops.json');

// Instruction, policy, and secret locations may never be made writable without a prompt.
// `.docs/` is deliberately absent: exact board files there can be allowlisted.
const forbiddenBoardTarget =
  /(?:\.github[\\/](?:agents|skills|hooks|tools)[\\/]|\.github[\\/]copilot-instructions\.md|\.vscode[\\/]|\bCODEOWNERS\b|\.env(?:$|[./\\])|(?:^|[./\\])(?:secrets?|credentials?|tokens?|private[-_ ]?keys?)(?:$|[./\\_-])|\.(?:pem|p12|pfx|key)$)/i;
const extraBucketNames = new Set(['done', 'completed', 'complete', 'archive', 'archived', 'finished', 'closed']);
const pathKeys = ['path', 'filePath', 'file_path'];

const emptyOps = (problems = []) => ({
  root: defaultRoot,
  boardPaths: [],
  approvalsPath: null,
  approvalQueuePath: null,
  progressPath: null,
  unattended: false,
  supervisor: null,
  problems,
});

const comparable = (path) => (process.platform === 'win32' ? path.toLowerCase() : path);

/** Resolves symlinks for existing paths, and for the parent directory of a new file. */
export function canonicalPath(path) {
  const absolute = resolve(path);
  try {
    return realpathSync.native(absolute);
  } catch {
    try {
      return resolve(realpathSync.native(dirname(absolute)), basename(absolute));
    } catch {
      return absolute;
    }
  }
}

/**
 * Loads the workspace Factory operations config. Never throws: a missing or
 * malformed file yields an empty (most restrictive) configuration plus problems.
 */
export function loadFactoryOps({ root = defaultRoot, configPath = defaultConfigPath } = {}) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    return { ...emptyOps([`Could not read ${configPath}: ${error.code ?? error.message}`]), root };
  }
  if (!raw || typeof raw !== 'object' || raw.version !== 1) {
    return { ...emptyOps(['factory-ops.json must be an object with version 1']), root };
  }

  const problems = [];
  const optionalPath = (value, name) => {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string' || value.trim() === '') {
      problems.push(`${name} must be a non-empty string or null`);
      return null;
    }
    return resolve(root, value);
  };
  const approvalsPath = optionalPath(raw.approvalsPath, 'approvalsPath');
  const approvalQueuePath = optionalPath(raw.approvalQueuePath, 'approvalQueuePath');
  const progressPath = optionalPath(raw.progressPath, 'progressPath');
  const reserved = new Set(
    [approvalsPath, approvalQueuePath, progressPath, configPath].filter(Boolean).map((p) => comparable(canonicalPath(p))),
  );

  const boardPaths = [];
  for (const entry of Array.isArray(raw.boardPaths) ? raw.boardPaths : []) {
    if (typeof entry !== 'string' || entry.trim() === '') {
      problems.push('boardPaths entries must be non-empty strings');
      continue;
    }
    const absolute = resolve(root, entry);
    const canonical = canonicalPath(absolute);
    const inside = relative(canonicalPath(root), canonical);
    if (inside === '' || inside.startsWith('..') || resolve(inside) === inside) {
      problems.push(`boardPaths entry escapes the workspace: ${entry}`);
    } else if (!/\.md$/i.test(canonical)) {
      problems.push(`boardPaths entry must be a .md file: ${entry}`);
    } else if (forbiddenBoardTarget.test(canonical) || forbiddenBoardTarget.test(absolute)) {
      problems.push(`boardPaths entry targets a protected or sensitive location: ${entry}`);
    } else if (reserved.has(comparable(canonical))) {
      problems.push(`boardPaths entry collides with an approvals, queue, progress, or config file: ${entry}`);
    } else {
      boardPaths.push(canonical);
    }
  }

  return {
    root,
    boardPaths,
    approvalsPath,
    approvalQueuePath,
    progressPath,
    unattended: raw.unattended === true,
    supervisor: raw.supervisor && typeof raw.supervisor === 'object' ? raw.supervisor : null,
    problems,
  };
}

function distinctTargets(toolInput) {
  const values = new Set();
  for (const key of pathKeys) {
    if (typeof toolInput?.[key] === 'string') values.add(toolInput[key]);
  }
  return [...values];
}

function firstString(input, keys) {
  for (const key of keys) {
    if (typeof input?.[key] === 'string') return input[key];
  }
  return undefined;
}

/** Structural board check: both buckets present and no extra completed/archive bucket. */
export function validateBoardContent(content) {
  const board = parseBoard(content);
  if (!board.parsed) return 'Resulting board would lose its To Do or In Progress bucket.';
  for (const line of content.split(/\r?\n/)) {
    const heading = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading && extraBucketNames.has(heading[1].toLowerCase().replace(/[^a-z]/g, ''))) {
      return 'Resulting board would add a completed/archive bucket; the board has only To Do and In Progress.';
    }
  }
  return null;
}

/**
 * Decides whether a tool call is a scoped, structurally valid access to an
 * allowlisted board file. Anything else falls back to the normal gate (ask).
 */
export function scopedBoardDecision(toolName, toolInput, ops, kind) {
  if (!ops?.boardPaths?.length) return { allow: false };
  const targets = distinctTargets(toolInput);
  if (targets.length !== 1) return { allow: false };
  const target = comparable(canonicalPath(resolve(ops.root, targets[0])));
  if (!ops.boardPaths.some((path) => comparable(path) === target)) return { allow: false };

  if (kind === 'read') return { allow: true, reason: 'Read of an allowlisted Factory board.' };

  const tool = toolName.trim().toLowerCase().split('/').pop();
  const boardPath = resolve(ops.root, targets[0]);
  if (tool === 'edit') {
    const oldText = firstString(toolInput, ['old_str', 'oldString', 'old_string']);
    const newText = firstString(toolInput, ['new_str', 'newString', 'new_string']);
    if (oldText === undefined || newText === undefined || oldText === '' || !existsSync(boardPath)) return { allow: false };
    const current = readFileSync(boardPath, 'utf8');
    const match = current.includes('\r\n') ? (text) => text.replace(/\r?\n/g, '\r\n') : (text) => text;
    const [from, to] = [match(oldText), match(newText)];
    if (current.split(from).length !== 2) return { allow: false };
    const problem = validateBoardContent(current.replace(from, () => to));
    return problem ? { allow: false, reason: problem } : { allow: true, reason: 'Scoped, structurally valid edit of an allowlisted Factory board.' };
  }
  if (tool === 'create') {
    const content = firstString(toolInput, ['file_text', 'fileText', 'content']);
    if (content === undefined || existsSync(boardPath)) return { allow: false };
    const problem = validateBoardContent(content);
    return problem ? { allow: false, reason: problem } : { allow: true, reason: 'Scoped, structurally valid creation of an allowlisted Factory board.' };
  }
  return { allow: false };
}
