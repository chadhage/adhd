import assert from 'node:assert/strict';
import test from 'node:test';
import { validateBlueprint } from '../contracts.mjs';
import { factoryRoles, validateDeployment, validateMandate } from '../factory-contracts.mjs';
import { blueprint, factoryDeployment as deployment, factoryMandate as mandate } from './helpers.mjs';

test('positive: legacy blueprints remain manual and deployment choices round-trip without authority', () => {
  assert.equal(validateBlueprint(blueprint).deployment, undefined);
  const result = validateBlueprint({ ...blueprint, deployment });
  assert.deepEqual(result.deployment, deployment);
  assert.equal(result.deployment.mandate, undefined);
  assert.equal(new Set(factoryRoles).size, 9);
});

test('negative: configuration cannot smuggle credentials, approvals, commands, or unsupported targets', () => {
  for (const extra of [{ token: 'not-permitted' }, { approved: true }, { command: 'shell' }]) {
    assert.throws(() => validateDeployment({ ...deployment, ...extra }), /invalid shape/);
  }
  assert.throws(() => validateDeployment({ ...deployment, target: 'invented' }), /deployment target/);
  assert.throws(() => validateDeployment({ ...deployment, resources: { cpu: 0, memoryMiB: 4096 } }), /CPU/);
});

test('negative: mandates reject unfunded concurrency, expired authority and invented zero cost', () => {
  assert.throws(() => validateMandate({ ...mandate, maxCredits: 269 }), /reserve/);
  assert.throws(() => validateMandate({ ...mandate, expiresAt: '2000-01-01T00:00:00Z' }), /expired/);
  assert.throws(() => validateMandate({ ...mandate, creditsPerTask: 8 }), /30/);
  assert.throws(() => validateMandate({ ...mandate, cost: { currency: 'USD', maxAmount: 100, creditRate: 0, infrastructureReserve: 0, rateVersion: 'fixture' } }), /credit rate/);
});

test('positive: owner choices include funded credits and separately sourced currency ceilings', () => {
  const cost = { currency: 'USD', maxAmount: 400, creditRate: 0.1, infrastructureReserve: 20, rateVersion: 'owner-confirmed-fixture-rate' };
  assert.deepEqual(validateMandate({ ...mandate, cost }).cost, cost);
  assert.deepEqual(validateMandate(mandate).actions, mandate.actions);
});
