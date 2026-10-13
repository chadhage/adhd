import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { parseJsonLines } from './lib/approvals.mjs';
import { applyIfRevision, readWithRevision } from './revision-lock.mjs';

const secretKey = /(secret|token|password|passwd|credential|api[-_]?key|authorization|private[-_]?key)/i;
const secretValue = /^(?:ghp_|gho_|github_pat_|sk-|AKIA|xox[abp]-)[A-Za-z0-9_-]{8,}/;

export function redact(value, key = '') {
  if (secretKey.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return secretValue.test(value) ? '[REDACTED]' : value;
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redact(item, name)]));
  }
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((name) => `${JSON.stringify(name)}:${canonical(value[name])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export const digestOf = (tool, target, redactedParams) =>
  `sha256:${createHash('sha256').update(canonical({ tool, target, params: redactedParams })).digest('hex')}`;

const nonEmpty = (value) => typeof value === 'string' && value.trim() !== '';

function fold(entries) {
  const requests = new Map();
  for (const entry of entries) {
    if (entry.type === 'request') requests.set(entry.id, { ...entry, status: 'pending', decisions: [] });
    else if (entry.type === 'decision' && requests.has(entry.id)) {
      const request = requests.get(entry.id);
      request.status = entry.decision;
      request.decisions.push(entry);
    }
  }
  return [...requests.values()];
}

async function load(queuePath) {
  const snapshot = await readWithRevision(queuePath);
  const { entries, invalid } = parseJsonLines(snapshot.content);
  return { snapshot, entries, invalid, requests: fold(entries) };
}

async function append(queuePath, snapshot, entry, owner) {
  const prefix = snapshot.content === '' || snapshot.content.endsWith('\n') ? '' : '\n';
  const result = await applyIfRevision(
    queuePath,
    snapshot.revision,
    `${snapshot.content}${prefix}${JSON.stringify(entry)}\n`,
    { owner },
  );
  return result;
}

/**
 * Records a blocked non-read action so a human can decide pending actions together.
 * Recording a request never grants approval and never executes the action.
 */
export async function enqueue(queuePath, request) {
  for (const field of ['requester', 'tool', 'target', 'purpose', 'cardId']) {
    if (!nonEmpty(request[field])) throw new Error(`Missing required field: ${field}`);
  }
  if (!request.params || typeof request.params !== 'object') throw new Error('Missing required field: params');

  for (;;) {
    const { snapshot, requests } = await load(queuePath);
    const params = redact(request.params);
    const digest = digestOf(request.tool, request.target, params);
    const same = requests.filter((item) => item.digest === digest);
    const pending = same.find((item) => item.status === 'pending');
    if (pending) return { ok: true, id: pending.id, duplicate: true };

    const latest = same.at(-1);
    if (latest?.status === 'denied' && !nonEmpty(request.changedEvidence)) {
      return { ok: false, reason: 'denied-without-changed-evidence', id: latest.id };
    }

    const entry = {
      type: 'request',
      id: `AQ-${requests.length + 1}`,
      ts: new Date().toISOString(),
      requester: request.requester,
      tool: request.tool,
      target: request.target,
      params,
      digest,
      purpose: request.purpose,
      cardId: request.cardId,
      ...(nonEmpty(request.changedEvidence) ? { changedEvidence: request.changedEvidence } : {}),
    };
    const result = await append(queuePath, snapshot, entry, request.requester);
    if (result.ok) return { ok: true, id: entry.id, duplicate: false };
    if (result.reason !== 'revision-mismatch') return result;
  }
}

/** Records a decision a human made elsewhere. The queue cannot verify who supplies it. */
export async function resolveRequest(queuePath, id, { decision, approver, source }) {
  if (!['approved', 'denied'].includes(decision)) throw new Error('decision must be approved or denied');
  if (!nonEmpty(approver) || !nonEmpty(source)) throw new Error('approver and source are required');

  for (;;) {
    const { snapshot, requests } = await load(queuePath);
    const request = requests.find((item) => item.id === id);
    if (!request) return { ok: false, reason: 'unknown-request' };
    if (request.status !== 'pending') return { ok: false, reason: 'not-pending', status: request.status };

    const entry = {
      type: 'decision',
      id,
      decision,
      approver,
      approverKind: 'human',
      source,
      ts: new Date().toISOString(),
      digest: request.digest,
    };
    const result = await append(queuePath, snapshot, entry, approver);
    if (result.ok) return { ok: true, id, decision };
    if (result.reason !== 'revision-mismatch') return result;
  }
}

export async function listRequests(queuePath) {
  const { requests, invalid } = await load(queuePath);
  return { requests, invalidLines: invalid };
}

async function main(argv) {
  const [command, ...rest] = argv;
  const { values } = parseArgs({
    args: rest,
    options: {
      queue: { type: 'string' },
      requester: { type: 'string' },
      tool: { type: 'string' },
      target: { type: 'string' },
      params: { type: 'string' },
      purpose: { type: 'string' },
      card: { type: 'string' },
      'changed-evidence': { type: 'string' },
      id: { type: 'string' },
      decision: { type: 'string' },
      approver: { type: 'string' },
      source: { type: 'string' },
      status: { type: 'string' },
    },
  });
  if (!values.queue) throw new Error('--queue is required');
  const queuePath = resolve(values.queue);

  if (command === 'enqueue') {
    return enqueue(queuePath, {
      requester: values.requester,
      tool: values.tool,
      target: values.target,
      params: values.params ? JSON.parse(values.params) : undefined,
      purpose: values.purpose,
      cardId: values.card,
      changedEvidence: values['changed-evidence'],
    });
  }
  if (command === 'resolve') {
    return resolveRequest(queuePath, values.id, {
      decision: values.decision,
      approver: values.approver,
      source: values.source,
    });
  }
  if (command === 'list') {
    const { requests, invalidLines } = await listRequests(queuePath);
    return { requests: values.status ? requests.filter((item) => item.status === values.status) : requests, invalidLines };
  }
  throw new Error('Usage: approval-queue.mjs <enqueue|resolve|list> --queue <file> [options]');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await main(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.ok === false ? 1 : 0;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
