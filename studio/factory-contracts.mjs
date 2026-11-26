import { object, StudioError, text } from './contracts.mjs';

export const factoryRoles = ['FactoryLauncher', 'Factory', 'VOC', 'ProductOwner', 'AssociateProductOwner', 'Kanban', 'Squad', 'Fullstacker', 'Historian'];
export const deploymentTargets = ['docker', 'kubernetes', 'aks', 'aca', 'aci'];
export const toolchains = ['node', 'dotnet', 'python', 'java', 'go', 'native', 'infrastructure'];
export const factoryActions = ['technical-decisions', 'replenish', 'generate', 'verify', 'integrate', 'git-publish', 'merge-pull-request', 'infrastructure', 'deploy-nonproduction', 'release-production'];

function choice(value, allowed, label) {
  if (!allowed.includes(value)) throw new StudioError('INVALID_FACTORY_CONFIGURATION', `Choose a supported ${label}: ${allowed.join(', ')}.`);
  return value;
}

function number(value, label, minimum, maximum = Number.MAX_SAFE_INTEGER, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isSafeInteger(value))) {
    throw new StudioError('INVALID_FACTORY_CONFIGURATION', `${label} must be ${integer ? 'an integer' : 'a number'} between ${minimum} and ${maximum}.`);
  }
  return value;
}

function list(value, allowed, label, minimum = 0) {
  if (!Array.isArray(value) || value.length < minimum || value.length > allowed.length || new Set(value).size !== value.length) {
    throw new StudioError('INVALID_FACTORY_CONFIGURATION', `${label} must be a distinct list of supported values.`);
  }
  return value.map((entry) => choice(entry, allowed, label));
}

export function validateDeployment(input) {
  object(input, ['version', 'target', 'topology', 'startup', 'humanMode', 'toolchains', 'factoryCloud', 'productCloud', 'redundancy', 'identity', 'persistence', 'resources']);
  if (input.version !== 1) throw new StudioError('INVALID_FACTORY_CONFIGURATION', 'Unsupported deployment configuration version.');
  object(input.resources, ['cpu', 'memoryMiB']);
  return {
    version: 1,
    target: choice(input.target, deploymentTargets, 'deployment target'),
    topology: choice(input.topology, ['single', 'distributed'], 'deployment topology'),
    startup: choice(input.startup, ['studio', 'api', 'automatic'], 'startup trigger'),
    humanMode: choice(input.humanMode, ['in-loop', 'on-loop', 'out-of-loop'], 'human participation mode'),
    toolchains: list(input.toolchains, toolchains, 'toolchain'),
    factoryCloud: choice(input.factoryCloud, ['local', 'azure', 'aws', 'gcp', 'council'], 'Factory cloud'),
    productCloud: choice(input.productCloud, ['local', 'azure', 'aws', 'gcp', 'council'], 'work-product cloud'),
    redundancy: input.redundancy === null ? null : number(input.redundancy, 'Redundancy', 1, 64, true),
    identity: choice(input.identity, ['runtime-secrets', 'workload-identity', 'hosted-connector'], 'identity strategy'),
    persistence: choice(input.persistence, ['volume', 'postgres'], 'persistence strategy'),
    resources: {
      cpu: number(input.resources.cpu, 'CPU allocation', 0.1, 64),
      memoryMiB: number(input.resources.memoryMiB, 'Memory allocation', 256, 262144, true),
    },
  };
}

export function validateWritePaths(value) {
  if (!Array.isArray(value) || !value.length || value.length > 64 || new Set(value).size !== value.length) {
    throw new StudioError('INVALID_FACTORY_CONFIGURATION', 'Specify distinct authorized product write paths.');
  }
  return value.map((entry) => {
    const path = text(entry, 'Write path', 300).replaceAll('\\', '/');
    if (path !== '.' && (path.startsWith('/') || /[:\u0000-\u001f]/.test(path)
      || path.split('/').some((part) => !part || part === '.' || part === '..'
        || /^(?:\.git|\.adhd|\.factory|node_modules|\.env.*|credentials?|secrets?)$/i.test(part)
        || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(part)))) {
      throw new StudioError('PATH_DENIED', 'Authorize ordinary product paths, not credentials, records, or parent paths.');
    }
    return path;
  });
}

export function mayWrite(paths, path) {
  const value = path.replaceAll('\\', '/');
  const compare = (entry) => process.platform === 'win32' ? entry.toLowerCase() : entry;
  return paths.some((prefix) => prefix === '.' || compare(value) === compare(prefix) || compare(value).startsWith(`${compare(prefix)}/`));
}

