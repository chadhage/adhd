import { spawnSync } from 'node:child_process';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createStore, newFact, normalizeEvent, VERSION } from '../../skills/factory-observability/scripts/runtime/store.mjs';
import { repoRoot, tempDir } from './helpers.mjs';

export const skillRoot = join(repoRoot, '.github', 'skills', 'factory-observability');
export const runtimeRoot = join(skillRoot, 'scripts', 'runtime');
export const installerPath = join(skillRoot, 'scripts', 'install.mjs');
export const fixedNow = Date.parse('2026-10-23T12:00:00Z');
export const fact = (kind = 'agent.progress', extra = {}) => newFact('alpha', kind, 'Explicitly synthetic verification fact', {
  occurred_at: '2026-10-23T11:59:30Z', agent: { id: 'worker-1', role: 'Fullstacker' }, ...extra,
});
export const records = (inputs) => inputs.map((input, index) => ({
  ...normalizeEvent(input, 'alpha', fixedNow), sequence: index + 1, recorded_at: '2026-10-23T12:00:00Z',
}));

export async function center(t, { factoryId = 'alpha', sessions = ['session-1'], copy = false } = {}) {
  const root = await tempDir(t, 'adhd-observation-');
  const base = join(root, '.factory', 'observability');
  const directory = join(base, factoryId);
  await mkdir(join(directory, 'inbox'), { recursive: true });
  if (copy) await cp(runtimeRoot, directory, { recursive: true });
  const config = {
    version: 1, runtime_version: VERSION, factory_id: factoryId, label: 'Synthetic verification Factory',
    created_at: '2020-01-01T00:00:00Z', stale_after_ms: 60_000,
  };
  await writeFile(join(directory, 'center.json'), JSON.stringify(config));
  await writeFile(join(directory, 'events.jsonl'), '');
  await writeFile(join(base, 'registry.json'), JSON.stringify({ version: 1, factories: { [factoryId]: { sessions } } }));
  return { root, base, directory, config, store: createStore(directory), path: (name) => join(directory, name) };
}

export async function product(t) {
  const root = await tempDir(t, 'adhd-product-observation-');
  const result = spawnSync('git', ['init', '--quiet', root], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`Cannot initialize isolated test repository: ${result.stderr}`);
  return root;
}

export const rpc = (id, method, params) => ({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
export const initialize = rpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'verification-client', version: '1' } });
export async function ready(handler) {
  await handler(initialize);
  await handler({ jsonrpc: '2.0', method: 'notifications/initialized' });
  return handler;
}
