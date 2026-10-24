import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const events = new Set(['pretooluse', 'posttooluse', 'subagentstart', 'subagentstop', 'agentstop', 'sessionstart', 'sessionend']);
const safeId = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const safeName = /^[A-Za-z0-9][A-Za-z0-9_.:/ -]{0,127}$/;

class CaptureError extends Error {
  constructor(message) { super(message); this.name = 'CaptureError'; }
}

export async function capture(base, eventName, payload) {
  if (!events.has(eventName.toLowerCase())) throw new CaptureError('Unsupported observation hook event');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new CaptureError('Hook payload must be an object');
  const registry = JSON.parse(await readFile(resolve(base, 'registry.json'), 'utf8'));
  if (registry.version !== 1 || !registry.factories || typeof registry.factories !== 'object') throw new CaptureError('Invalid Factory capture registry');
  const session = payload.session_id ?? payload.sessionId;
  const parent = payload.parent_session_id;
  const factories = Object.entries(registry.factories).filter(([, entry]) =>
    Array.isArray(entry.sessions) && entry.sessions.some((id) => id === session || id === parent));
  if (!factories.length) return { captured: 0, reason: 'outside-bound-sessions' };
  if (factories.length !== 1) throw new CaptureError('Ambiguous Factory session binding; no metadata was captured');
  const [factoryId] = factories[0];
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(factoryId)) throw new CaptureError('Invalid Factory registry identity');
  const centerPath = resolve(base, factoryId);
  const info = await lstat(centerPath);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new CaptureError('Factory center must not be a link');
  const { createStore, newFact, sensitivePath } = await import(pathToFileURL(resolve(centerPath, 'store.mjs')).href);
  const store = createStore(centerPath);
  const kind = eventName.toLowerCase();
  const tool = payload.tool_name ?? payload.toolName;
  const id = payload.agent_id ?? payload.agentId;
  const role = payload.agent_type ?? payload.agentType ?? payload.agent_name;
  const agent = typeof id === 'string' && safeId.test(id)
    ? { id, role: typeof role === 'string' && safeName.test(role) ? role.slice(0, 64) : 'unknown' }
    : undefined;
  const callId = payload.tool_call_id ?? payload.toolCallId;
  const correlation = typeof callId === 'string' && safeId.test(callId) ? callId : undefined;
  const sourceTime = payload.timestamp;
  const occurredAt = typeof sourceTime === 'string' && Number.isFinite(Date.parse(sourceTime)) ? new Date(sourceTime).toISOString() : new Date().toISOString();
  const source = { kind: 'host-hook', ref: `hook:${kind}:${typeof session === 'string' && safeId.test(session) ? session : 'bound-parent'}` };
  const extra = { source, occurred_at: occurredAt, ...(agent ? { agent } : {}), ...(correlation ? { correlation_id: correlation } : {}) };
  async function emit(eventKind, message, fields = {}) {
    const fact = newFact(factoryId, eventKind, message, { ...extra, ...fields });
    // A stable host call ID makes hook redelivery idempotent without capturing arguments.
    if (correlation && typeof sourceTime === 'string') fact.event_id = createHash('sha256').update(`${session}:${kind}:${correlation}:${eventKind}`).digest('hex');
    return store.append(fact);
  }
  if (kind === 'pretooluse' || kind === 'posttooluse') {
    if (typeof tool !== 'string' || !safeName.test(tool)) throw new CaptureError('Tool hook is missing a safe tool name');
    const outcome = payload.tool_success ?? payload.success ?? payload.tool_result?.success ?? payload.toolResult?.success;
    const failed = outcome === false;
    await emit(kind === 'pretooluse' ? 'tool.requested' : failed ? 'tool.failed' : outcome === true ? 'tool.completed' : 'tool.observed',
      'Host reported tool metadata; a pre-tool request is not proof of execution and missing outcome remains unknown.', { tool });
    let input = payload.tool_input ?? payload.toolInput;
    if (typeof input === 'string' && Buffer.byteLength(input) <= 65_536) {
      try { input = JSON.parse(input); }
      catch { input = null; }
    }
    const shortTool = tool.split(/[/.]/).at(-1).toLowerCase();
    if (shortTool === 'skill' && typeof input?.skill === 'string' && /^[a-z0-9][a-z0-9-]{0,99}$/.test(input.skill)) {
      await emit(kind === 'pretooluse' ? 'skill.requested' : failed ? 'skill.failed' : 'skill.loaded',
        'Host observed skill loading only; application of the method and product outcome need explicit evidence.', { skill: input.skill });
    }
    if (kind === 'posttooluse' && outcome === true && ['create', 'create_file', 'write_file', 'edit', 'edit_file'].includes(shortTool)) {
      const path = input?.filePath ?? input?.file_path ?? input?.path;
      if (typeof path === 'string' && path.length <= 1000 && !sensitivePath.test(path)) {
        const product = resolve(base, '..', '..');
        const local = relative(product, resolve(product, path));
        if (local && !local.startsWith('..') && !isAbsolute(local) && !sensitivePath.test(local) && !local.startsWith('.factory')) {
          await emit(shortTool.startsWith('edit') ? 'item.updated' : 'item.created', 'Host reported an artifact write; content and acceptance were not collected.', {
            item: { id: local, type: 'artifact', title: local.slice(0, 200), state: 'generated' },
          });
        }
      }
    }
  } else if ((kind === 'subagentstart' || kind === 'subagentstop') && agent) {
    await emit(kind === 'subagentstart' ? 'agent.started' : 'agent.returned', 'Host reported an agent boundary; a returned agent is not proof of accepted product work.');
  } else {
    await emit('evidence.recorded', `Host observed ${kind}; this is not a Factory start/stop approval or proof of Factory progress.`);
  }
  return { captured: 1, factory_id: factoryId };
}

export async function runCapture(args, input = process.stdin, output = process.stdout, base = dirname(fileURLToPath(import.meta.url))) {
  try {
    if (args.length !== 1) throw new CaptureError('Usage: capture.mjs <hook-event>');
    let content = '';
    input.setEncoding('utf8');
    for await (const chunk of input) {
      content += chunk;
      if (Buffer.byteLength(content) > 1024 * 1024) throw new CaptureError('Hook input exceeds 1 MiB; no payload was stored');
    }
    let payload;
    try { payload = JSON.parse(content); }
    catch { throw new CaptureError('Hook input is not valid JSON; no payload was stored'); }
    await capture(base, args[0], payload);
    output.write('{}\n');
    return 0;
  } catch (error) {
    process.stderr.write(`[factory-observability] Metadata capture failed: ${error instanceof CaptureError || error.name === 'ObservationError' ? error.message : error.code ?? error.name}\n`);
    // Telemetry never returns allow/ask/deny and never replaces the security hook.
    output.write('{}\n');
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await runCapture(process.argv.slice(2));
}