export function validateMandate(input, { allowExpired = false, now = Date.now() } = {}) {
  object(input, ['maxCredits', 'creditsPerTask', 'maxCycles', 'maxParallel', 'taskSeconds', 'expiresAt', 'maxRetries', 'resumeOnRestart', 'actions', 'writePaths', 'model', 'cost']);
  const creditsPerTask = number(input.creditsPerTask, 'Per-task AI-credit cap (runtime minimum 30)', 30, 100);
  const maxParallel = number(input.maxParallel, 'Concurrent assignment limit', factoryRoles.length, 64, true);
  const maxCredits = number(input.maxCredits, 'Cumulative AI-credit cap', 30);
  if (maxCredits < factoryRoles.length * creditsPerTask) {
    throw new StudioError('UNFUNDED_CONCURRENCY', 'The mandate must reserve at least nine independently capped role sessions before concurrent delivery.');
  }
  const expiresAt = text(input.expiresAt, 'Authority expiry', 40);
  if (!Number.isFinite(Date.parse(expiresAt)) || (!allowExpired && Date.parse(expiresAt) <= now)) {
    throw new StudioError('AUTHORITY_EXPIRED', 'The operating mandate is invalid or expired.', 409);
  }
  if (typeof input.resumeOnRestart !== 'boolean') throw new StudioError('INVALID_FACTORY_CONFIGURATION', 'Explicitly choose restart continuation.');
  let cost = null;
  if (input.cost !== null) {
    object(input.cost, ['currency', 'maxAmount', 'creditRate', 'infrastructureReserve', 'rateVersion']);
    if (!/^[A-Z]{3}$/.test(input.cost.currency)) throw new StudioError('INVALID_FACTORY_CONFIGURATION', 'Specify a three-letter cost currency.');
    cost = {
      currency: input.cost.currency,
      maxAmount: number(input.cost.maxAmount, 'Cumulative currency ceiling', Number.EPSILON),
      creditRate: number(input.cost.creditRate, 'Owner-confirmed AI credit rate', Number.EPSILON),
      infrastructureReserve: number(input.cost.infrastructureReserve, 'Infrastructure cost reserve', 0),
      rateVersion: text(input.cost.rateVersion, 'Confirmed rate version', 120),
    };
    if (maxCredits * cost.creditRate + cost.infrastructureReserve > cost.maxAmount) {
      throw new StudioError('UNFUNDED_COST', 'The credit escrow and infrastructure reserve exceed the currency ceiling.');
    }
  }
  const actions = list(input.actions, factoryActions, 'delegated action', 1);
  if (!actions.includes('generate')) throw new StudioError('PERMISSION_REQUIRED', 'Factory production requires explicitly delegated generation.');
  return {
    maxCredits, creditsPerTask, maxCycles: number(input.maxCycles, 'Value-cycle horizon', 1, 1000, true),
    maxParallel, taskSeconds: number(input.taskSeconds, 'Assignment window in seconds', 30, 3600, true),
    expiresAt, maxRetries: number(input.maxRetries, 'Recovery retry limit', 0, 10, true),
    resumeOnRestart: input.resumeOnRestart, actions, writePaths: validateWritePaths(input.writePaths),
    model: text(input.model, 'Selected model', 100), cost,
  };
}

export function validateFactoryState(factory) {
  if (!factory || factory.version !== 1 || !/^[a-f0-9-]{36}$/.test(factory.id)
    || !['authorized', 'running', 'waiting-human', 'paused', 'interrupted', 'restricted', 'revoked', 'checkpoint'].includes(factory.status)
    || !Array.isArray(factory.tasks) || !Array.isArray(factory.cycles)
    || !factory.accounting || !Number.isFinite(factory.accounting.chargedCredits) || factory.accounting.chargedCredits < 0
    || !Number.isFinite(factory.accounting.reservedCredits) || factory.accounting.reservedCredits < 0) {
    throw new StudioError('CORRUPT_RECORDS', 'The Factory identity, cursor, or accounting state is invalid.', 409);
  }
  validateMandate(factory.mandate, { allowExpired: true });
  for (const task of factory.tasks) {
    if (!/^[a-f0-9-]{36}$/.test(task.id) || !factoryRoles.includes(task.role)
      || !['queued', 'running', 'complete', 'failed', 'interrupted'].includes(task.status)
      || !Number.isFinite(task.reservedCredits) || task.reservedCredits < 30
      || !Number.isInteger(task.attempt) || task.attempt < 0) {
      throw new StudioError('CORRUPT_RECORDS', 'A Factory assignment has invalid identity, role, state, or reservation.', 409);
    }
  }
  return factory;
}
