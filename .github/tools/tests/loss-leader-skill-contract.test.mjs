import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { repoRoot } from './helpers.mjs';

const readMarkdown = (...parts) => readFileSync(join(repoRoot, ...parts), 'utf8').replaceAll('\r\n', '\n');
const skill = readMarkdown('.github', 'skills', 'loss-leader-theory', 'SKILL.md');
const grounding = readMarkdown('.github', 'skills', 'loss-leader-theory', 'references', 'paper-grounding.md');
const prose = skill.replace(/\s+/g, ' ');
const sourceNotes = grounding.replace(/\s+/g, ' ');
const sourceUrl = 'https://i.cs.hku.hk/%7Ehubert/wine07.pdf';

test('positive: LossLeaderTheory is discoverable through valid metadata and the shared product-owner catalog', () => {
  const frontmatter = skill.match(/^---\n([\s\S]+?)\n---\n/);
  assert.ok(frontmatter);
  assert.match(frontmatter[1], /^name: loss-leader-theory$/m);
  for (const field of ['description', 'argument-hint']) {
    const quoted = frontmatter[1].match(new RegExp(`^${field}: (".*")$`, 'm'));
    assert.ok(quoted, `${field} must be a quoted scalar`);
    const value = JSON.parse(quoted[1]);
    assert.ok(value.length > 0 && value.length <= 1024);
  }
  assert.match(skill, /# LossLeaderTheory/);
  assert.ok(skill.split('\n').length < 500);
  assert.match(skill, /\.\/references\/paper-grounding\.md/);
  const chief = readMarkdown('.github', 'agents', 'product-owner.agent.md');
  const associate = readMarkdown('.github', 'agents', 'associate-product-owner.agent.md');
  const guide = readMarkdown('.github', 'agents', 'README.md');
  const pricing = readMarkdown('.github', 'skills', 'pricing-ai-powered-services', 'SKILL.md');
  assert.match(chief, /\[loss-leader-theory\]\(\.\.\/skills\/loss-leader-theory\/SKILL\.md\)/);
  assert.match(associate, /ProductOwner skill catalog/);
  assert.match(associate, /\[LossLeaderTheory\]\(\.\.\/skills\/loss-leader-theory\/SKILL\.md\)/);
  assert.match(guide, /\[LossLeaderTheory\]\(\.\.\/skills\/loss-leader-theory\/SKILL\.md\)/);
  assert.match(pricing, /\[LossLeaderTheory\]\(\.\.\/loss-leader-theory\/SKILL\.md\)/);
});

test('positive: grounding preserves source identity, digest and PDF versus printed-page numbering', () => {
  assert.ok(skill.includes(sourceUrl));
  assert.ok(grounding.includes(sourceUrl));
  assert.match(sourceNotes, /A Theory of Loss-Leaders: Making Money by Pricing Below Cost/);
  for (const author of ['Maria-Florina Balcan', 'Avrim Blum', 'T-H. Hubert Chan', 'MohammadTaghi Hajiaghayi']) {
    assert.ok(grounding.includes(author));
  }
  assert.match(sourceNotes, /WINE 2007, LNCS 4858, pp\. 293-299/);
  assert.match(sourceNotes, /2026-10-25T03:40:48Z/);
  assert.match(sourceNotes, /82D5418A7B6ADFDCFA81B04A397CCDCF9B26BA7AF6C1D59C378D84FB68B70BAF/);
  assert.match(sourceNotes, /351818 bytes; 7 PDF pages/);
  assert.match(sourceNotes, /PDF pages 1-7 correspond to printed pages 293-299/);
  const pages = [...grounding.matchAll(/https:\/\/[^)\s]+#page=(\d+)/g)];
  assert.ok(pages.length >= 7);
  for (const [link, page] of pages) {
    assert.equal(link.split('#')[0], sourceUrl);
    assert.ok(Number(page) >= 1 && Number(page) <= 7);
  }
  for (let id = 1; id <= 6; id += 1) assert.match(grounding, new RegExp(`^## S${id} `, 'm'));
});

test('positive: worked fixtures retain negative discount contribution and floor only zero-cost coupon charges', () => {
  const discount = skill.split('### Nonzero-cost discount fixture\n')[1]?.split('\n### Zero-cost coupon fixture')[0];
  assert.ok(discount);
  const rows = [...discount.matchAll(/^\| (A|A\+B|B) \| (\d+) \| (\d+) \| (\d+) \| (-?\d+) \|$/gm)];
  assert.equal(rows.length, 3);
  const contributions = rows.map(([, bundle, valuation, revenue, cost, contribution]) => {
    const items = bundle.split('+');
    const expectedRevenue = items.reduce((total, item) => total + (item === 'A' ? 12 : 3), 0);
    assert.equal(Number(revenue), expectedRevenue);
    assert.ok(Number(revenue) <= Number(valuation));
    assert.equal(Number(cost), items.length * 5);
    assert.equal(Number(contribution), Number(revenue) - Number(cost));
    return Number(contribution);
  });
  assert.equal(contributions[0] + contributions[1], 12);
  assert.equal(contributions.reduce((total, value) => total + value, 0), 10);
  const coupon = skill.split('### Zero-cost coupon fixture\n')[1]?.split('\n## Output and checks')[0];
  assert.ok(coupon);
  const couponRows = [...coupon.matchAll(/^\| (A|A\+B) \| (-?\d+) \| (\d+) \| (\d+) \| (\d+) \|$/gm)];
  assert.equal(couponRows.length, 2);
  for (const [, bundle, sum, charge, valuation, contribution] of couponRows) {
    assert.equal(Number(sum), bundle.split('+').reduce((total, item) => total + (item === 'A' ? -3 : 8), 0));
    assert.equal(Number(charge), Math.max(Number(sum), 0));
    assert.ok(Number(charge) <= Number(valuation));
    assert.equal(Number(contribution), Number(charge));
  }
  assert.match(coupon, /at valuation 4 that\s+buyer would not buy/);
});

test('negative: negative margins and reduced valuations cannot be erased or confused with selling prices', () => {
  assert.match(prose, /p_i = s_i - c_i/);
  assert.match(prose, /w_j = v_j - sum\(c_i in S_j\)/);
  assert.match(prose, /do not floor discount profit at zero or drop loss-making buyers/);
  assert.match(prose, /Reduced valuations can be negative; do not silently replace them with zero/);
  assert.match(prose, /p_i >= -c_i/);
  assert.match(prose, /Below cost can still mean a positive selling price/);
});

test('negative: a zero payable coupon charge cannot erase real costs or authorize cash payouts', () => {
  assert.match(prose, /coupon model assumes zero marginal cost/);
  assert.match(prose, /Negative quote totals yield a free bundle, not a cash payment/);
  assert.match(prose, /Credits cannot be cashed out/);
  assert.match(prose, /contribution is charge minus cost/);
  assert.match(prose, /Do not floor that contribution at zero/);
  assert.match(prose, /paid inference, human work or support/);
});

test('negative: single-minded assumptions cannot certify real customer behavior or permit cherry-picking omissions', () => {
  assert.match(prose, /known customer bundles\/valuations and rational, single-minded buyers/);
  assert.match(prose, /no free disposal/);
  assert.match(prose, /Real substitutions, repeat purchases, resale, capacity limits and uncertain demand require explicit extensions/);
  assert.match(prose, /do not invent valuations, attachment rates or profitable customer types/);
  assert.match(prose, /Do not hold the old buyer set fixed after a price change/);
  assert.match(prose, /Do not exclude a loss-making buyer who qualifies under the posted offer/);
});

test('negative: theorem gaps and approximation schemes cannot promise generic promotion returns or solver execution', () => {
  assert.match(sourceNotes, /existence\/worst-case separation results, not expected uplift/);
  assert.match(sourceNotes, /All customer valuations are 1/);
  assert.match(sourceNotes, /minor-free graphs, fixed B, and either all customer valuations at least 1 or no multi-edge/);
  assert.match(sourceNotes, /not arbitrary overlapping bundle families/);
  assert.match(sourceNotes, /technical report was not retrieved or independently checked/);
  assert.match(sourceNotes, /neither independently proves the results nor implements a solver/);
  assert.match(prose, /This skill does not implement those solvers/);
});

test('negative: a larger basket, future upsells, or Factory cost defaults cannot fabricate incremental profit', () => {
  assert.match(prose, /Existing complement purchases are not automatically incremental gains/);
  assert.match(prose, /cannibalized full-price sales/);
  assert.match(prose, /do not count all projected lifetime revenue as current profit/);
  assert.match(prose, /more demand or higher valuations need not improve attainable profit/);
  assert.match(skill, /product-financial-modeling\/SKILL\.md#factory-credit-rates/);
  assert.match(prose, /Those internal rates are not customer prices or evidence of zero marginal delivery cost/);
  assert.match(prose, /Avoid duplicate costs already covered by the blended basis/);
});

test('negative: source theory and a positive forecast cannot approve subsidies, commercial offers or legal compliance', () => {
  assert.match(prose, /only to the chief-chartered subproduct/);
  assert.match(prose, /This skill does not authorize spending, subsidies, customer contact, experiments, published prices, binding offers, contract changes or release/);
  assert.match(prose, /theoretical profit is not proof of legal compliance/);
  assert.match(prose, /A positive forecast alone does not approve a subsidy/);
  assert.match(prose, /human-approved subsidy\/burn ceiling/);
  assert.match(prose, /aggregate profit is not itself full lifecycle ROI or financial approval/);
  assert.match(sourceNotes, /local adaptations/);
});
