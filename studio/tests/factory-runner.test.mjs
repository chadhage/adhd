import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { FactoryRunner } from '../factory-runner.mjs';
import { factoryRoles } from '../factory-contracts.mjs';
import { fixture } from './helpers.mjs';

test('positive: all role types use independent SDK sessions, acknowledged caps and the full scoped reference contracts', async (t) => {
  const { root } = await fixture(t);
  const configurations = [];
  const caps = [];
  const sessions = [];
  const sourceId = randomUUID();
  const client = {
    async start() {},
    async createSession(config) {
      configurations.push(config);
      const sessionId = randomUUID();
      sessions.push(sessionId);
      return {
        sessionId, rpc: { options: { async update(input) { caps.push(input.sessionLimits.maxAiCredits); return { success: true }; } } },
        on() { return () => {}; }, async disconnect() {}, async abort() {},
        async sendAndWait() {
          assert.equal(config.onPermissionRequest({ kind: 'shell' }).kind, 'reject');
          assert.equal(config.onPermissionRequest({ kind: 'custom-tool', toolName: 'factory_read_context', managedApprovalRequired: true }).kind, 'reject');
          const invoke = (name, args = {}) => config.tools.find((tool) => tool.name === name).handler(args, { sessionId, toolCallId: randomUUID() });
          await invoke('factory_accept_assignment');
          await assert.rejects(invoke('factory_submit_result', { summary: 'Not yet inspected', decision: 'continue', sources: [sourceId], nextScope: null }), /Inspect the supplied/);
          await invoke('factory_read_context');
          const contracts = await invoke('factory_read_shared_contracts');
          assert.match(contracts.source, /shared agent contracts/i);
          await invoke('factory_submit_result', { summary: 'Explicit fixture evidence read; no inference occurred.', decision: 'continue', sources: [sourceId], nextScope: null });
        },
      };
    },
  };
  const runner = new FactoryRunner({ client });
  const results = await Promise.all(factoryRoles.map((role) => runner.execute(role, {
    factoryId: sourceId, assignment: { id: randomUUID(), kind: 'read-only-fixture', writable: false, deadline: new Date(Date.now() + 120_000).toISOString() },
    run: { id: randomUUID(), directory: root }, signal: new AbortController().signal,
    protectedPaths: [], sourceIds: [sourceId], scope: 'Read scoped fixture evidence',
    memoryBinding: { factoryId: sourceId }, evidence: { sourceIds: [sourceId] },
    model: 'auto', credits: 30, timeoutMs: 120000, async observe() {},
  })));
  assert.equal(new Set(sessions).size, 9);
  assert.equal(configurations.length, 9);
  assert.ok(caps.every((cap) => cap === 30));
  assert.ok(results.every((result) => result.usage.incomplete && result.usage.reportedAiCredits === null));
});
