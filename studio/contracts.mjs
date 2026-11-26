import { createHash } from 'node:crypto';
import { lstat, mkdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { validateDeployment } from './factory-contracts.mjs';

export const modes = ['local', 'hosted', 'self-hosted'];
export const activeStatuses = ['running', 'paused', 'interrupted', 'review-required', 'verifying', 'verified', 'integration-failed'];
export const recordPath = '.adhd/studio/records.json';
export const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export class StudioError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some((key) => !keys.includes(key))) {
    throw new StudioError('INVALID_INPUT', 'The request has an invalid shape or unsupported fields.');
  }
  return value;
}

export function text(value, label, maximum = 400) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
    throw new StudioError('INVALID_INPUT', `${label} must be nonempty text, at most ${maximum} characters.`);
  }
  return value.trim();
}

export function identifier(value) {
  const id = text(value, 'Identifier', 80);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new StudioError('INVALID_INPUT', 'Invalid identifier.');
  return id;
}

export function validateBlueprint(value) {
  object(value, ['path', 'name', 'goal', 'nextFactory', 'nextSquad', 'factories', 'deployment']);
  if (!modes.includes(value.path)) throw new StudioError('INVALID_MODE', 'Choose local, hosted, or self-hosted execution.');
  if (!Array.isArray(value.factories) || value.factories.length < 1 || value.factories.length > 4) {
    throw new StudioError('INVALID_INPUT', 'Choose between one and four Factories.');
  }
  const factoryIds = new Set();
  const squadIds = new Set();
  const factories = value.factories.map((factory) => {
    object(factory, ['id', 'name', 'squads']);
    const id = identifier(factory.id);
    if (factoryIds.has(id)) throw new StudioError('INVALID_INPUT', 'Factory IDs must be unique.');
    factoryIds.add(id);
    if (!Array.isArray(factory.squads) || factory.squads.length < 1 || factory.squads.length > 4) {
      throw new StudioError('INVALID_INPUT', 'Every Factory needs between one and four Squads.');
    }
    return {
      id, name: text(factory.name, 'Factory name', 80),
      squads: factory.squads.map((squad) => {
        object(squad, ['id', 'name', 'members']);
        const squadId = identifier(squad.id);
        const members = Number(squad.members);
        if (squadIds.has(squadId) || !Number.isInteger(members) || members < 1 || members > 12) {
          throw new StudioError('INVALID_INPUT', 'Squad IDs must be unique and team sizes must be 1-12.');
        }
        squadIds.add(squadId);
        return { id: squadId, name: text(squad.name, 'Squad name', 80), members: String(members) };
      }),
    };
  });
  return {
    path: value.path, name: text(value.name, 'Product name', 80), goal: text(value.goal, 'Product goal'), factories,
    ...(value.deployment === undefined ? {} : { deployment: validateDeployment(value.deployment) }),
  };
}

export function validateReview(value, blueprint) {
  object(value, ['scope', 'budget', 'maxSeconds', 'write', 'verify', 'share', 'model', 'factoryId', 'squadId']);
  const budget = Number(value.budget);
  const maxSeconds = Number(value.maxSeconds);
  if (!Number.isFinite(budget) || budget < 30 || budget > 100
    || !Number.isInteger(maxSeconds) || maxSeconds < 30 || maxSeconds > 900) {
    throw new StudioError('INVALID_INPUT', 'Choose 30-100 AI credits and a 30-900 second operating window.');
  }
  if (value.write !== true || value.verify !== true || value.share !== true) {
    throw new StudioError('PERMISSION_REQUIRED', 'Authorize scoped provider access, workspace writes, and the displayed verification command.');
  }
  const factory = blueprint.factories.find((entry) => entry.id === value.factoryId);
  if (!factory?.squads.some((entry) => entry.id === value.squadId)) {
    throw new StudioError('INVALID_INPUT', 'Choose a Squad from the current blueprint.');
  }
  return { scope: text(value.scope, 'Card scope'), budget, maxSeconds, write: true, verify: true, share: true, model: text(value.model, 'Selected model', 100), factoryId: factory.id, squadId: value.squadId };
}

export function redact(value) {
  return String(value)
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[REDACTED]@')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, '[REDACTED]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/((?:token|password|secret|accountkey)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]');
}

export function containsCredential(value) {
  return /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|(?:AKIA|ASIA)[A-Z0-9]{16})\b|-----BEGIN (?:(?:RSA|EC|DSA) )?PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9+/_=-]{20,}|\bAccountKey=[A-Za-z0-9+/=]{40,}|\b[a-z][a-z0-9+.-]*:\/\/[^\s/@]+:[^\s/@]+@/i.test(value);
}

export async function scopedPath(root, value, { createParents = false, expectedRoot } = {}) {
  if (typeof value !== 'string' || !value || value.length > 300 || isAbsolute(value)
    || /[:\u0000-\u001f]/.test(value)) throw new StudioError('PATH_DENIED', 'Use a relative workspace path.');
  const parts = value.split(/[\\/]/);
  if (parts.some((part) => !part || part === '.' || part === '..'
    || /^(?:\.git|\.adhd|\.factory|\.mcp\.json|\.vscode|node_modules|\.env.*|credentials?|secrets?)$/i.test(part)
    || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(part)
    || /\.(?:pem|pfx|p12|key)$/i.test(part))) {
    throw new StudioError('PATH_DENIED', 'Protected, credential, dependency, and parent paths are not accessible.');
  }
  const canonicalRoot = await realpath(root);
  if (expectedRoot && canonicalRoot !== expectedRoot) throw new StudioError('PATH_DENIED', 'The approved workspace was redirected.');
  let current = canonicalRoot;
  for (let index = 0; index < parts.length; index += 1) {
    current = join(current, parts[index]);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (createParents && index < parts.length - 1) {
        await mkdir(current);
        info = await lstat(current);
      }
    }
    if (info?.isSymbolicLink()) throw new StudioError('PATH_DENIED', 'Linked files and directories are not accessible.');
    if (info && index < parts.length - 1 && !info.isDirectory()) throw new StudioError('PATH_DENIED', 'A parent path is not a directory.');
  }
  const inside = relative(canonicalRoot, current);
  if (!inside || inside.startsWith(`..${sep}`) || isAbsolute(inside)) throw new StudioError('PATH_DENIED', 'Path escapes the workspace.');
  return current;
}
