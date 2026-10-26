import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { repoRoot } from './helpers.mjs';

const read = (...parts) => readFileSync(join(repoRoot, '.github', ...parts), 'utf8').replaceAll('\r\n', '\n');
const section = (source, heading) => source.split(`## ${heading}\n`)[1]?.split('\n## ')[0] ?? '';
const normalized = (source) => source.replace(/\s+/g, ' ');
const factory = read('agents', 'factory.agent.md');
const shared = read('skills', 'factory-mvp-and-recovery', 'SKILL.md');
const andon = normalized(read('skills', 'factory-andon', 'SKILL.md'));
const policy = normalized(section(shared, 'Continuous Production and Least-Cost Escalation'));
const policyAnchor = 'factory-mvp-and-recovery/SKILL.md#continuous-production-and-least-cost-escalation';

test('positive: continuous target-product production is an explicit bounded Factory mandate shared with readiness and economics owners', () => {
  const mandate = normalized(section(factory, 'Mandate'));
  assert.match(mandate, /continuous production of the target product/);
  assert.match(mandate, /authorized operating window/);
  for (const file of ['factory.agent.md', 'factory-launcher.agent.md', 'product-owner.agent.md', 'README.md']) {
    assert.ok(read('agents', file).includes(policyAnchor), `${file} must bind to the same escalation policy`);
  }
  assert.match(policy, /integrated.*verified.*increments/);
});

test('positive: ProductOwner compares the full interruption and escalation cost using traceable economic inputs', () => {
  assert.match(policy, /ProductOwner.*option comparison/);
  for (const cost of [
    'cost of delay', 'idle capacity', 'AI/tool', 'coordination',
    'human interruption', 'context switching', 'decision latency',
    'restart', 'remobilization', 'rework', 'recurrence risk',
  ]) {
    assert.ok(policy.includes(cost), `the comparison must include ${cost}`);
  }
  for (const input of ['common currency', 'horizon', 'sourced inputs', 'ranges', 'without double counting']) {
    assert.ok(policy.includes(input), `economic comparisons must retain ${input}`);
  }
});

test('negative: failed negotiations alone cannot authorize a unilateral or premature human escalation', () => {
  assert.match(policy, /three unsuccessful negotiation rounds/);
  assert.match(policy, /safe authorized alternatives.*exhausted/);
  assert.match(policy, /all four accountable roles.*explicitly agree on the same/);
  assert.match(policy, /least expected total incremental product cost/);
  assert.match(normalized(section(factory, 'Recovery Panel')), /least-cost.*quorum/);
  assert.doesNotMatch(normalized(section(shared, 'Recovery and Resumption')), /recovery path is exhausted or requires a human-owned decision/);
});

test('negative: failed Andon resume ballots are not quorum agreement that human escalation is the least-cost option', () => {
  assert.ok(andon.includes(policyAnchor), 'Andon must use the common economic gate');
  assert.match(andon, /three failed.*separate escalation ballot/);
  assert.match(andon, /five explicit agree votes.*seven seats/);
  assert.match(policy, /failed resume ballots do not constitute agreement to escalate/);
  assert.match(andon, /denominator remains seven/);
});

test('negative: missing votes or uncertain costs cannot be reported as quorum-approved least-cost escalation', () => {
  assert.match(policy, /Non-response, unavailability and abstention are not agreement/);
  assert.match(policy, /Missing inputs or overlapping cost ranges.*do not prove a least-cost option/);
  assert.match(policy, /quorum cannot be formed.*approved deadline/);
  assert.match(policy, /unresolved.*not.*quorum-approved least-cost/);
});

test('negative: continuity economics and quorum cannot delay mandatory containment or override approval and resource limits', () => {
  assert.match(policy, /No cost saving or quorum.*override.*safety.*permission.*budget.*quality.*release/);
  assert.match(policy, /Mandatory safety.*notifications.*human-only authentication.*must not wait/);
  assert.match(policy, /required human approvals.*before.*affected action/);
  assert.match(policy, /Never relabel a routine blocker as an exception/);
});

test('negative: negotiation cannot become a repeated-cost loop or stop unaffected authorized work', () => {
  assert.match(policy, /Do not reset the round counter/);
  assert.match(policy, /repeat a failed action without changed evidence or hypothesis/);
  assert.match(policy, /Continue unaffected authorized work/);
  assert.match(policy, /human operating window.*not.*extended/);
  assert.match(normalized(section(shared, 'Recovery and Resumption')), /least-cost.*quorum/);
});

test('negative: an escalation without a durable costed decision and restart evidence cannot be treated as a completed recovery', () => {
  for (const evidence of ['Historian', 'proposal revision', 'option comparison', 'ballots', 'dissent', 'attempts', 'least-cost rationale', 'continued work', 'restart']) {
    assert.ok(policy.includes(evidence), `the decision record must retain ${evidence}`);
  }
  assert.match(policy, /observed progress.*not.*approval or a plan alone/);
  assert.match(normalized(section(factory, 'Escalation to Human Owner')), /cost.*quorum/);
  assert.match(andon, /least-cost rationale/);
});
