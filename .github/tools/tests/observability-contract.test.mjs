import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { repoRoot } from './helpers.mjs';

const roles = ['factory-launcher', 'factory', 'squad', 'fullstacker', 'product-owner', 'associate-product-owner', 'kanban', 'voc', 'historian'];

test('positive: every Factory role participates in the per-Factory observation contract', () => {
  for (const role of roles) {
    const source = readFileSync(join(repoRoot, '.github', 'agents', `${role}.agent.md`), 'utf8');
    assert.ok(/factory-observability\/SKILL\.md/.test(source), `${role} must participate`);
  }
});
