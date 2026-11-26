import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { CopilotRunner } from '../copilot.mjs';
import { fixture, review } from './helpers.mjs';

function sdk({ failLimits = false, beforeAccept = false, malicious = false } = {}) {
  const client = {
    limits: [], calls: [], id: randomUUID(),
    async start() {},
    async stop() {},
    async getAuthStatus() { return { isAuthenticated: true }; },
    async createSession(config) { return this.session(config); },
    async resumeSession(id, config) { assert.equal(id, this.id); return this.session(config); },
    session(config) {
      for (const tool of config.tools ?? []) assert.ok(!['read_file', 'write_file', 'list_files'].includes(tool.name), 'custom tools must not collide with native tools');
      const client = this;
      return {
        sessionId: this.id,
        rpc: { options: { async update(value) { client.limits.push(value.sessionLimits.maxAiCredits); return { success: !failLimits }; } }, model: { async list() { return { list: [], auto: { defaultTier: 'balance', tiers: [{ id: 'balance', displayName: 'Standard', status: { enabled: true } }] } }; } } },
        on() { return () => {}; }, async disconnect() {},
        async sendAndWait() {
          client.calls.push(config.agent);
          const invoke = (name, args = {}) => config.tools.find((tool) => tool.name === name).handler(args, { sessionId: client.id, toolCallId: randomUUID() });
          assert.equal(config.onPermissionRequest({ kind: 'shell' }).kind, 'reject');
          assert.equal(config.onPermissionRequest({ kind: 'custom-tool', toolName: 'accept_assignment', managedApprovalRequired: true }).kind, 'reject');
          assert.equal(config.onPermissionRequest({ kind: 'custom-tool', toolName: 'accept_assignment' }).kind, 'approve-once');
          if (config.agent === 'Fullstacker' && beforeAccept) await assert.rejects(invoke('studio_write_file', { path: 'smoke.txt', content: 'bad' }), /Accept the scoped assignment/);
          await invoke('accept_assignment');
          const marker = { VOC: 'register_intake', Factory: 'assign_card', Squad: 'handoff_card' }[config.agent];
          if (marker) await invoke(marker);
          else {
            await invoke('studio_list_files');
            await invoke('studio_read_file', { path: 'acceptance.test.mjs' });
            if (malicious) {
              await assert.rejects(invoke('studio_write_file', { path: '../escape.txt', content: 'bad' }), /Protected/);
              await assert.rejects(invoke('studio_write_file', { path: 'acceptance.test.mjs', content: 'bad' }), /read-only/);
            }
            await invoke('studio_write_file', { path: 'smoke.txt', content: 'studio-ready\n' });
          }
        },
      };
    },
  };
  return client;
}

function context(root) {
  const run = { id: randomUUID(), cardId: 'fixture-card', directory: root, sessions: {}, review, deadline: new Date(Date.now() + 120_000).toISOString() };
  return {
    run, signal: new AbortController().signal, protectedPaths: ['acceptance.test.mjs'],
    async observe(type, details) { if (type === 'session.started') run.sessions[details.role] = details.sessionId; },
    output() {}, usage() {},
  };
}

test('positive: sequential roles share one acknowledged credit window and scoped registered file tools', async (t) => {
  const { root } = await fixture(t);
  const client = sdk();
  const runner = new CopilotRunner({ client });
  const call = context(root);
  for (const role of ['VOC', 'Factory', 'Squad', 'Fullstacker']) await runner.execute(role, call);
  assert.deepEqual(client.limits, [30]);
  assert.deepEqual(client.calls, ['VOC', 'Factory', 'Squad', 'Fullstacker']);
  assert.equal(new Set(Object.values(call.run.sessions)).size, 1);
  assert.equal(await readFile(join(root, 'smoke.txt'), 'utf8'), 'studio-ready\n');
});

test('negative: native/managed permissions, writes before acceptance, and verification-program edits are not bypassed', async (t) => {
  const { root } = await fixture(t);
  const runner = new CopilotRunner({ client: sdk({ beforeAccept: true, malicious: true }) });
  await runner.execute('Fullstacker', context(root));
});

test('negative: missing runtime limit acknowledgement prevents any inference call', async (t) => {
  const { root } = await fixture(t);
  const client = sdk({ failLimits: true });
  await assert.rejects(new CopilotRunner({ client }).execute('VOC', context(root)), /did not acknowledge/);
  assert.equal(client.calls.length, 0);
});

test('positive: readiness uses the session catalog and exposes only reported Auto availability', async (t) => {
  const { root } = await fixture(t);
  const result = await new CopilotRunner({ client: sdk() }).inspect(root);
  assert.deepEqual(result.models.map((model) => model.id), ['auto']);
});
