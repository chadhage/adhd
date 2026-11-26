import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { install } from '../.github/skills/factory-observability/scripts/install.mjs';
import { normalizeProfile } from '../.github/skills/factory-observability/scripts/runtime/metadata.mjs';
import { digest, StudioError } from './contracts.mjs';
import { factoryRoles } from './factory-contracts.mjs';

export class FactoryObservability {
  constructor(studio) {
    this.studio = studio;
    this.center = null;
    this.directory = null;
    this.queue = Promise.resolve();
  }

  async ensure(factory, blueprint) {
    if (this.center) return this.status;
    const repository = this.studio.repository;
    const journal = `.factory/observability/${factory.id}/events.jsonl`;
    repository.recordPaths = [repository.recordPaths[0], journal];
    await repository.assertClean();
    const installed = await install({ productRoot: repository.root, factoryId: factory.id, label: blueprint.name });
    this.directory = installed.directory;
    const profile = normalizeProfile({
      version: 1, factory_id: factory.id, mission: blueprint.goal,
      product: { name: blueprint.name, workspace: repository.root, branch: (await repository.info()).branch },
      owners: { factory: 'Authenticated Factory owner', product: 'Delegated ProductOwner', operations: 'Studio controller operator' },
      governance: {
        engagement_id: factory.id, contract_ref: '.adhd/studio/records.json#factory',
        board_ref: '.adhd/studio/records.json#factory/current',
        operating_window: `Until ${factory.mandate.expiresAt}`,
        resource_limits: `${factory.mandate.maxCredits} AI credits; ${factory.mandate.maxParallel} concurrent assignments; ${factory.mandate.maxCycles} authorized cycles`,
      },
      roster: {
        agents: factoryRoles.map((role) => ({ id: `declared-${role}`, role, assignment: 'Declared role type; actual assignment/session IDs are emitted separately.' })),
        skills: [], squads: blueprint.factories.flatMap((entry) => entry.squads.map((squad) => squad.id)),
      },
      source: { ref: '.adhd/studio/records.json#factory', revision: digest(factory.mandate) }, updated_at: new Date().toISOString(),
    }, factory.id);
    await writeFile(join(this.directory, 'profile.json'), `${JSON.stringify(profile, null, 2)}\n`);
    await repository.commitObservationSetup(factory.id);
    const http = await import(pathToFileURL(join(this.directory, 'http.mjs')).href);
    this.center = http.createCenterServer(this.directory);
    const url = await this.center.listen();
    const health = await fetch(`${url}/healthz`, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
    if (!health.ok) throw new StudioError('OBSERVABILITY_UNAVAILABLE', 'The installed Operations Center did not become responsive.', 503);
    const mcp = await import(pathToFileURL(join(this.directory, 'mcp.mjs')).href);
    const handler = mcp.createMcpHandler(this.directory);
    const initialized = await handler({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'Studio runtime probe', version: '1' } } });
    await handler({ jsonrpc: '2.0', method: 'notifications/initialized' });
    const tools = await handler({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const read = await handler({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'factory_metadata', arguments: {} } });
    if (initialized.error || tools.error || read.error) throw new StudioError('OBSERVABILITY_UNAVAILABLE', 'The installed Operations Center MCP protocol probe failed.', 503);
    this.status = {
      directory: installed.directory, internalUrl: url, http: 'observed responsive',
      mcp: 'In-process initialize/tools-list/read observed; external host discovery remains unverified.',
      capture: 'Explicit controller/SDK facts; ambient hooks and private transcripts are not claimed.',
    };
    return this.status;
  }

  async record(events) {
    if (!this.center || !events.length) return;
    const execute = async () => {
      for (const event of events) {
        let kind = 'evidence.recorded';
        if (event.type === 'factory.session.started') kind = 'agent.started';
        else if (event.type === 'factory.assignment.completed') kind = 'agent.completed';
        else if (event.type === 'factory.assignment.failed') kind = 'agent.failed';
        else if (event.type === 'factory.tool.completed') kind = 'tool.completed';
        else if (event.type === 'factory.skill.loaded') kind = 'skill.loaded';
        else if (event.type === 'factory.increment.completed') kind = 'item.completed';
        else if (event.type === 'factory.started') kind = 'factory.started';
        else if (event.type === 'factory.restricted') kind = 'incident.opened';
        await this.center.store.append({
          event_id: event.id, factory_id: event.factoryId, occurred_at: event.time,
          kind, message: `${event.type}${event.role ? `: ${event.role}` : ''}`,
          source: { kind: 'agent-report', ref: `.adhd/studio/records.json#history/${event.id}` },
          ...(event.assignmentId ? { correlation_id: event.assignmentId } : {}),
          ...(event.role && event.assignmentId ? { agent: { id: event.sessionId ?? event.assignmentId, role: event.role } } : {}),
          ...(event.skill ? { skill: { name: event.skill } } : {}),
          ...(event.cycleId ? { item: { id: event.cycleId, type: 'card', state: kind === 'item.completed' ? 'completed' : 'unknown' } } : {}),
        });
      }
    };
    const result = this.queue.then(execute);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async read() {
    if (!this.center) throw new StudioError('OBSERVABILITY_UNAVAILABLE', 'The product-owned Operations Center is not running.', 503);
    const query = await import(pathToFileURL(join(this.directory, 'query.mjs')).href);
    return query.readModel(this.center.store);
  }

  async close() {
    await this.queue;
    await this.center?.close();
    this.center = null;
  }
}
