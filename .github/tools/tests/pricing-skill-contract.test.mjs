import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { repoRoot } from './helpers.mjs';

const readMarkdown = (...parts) => readFileSync(join(repoRoot, ...parts), 'utf8').replaceAll('\r\n', '\n');
const skill = readMarkdown('.github', 'skills', 'pricing-ai-powered-services', 'SKILL.md');
const grounding = readMarkdown('.github', 'skills', 'pricing-ai-powered-services', 'references', 'paper-grounding.md');
const prose = skill.replace(/\s+/g, ' ');
const sourceNotes = grounding.replace(/\s+/g, ' ');
const sourceUrl = 'https://digitaleconomy.stanford.edu/app/uploads/2026/08/AI_Agents_and_Consulting_Service_Pricing.pdf';

test('positive: PricingAIPoweredServices has discoverable skill metadata and both owner roles can find it', () => {
  const frontmatter = skill.match(/^---\n([\s\S]+?)\n---\n/);
  assert.ok(frontmatter);
  assert.match(frontmatter[1], /^name: pricing-ai-powered-services$/m);
  for (const field of ['description', 'argument-hint']) {
    const quoted = frontmatter[1].match(new RegExp(`^${field}: (".*")$`, 'm'));
    assert.ok(quoted, `${field} must be a valid quoted scalar`);
    const value = JSON.parse(quoted[1]);
    assert.ok(value.length > 0 && value.length <= 1024);
  }
  assert.match(skill, /# PricingAIPoweredServices/);
  assert.ok(skill.split('\n').length < 500);
  assert.match(skill, /\.\/references\/paper-grounding\.md/);
  const chief = readMarkdown('.github', 'agents', 'product-owner.agent.md');
  const associate = readMarkdown('.github', 'agents', 'associate-product-owner.agent.md');
  const guide = readMarkdown('.github', 'agents', 'README.md');
  assert.match(chief, /\[pricing-ai-powered-services\]\(\.\.\/skills\/pricing-ai-powered-services\/SKILL\.md\)/);
  assert.match(associate, /ProductOwner skill catalog/);
  assert.match(associate, /\[PricingAIPoweredServices\]\(\.\.\/skills\/pricing-ai-powered-services\/SKILL\.md\)/);
  assert.match(guide, /\[PricingAIPoweredServices\]\(\.\.\/skills\/pricing-ai-powered-services\/SKILL\.md\)/);
});

test('positive: source notes preserve the verified paper identity, digest and bounded PDF page citations', () => {
  assert.ok(skill.includes(sourceUrl));
  assert.ok(grounding.includes(sourceUrl));
  assert.match(sourceNotes, /Pricing Consulting Services in the Age of Agentic AI: A Strategy Map for Executives/);
  assert.match(sourceNotes, /Erik Brynjolfsson and Georgios Petropoulos/);
  assert.match(sourceNotes, /2026-08-23/);
  assert.match(sourceNotes, /2026-10-25T03:16:09Z/);
  assert.match(sourceNotes, /B01BC6E17C696A423EFB6E2B447C73D5C618268F33AA35C0EA14A4109D9E00A7/);
  assert.match(sourceNotes, /402530 bytes; 40 PDF pages/);
  const pages = [...grounding.matchAll(/https:\/\/[^)\s]+#page=(\d+)/g)];
  assert.ok(pages.length >= 10);
  for (const [link, page] of pages) {
    assert.equal(link.split('#')[0], sourceUrl);
    assert.ok(Number(page) >= 1 && Number(page) <= 40);
  }
  for (let id = 1; id <= 7; id += 1) assert.match(grounding, new RegExp(`^## S${id} `, 'm'));
});

test('negative: contract selection cannot ignore either observability axis or the fixed-scope qualification', () => {
  assert.match(skill, /\| High \| Low \| Time-and-materials \|/);
  assert.match(skill, /\| High \| High \| Fixed-scope project fee \|/);
  assert.match(skill, /\| Low \| Low \| Access subscription or retainer \|/);
  assert.match(skill, /\| Low \| High \| Outcome-linked fee, possibly with a base \|/);
  assert.match(skill, /\| Partial or mixed \| Partial or mixed \| Hybrid \|/);
  assert.match(prose, /Requires stable scope, a verifiable acceptance proxy, and a feasible cost commitment/);
  assert.match(prose, /preserve unknowns rather than forcing a score/);
  assert.match(sourceNotes, /Exact implementation is the noiseless-outcome limit/);
});

test('negative: telemetry and consumption cannot substitute for attributable customer outcomes', () => {
  assert.match(prose, /Telemetry does not establish attribution/);
  assert.match(prose, /Separate instrument error from uncertainty about who caused the result/);
  assert.match(prose, /More telemetry alone does not cure confounding/);
  assert.match(prose, /A conversation or action is usage, not automatically an outcome/);
  assert.match(prose, /audit\/dispute route/);
  assert.match(prose, /pricing a metric can encourage gaming/);
});

test('negative: Factory cost defaults cannot become customer prices or a second credit-rate authority', () => {
  assert.match(skill, /product-financial-modeling\/SKILL\.md#factory-credit-rates/);
  assert.match(prose, /do not create a second rate authority/);
  assert.match(prose, /Factory credit costs are internal cost assumptions, not customer prices/);
  assert.match(prose, /Avoid counting human\/AI cost already included in the blended basis twice/);
  assert.match(prose, /A cost-plus floor or attractive margin is not evidence of willingness to pay/);
  assert.match(prose, /a cost refresh is not automatic permission to change customer prices/);
});

test('negative: ordinal ratings and the paper model cannot manufacture numerical fees or unsupported probabilities', () => {
  assert.match(prose, /Do not convert ordinal bands into numerical fee weights or invent signal variances/);
  assert.match(sourceNotes, /variances, not standard deviations, ordinal ratings, revenue shares or a ready-made fee calculator/);
  assert.match(sourceNotes, /differently scaled metrics or correlated signals/);
  assert.match(prose, /not a default markup or the paper's signal-weight ratio/);
  assert.match(prose, /Keep scenarios unweighted unless probabilities have a defensible source/);
  assert.match(prose, /rather than silently clipping adverse observations/);
});

test('negative: illustrative cases and background discussions cannot become validated demand or live price benchmarks', () => {
  assert.match(prose, /conceptual framework with illustrative cases, not confirmatory empirical validation/);
  assert.match(sourceNotes, /Those discussions were not research interviews/);
  assert.match(sourceNotes, /Do not promote background conversations into VOC/);
  assert.match(sourceNotes, /not independently verified current vendor prices/);
  assert.match(sourceNotes, /peer-review\/publication status not independently established/);
  assert.match(sourceNotes, /does not guarantee higher provider margins or establish a particular price/);
});

test('negative: local adaptations cannot grant commercial authority or replace lifecycle economics with contribution', () => {
  assert.match(prose, /This skill does not authorize customer contact, experiments, private-data access, spending, publishing prices, binding quotes, contract changes/);
  assert.match(prose, /only to the chief-chartered subproduct/);
  assert.match(prose, /Contribution is not full lifecycle ROI/);
  assert.match(prose, /provider revenue is a customer cost, not the customer's realized benefit/);
  assert.match(sourceNotes, /local operational adaptations/);
  assert.match(sourceNotes, /does not supply Factory AI\/blended credit rates, a standard margin, a default outcome share/);
});
