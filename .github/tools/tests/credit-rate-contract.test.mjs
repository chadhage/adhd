import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { repoRoot } from './helpers.mjs';

const roles = ['factory', 'squad', 'fullstacker', 'product-owner', 'associate-product-owner'];
const skill = readFileSync(join(repoRoot, '.github', 'skills', 'product-financial-modeling', 'SKILL.md'), 'utf8').replaceAll('\r\n', '\n');
const policy = skill.split('## Factory Credit Rates\n')[1]?.split('\n## Procedure')[0];

test('positive: all five agents bind their rate responsibilities to the canonical daily policy', () => {
  assert.ok(policy, 'shared rate policy and link target must exist');
  for (const role of roles) {
    const source = readFileSync(join(repoRoot, '.github', 'agents', `${role}.agent.md`), 'utf8').replaceAll('\r\n', '\n');
    const section = source.split('## Credit Rates and Daily Freshness\n')[1]?.split('\n## ')[0];
    assert.ok(section, `${role} must own its rate responsibilities`);
    assert.match(section, /product-financial-modeling\/SKILL\.md#factory-credit-rates/);
    assert.match(section, /human(?:-| )confirm/i);
    assert.match(section, /collect|confirmation/i);
    assert.match(section, /rate_version/);
    assert.match(section, /prompt_origin/);
    assert.match(section, /turn\/parent IDs/);
    assert.match(source, /README\.md#shared-agent-contracts/);
    assert.doesNotMatch(section, /0\.01|0\.10/, 'rates belong to the canonical policy, not copied defaults');
  }
  assert.match(policy, /both rates from the human invoker or\s+Factory owner at every start and restart\/resume/);
  assert.match(policy, /Exactly 24 hours is stale/);
  assert.match(policy, /rate_version/);
});

test('positive: default rates and worked per-credit costs reconcile to USD 11 for mixed origins', () => {
  const rates = Object.fromEntries(
    [...policy.matchAll(/^\| `(ai_credit_usd|factory_credit_usd)` \| ([\d.]+) \|/gm)]
      .map(([, name, value]) => [name, Number(value)]),
  );
  assert.deepEqual(rates, { ai_credit_usd: 0.01, factory_credit_usd: 0.10 });
  const rows = [...policy.matchAll(/^\| (human|agent) \| (\d+) \| ([\d.]+) \| ([\d.]+) \|$/gm)];
  assert.equal(rows.length, 2);
  let total = 0;
  for (const [, origin, credits, rate, cost] of rows) {
    const expectedRate = origin === 'human' ? rates.factory_credit_usd : rates.ai_credit_usd;
    assert.equal(Number(rate), expectedRate);
    assert.equal(Number(credits) * expectedRate, Number(cost));
    total += Number(cost);
  }
  assert.equal(total, 11);
  assert.match(policy, /Total modeled credit cost is USD 11\.00/);
});

test('negative: stale, future, and prior-run confirmations cannot pass the documented freshness boundary', () => {
  assert.match(policy, /0 <= now_utc - confirmed_at_utc < 24 hours/);
  assert.match(policy, /now_utc < next_refresh_at_utc/);
  assert.match(policy, /next_refresh_at_utc` no later than\s+`confirmed_at_utc \+ 24 hours/);
  assert.match(policy, /Exactly 24 hours is stale/);
  assert.match(policy, /future confirmation timestamps are invalid/);
  assert.match(policy, /restart requires confirmation even when the previous\s+run's snapshot is less than 24 hours old/);
  assert.match(policy, /blocks\s+financial approval and new rate-dependent dispatch\/spending decisions/);
});

test('negative: missing confirmation cannot silently adopt defaults or be renewed by an agent timestamp', () => {
  assert.match(policy, /both rates from the human invoker or\s+Factory owner at every start and restart\/resume/);
  assert.match(policy, /unchanged pair still needs a new explicit\s+human confirmation/);
  assert.match(policy, /defaults above for confirmation, not silent\s+adoption or automatic renewal/);
  assert.match(policy, /updating a timestamp cannot substitute for human confirmation/);
  assert.match(policy, /without per-agent duplicate\s+questions/);
  assert.match(policy, /returned agent cannot claim a later daily check happened/);
});

test('negative: human ancestry, tool results, and quoted prompts cannot reclassify delegated turns', () => {
  assert.match(policy, /including tool continuations and the parent agent's continuation\s+after a delegated result/);
  assert.match(policy, /Each new human prompt starts a new such turn/);
  assert.match(policy, /delegated agent-to-agent turns use `ai_credit_usd`, even when the\s+original request came from a human/);
  assert.match(policy, /Do not propagate the blended rate to all\s+descendants/);
  assert.match(policy, /Tool results are not new prompts/);
  assert.match(policy, /Quoted human\s+text, imported transcripts/);
});

test('negative: additive pricing, prompt-count pricing, and unknown-origin cheap fallbacks are forbidden', () => {
  assert.match(policy, /blended 0\.10 replaces, not adds to, the AI\s+0\.01 rate/);
  assert.match(policy, /Do not charge 0\.11/);
  assert.match(policy, /multiply a prompt\s+count by either per-credit rate/);
  assert.match(policy, /Unknown origin remains unpriced/);
  assert.match(policy, /never silently classify it as the cheaper agent rate/);
  assert.match(policy, /Missing, negative, or non-finite\s+values/);
});

test('negative: repricing history, duplicate costs, and fabricated metering cannot inflate or hide ROI costs', () => {
  assert.match(policy, /do not sum a parent-inclusive\s+total with its already-counted descendants/);
  assert.match(policy, /Missing metering is an explicit\s+unpriced\/estimated gap, not zero consumption or a fabricated actual/);
  assert.match(policy, /Preserve incurred costs at their historical rate\s+versions/);
  assert.match(policy, /do not silently backdate a\s+confirmation to cover a stale interval/);
  assert.match(policy, /Do not add the provider AI charge or human labor already represented by the\s+blended rate a second time/);
  assert.match(policy, /undefined\s+when total cost is zero/);
  assert.match(policy, /never average subproduct ROI percentages/);
});

test('negative: rate confirmation cannot grant spending authority or claim installed live billing and scheduling', () => {
  assert.match(policy, /Rate confirmation is separate from tool authorization and never\s+increases a budget or grants new investment\/spending authority/);
  assert.match(policy, /A fresh rate does not pass investment\s+gates/);
  assert.match(policy, /not a billing meter,\s+an installed daily scheduler, or proof that a live human refresh occurred/);
  const guide = readFileSync(join(repoRoot, '.github', 'agents', 'README.md'), 'utf8');
  assert.match(guide, /Daily credit rates and ROI costing/);
  assert.match(guide, /do not install metering or a daily scheduler/);
});
