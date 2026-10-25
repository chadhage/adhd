import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { repoRoot } from './helpers.mjs';

const readMarkdown = (...parts) => readFileSync(join(repoRoot, ...parts), 'utf8').replaceAll('\r\n', '\n');
const skillName = 'federal-accounting-standards-and-other-pronouncements';
const skill = readMarkdown('.github', 'skills', skillName, 'SKILL.md');
const grounding = readMarkdown('.github', 'skills', skillName, 'references', 'handbook-grounding.md');
const prose = skill.replace(/\s+/g, ' ');
const sourceNotes = grounding.replace(/\s+/g, ' ');
const sourceUrl = 'https://files.fasab.gov/pdffiles/2025_FASAB_Handbook.pdf';

test('positive: the corrected FASAB skill is discoverable explicitly by both product-owner roles', () => {
  const frontmatter = skill.match(/^---\n([\s\S]+?)\n---\n/);
  assert.ok(frontmatter);
  assert.match(frontmatter[1], new RegExp(`^name: ${skillName}$`, 'm'));
  assert.ok(skillName.length <= 64);
  for (const field of ['description', 'argument-hint']) {
    const quoted = frontmatter[1].match(new RegExp(`^${field}: (".*")$`, 'm'));
    assert.ok(quoted, `${field} must be a quoted scalar`);
    const value = JSON.parse(quoted[1]);
    assert.ok(value.length > 0 && value.length <= 1024);
  }
  assert.match(skill, /^# FederalAccountingStandardsAndOtherPronouncements$/m);
  assert.ok(skill.split('\n').length < 500);
  assert.match(skill, /\.\/references\/handbook-grounding\.md/);
  for (const role of ['product-owner', 'associate-product-owner']) {
    const agent = readMarkdown('.github', 'agents', `${role}.agent.md`);
    assert.ok(agent.includes(`[FederalAccountingStandardsAndOtherPronouncements](../skills/${skillName}/SKILL.md)`));
  }
  const guide = readMarkdown('.github', 'agents', 'README.md');
  assert.ok(guide.includes(`../skills/${skillName}/SKILL.md`));
  assert.match(prose, /human confirmed \*\*Pronouncements\*\*/);
});

test('positive: handbook grounding retains exact edition, digest and distinct absolute versus chapter page locators', () => {
  assert.ok(skill.includes(sourceUrl));
  assert.ok(grounding.includes(sourceUrl));
  assert.match(sourceNotes, /Version 24 \(9\/25\)/);
  assert.match(sourceNotes, /June 30, 2025/);
  assert.match(sourceNotes, /2026-10-25T03:57:13Z/);
  assert.match(sourceNotes, /D646DD0D3E2478E7DCDDCA7E8721466FB9D250768A42E397682F1CFB2FFD6709/);
  assert.match(sourceNotes, /23357805 bytes; 2914 PDF pages/);
  assert.match(sourceNotes, /Chapter-local page numbers reset/);
  const pages = [...grounding.matchAll(/https:\/\/[^)\s]+#page=(\d+)/g)];
  assert.ok(pages.length >= 15);
  for (const [link, page] of pages) {
    assert.equal(link.split('#')[0], sourceUrl);
    assert.ok(Number(page) >= 1 && Number(page) <= 2914);
  }
  for (let id = 1; id <= 8; id += 1) assert.match(grounding, new RegExp(`^## S${id} `, 'm'));
  assert.match(sourceNotes, /not evidence that all content was read/);
});

test('negative: lower-authority guidance, concepts and prohibited analogy cannot override federal GAAP', () => {
  const categories = [...skill.matchAll(/^\| ([ABCD]) \|/gm)].map(([, category]) => category);
  assert.deepEqual(categories, ['A', 'B', 'C', 'D']);
  assert.match(skill, /\| A \| FASAB Standards and Interpretations \|/);
  assert.match(prose, /Technical Releases \| Implementation guidance cannot override categories A or B/);
  assert.match(prose, /SFFAC concepts are other accounting literature, not GAAP/);
  assert.match(prose, /analogous treatment within A-D before other accounting literature/);
  assert.match(prose, /Do not apply an analogy where the source prohibits it/);
  assert.match(prose, /Classify the passage itself, not only its container/);
  assert.match(prose, /SFFAS 34 paragraphs 9-11 contain specific provisions for federal entities using FASB/);
});

test('negative: a compilation cutoff or pending issuance cannot silently become current effective guidance', () => {
  assert.match(prose, /Pending standards and exposure drafts are not effective GAAP/);
  assert.match(prose, /issue date, effective date, permitted early application and transition provisions/);
  assert.match(prose, /Do not apply a rescinded paragraph/);
  assert.match(prose, /TR 8 was rescinded by TR 19/);
  assert.match(sourceNotes, /rescinds TR 8 in its entirety/);
  assert.match(prose, /2022-2025 land RSI requirements; resolve FY2026 disclosure changes/);
  for (const issuance of ['Technical Bulletin 2025-1', 'Staff Implementation Guidance 64.1', 'Technical Release 24', 'pending SFFAS 65']) {
    assert.ok(grounding.includes(issuance));
  }
  assert.match(sourceNotes, /not independently retrieved in this task/);
  assert.match(prose, /Missing later text or unresolved conflicts block a definitive conclusion/);
});

test('negative: Factory estimates and a full-cost model cannot fabricate accounting actuals or blanket inter-entity imputation', () => {
  assert.match(skill, /product-financial-modeling\/SKILL\.md#factory-credit-rates/);
  assert.match(prose, /not FASAB-prescribed values, capitalization thresholds, provider invoices or automatically bookable historical costs/);
  assert.match(prose, /General-purpose full cost and a special-purpose incremental decision model are not interchangeable/);
  assert.match(prose, /prefer direct tracing where feasible, then cause-and-effect assignment, then reasonable, consistent allocation/);
  assert.match(prose, /do not allocate shared costs twice/);
  assert.match(prose, /rather than imputing every other agency's costs indiscriminately/);
  assert.match(prose, /Positive ROI is not a GAAP conclusion, budget authority/);
});

test('negative: invoices, payments and executory obligations cannot collapse distinct recognition and budget bases', () => {
  assert.match(prose, /An invoice, prompt, purchase order, payment or budgetary obligation is not by itself a universal expense\/asset\/liability recognition trigger/);
  assert.match(prose, /distinguish advances\/prepayments paid from those received/);
  assert.match(prose, /do not net their assets and liabilities or immediately expense every prepayment/);
  assert.match(prose, /distinguish executory contracts from accrued liabilities/);
  assert.match(prose, /Use SFFAS 53's applicable component-entity budget and accrual reconciliation, not a rescinded statement-of-financing requirement/);
  assert.match(prose, /do not impose that requirement on the consolidated U\.S\. Government report/);
});

test('negative: software artifacts, hosted services and generic materiality cannot auto-create capitalized assets', () => {
  assert.match(prose, /Use amended TR 16 and TR 23/);
  assert.match(prose, /Do not capitalize all AI, software or hosting costs/);
  assert.match(prose, /hosting without the required rights is not automatically an owned IUS asset/);
  assert.match(prose, /Do not invent a universal capitalization threshold, useful life or materiality percentage/);
  assert.match(prose, /qualitative as well as quantitative materiality considerations/);
  assert.match(sourceNotes, /amended paragraphs 26A-27A must not be replaced with obsolete text/);
});

test('negative: handbook research cannot grant procurement, funds, journal-posting or audit authority', () => {
  assert.match(prose, /AssociateProductOwner applies it only to the chief-chartered subproduct/);
  assert.match(prose, /does not authorize journal posting, payments, obligations, contract awards or modifications, expenditure/);
  assert.match(prose, /FASAB accounting guidance is not the FAR, agency acquisition policy, an appropriation or spending authority/);
  assert.match(prose, /do not post them or invent account codes/);
  assert.match(prose, /Do not claim completeness, current GAAP conformity, audit assurance or approved procurement/);
  assert.match(sourceNotes, /local operational adaptations/);
});
