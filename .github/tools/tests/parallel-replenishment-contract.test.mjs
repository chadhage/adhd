import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { repoRoot } from './helpers.mjs';

const read = (...parts) => readFileSync(join(repoRoot, '.github', ...parts), 'utf8').replaceAll('\r\n', '\n');
const agent = (name) => read('agents', `${name}.agent.md`);
const section = (source, heading) => source.split(`## ${heading}\n`)[1]?.split('\n## ')[0] ?? '';
const normalized = (source) => source.replace(/\s+/g, ' ');
const factory = agent('factory');
const launcher = agent('factory-launcher');
const shared = read('skills', 'factory-mvp-and-recovery', 'SKILL.md');
const parallel = normalized(section(shared, 'Concurrent Replenishment and Delivery'));
const atomic = normalized(section(shared, 'Atomic and Independent Cards'));

test('positive: Factory can dispatch replenishment roles and binds continuous staffing to the selected profile', () => {
  const allowed = factory.match(/^agents: \[([^\]]+)\]$/m)?.[1].split(',').map((name) => name.trim()) ?? [];
  for (const role of ['VOC', 'ProductOwner', 'AssociateProductOwner', 'Kanban', 'Squad', 'Fullstacker']) {
    assert.ok(allowed.includes(role), `Factory must be able to dispatch ${role}`);
  }
  const factoryRoster = normalized(section(factory, 'Roster and Scale'));
  assert.match(factoryRoster, /parallel.*supervised.*minimum one of each standing role/i);
  assert.match(factoryRoster, /bounded.*as needed/i);
  assert.match(factoryRoster, /\| `AssociateProductOwner` \|/);
  assert.match(factoryRoster, /replenishment-support/);
  const roster = normalized(section(launcher, 'Minimum Viable Factory Gate'));
  assert.ok(/parallel\/supervised profiles.*VOC, ProductOwner, AssociateProductOwner, Kanban/.test(roster), 'Launcher must validate all four replenishment roles in continuous profiles');
});

test('positive: all participating roles explicitly bind to the shared concurrent replenishment contract', () => {
  for (const role of ['factory', 'factory-launcher', 'voc', 'product-owner', 'associate-product-owner', 'kanban', 'squad', 'fullstacker']) {
    assert.ok(agent(role).includes('factory-mvp-and-recovery/SKILL.md#concurrent-replenishment-and-delivery'), `${role} must share the concurrency contract`);
  }
  for (const role of ['VOC', 'ProductOwner', 'AssociateProductOwner', 'Kanban']) {
    assert.ok(parallel.includes(`\`${role}\``), `the standing stream must name ${role}`);
  }
  for (const evidence of ['assignment IDs', 'observed start', 'last progress', 'overlap', 'next checkpoint']) {
    assert.ok(parallel.includes(evidence), `concurrency reports must include ${evidence}`);
  }
});

test('positive: atomic independent readiness is wired through board admission, decomposition and delivery', () => {
  for (const [folder, name] of [
    ['skills', 'kanban-card-flow'],
    ['skills', 'kanban-board-reconciliation'],
    ['skills', 'kanban-one-factory-many-squads'],
    ['skills', 'fullstack-atomic-decomposition'],
  ]) {
    const source = read(folder, name, 'SKILL.md');
    assert.ok(source.includes('factory-mvp-and-recovery/SKILL.md#atomic-and-independent-cards'), `${name} must verify card independence`);
  }
  for (const role of ['kanban', 'product-owner', 'associate-product-owner', 'squad', 'fullstacker']) {
    assert.ok(agent(role).includes('factory-mvp-and-recovery/SKILL.md#atomic-and-independent-cards'), `${role} must preserve the atomic card gate`);
  }
  for (const requirement of ['one bounded', 'independently verifiable', 'prerequisites', 'write ownership', 'acceptance', 'evidence']) {
    assert.ok(atomic.includes(requirement), `atomic readiness must cover ${requirement}`);
  }
});

test('negative: delivery completion and reserve depletion cannot serialize or start the replenishment stream late', () => {
  assert.ok(/Start both streams before waiting for either to complete/.test(parallel), 'dispatch must not await complete delivery or complete replenishment');
  assert.ok(/Do not wait for a Squad or Fullstacker to return/.test(parallel), 'long delivery calls cannot block other role dispatch');
  assert.ok(/reserve thresholds change urgency, not whether replenishment runs/.test(parallel), 'replenishment must already be active before a deficit');
  assert.ok(/not a finish-then-start sequence/.test(normalized(section(factory, 'Operating Loop'))), 'the numbered loop must not imply waterfall scheduling');
});

test('negative: configured workers, sequential fallback and returned calls cannot prove always-on concurrency', () => {
  assert.ok(/Sequential fallback is degraded operation, not fulfillment/.test(parallel), 'runtime failure must not be success-shaped');
  assert.ok(/A returned invocation is not a live worker/.test(parallel), 'bounded turns cannot become fictional daemons');
  assert.ok(/actual runtime capacity/.test(parallel), 'both streams need real capacity');
  assert.ok(/separately authorized.*supervisor/.test(parallel), 'unattended lifetime requires its own executor and authority');
  assert.ok(/overlap.*delivery/.test(parallel), 'progress must overlap with real delivery, not only other analyses');
});

test('negative: standing associate support cannot bypass chief ownership or the dedicated-subproduct scaling gate', () => {
  const associate = normalized(agent('associate-product-owner'));
  const chief = normalized(agent('product-owner'));
  assert.ok(/replenishment-support/.test(associate), 'a bounded support charter must work before a dedicated split exists');
  assert.ok(/not dedicated subproduct ownership/.test(parallel), 'the standing role must not silently become a new portfolio owner');
  assert.ok(/P\(acceleration\) > 0\.80/.test(associate), 'the strict scaling threshold must remain');
  assert.ok(/ProductOwner agreement/.test(associate), 'chief agreement must remain required');
  assert.ok(/^agents: \[\]$/m.test(agent('associate-product-owner')), 'associates must not recursively delegate');
  assert.ok(/same assignment.*twice/.test(chief), 'Factory and chief must not create duplicate associate workers');
});

test('negative: parallel roles and member queues cannot create competing boards or concurrent shared-record writers', () => {
  assert.ok(/one authoritative two-bucket board/.test(parallel), 'parallel streams need one board');
  assert.ok(/assignment views, not separate boards/.test(parallel), 'role/member queues must be projections, not copied cards');
  assert.ok(/Kanban remains the sole board writer/.test(parallel), 'replenishment roles must not bypass board ownership');
  assert.ok(/serialize shared.*writes/.test(parallel), 'independent activity does not authorize concurrent shared writes');
  assert.ok(/WIP.*budget/.test(parallel), 'always-on operation must retain resource limits');
});

test('negative: unfinished peer prerequisites, collisions and layer-only splits cannot pass independent-card readiness', () => {
  assert.ok(/no dependency on another unfinished card/.test(atomic), 'ready cards must be independently pullable');
  assert.ok(/completed and verified/.test(atomic), 'a planned predecessor is not a satisfied prerequisite');
  assert.ok(/non-overlapping write ownership/.test(atomic), 'independent cards must not require unsafe overlapping edits');
  assert.ok(/Do not hide dependencies/.test(atomic), 'readiness must not be obtained by omission');
  assert.ok(/layer-only/.test(atomic), 'slicing must preserve vertical outcomes');
  assert.ok(/tasks within one card may still have an explicit dependency graph/.test(atomic), 'atomic cards must not erase real internal task order');
});

test('negative: proposals, assigned refinement and fixtures cannot be counted as newly True Ready delivery cards', () => {
  assert.ok(/new delivery reserve.*only after/.test(atomic), 'readiness evidence must precede reserve admission');
  assert.ok(/ProductOwner authorization/.test(atomic), 'role activity cannot create scope authority');
  assert.ok(/Kanban verifies/.test(atomic), 'the authoritative owner must verify readiness');
  assert.ok(/fixtures.*do not replace/.test(atomic), 'independence must not be proven by mocking away required integration');
  assert.ok(/research.*not.*delivery reserve/.test(atomic), 'scoped research may not inflate the ready delivery count');
});

test('negative: legacy blocked work cannot disappear to manufacture a fully ready board', () => {
  assert.ok(/Existing unready or blocked cards remain visible/.test(atomic), 'complete inventory must survive stronger readiness rules');
  assert.ok(/never delete.*hide.*unfinished/.test(atomic), 'normalization must not hide unfinished work');
  assert.ok(/split.*supersed/.test(atomic), 'authorized re-slicing must preserve relationships and evidence');
});

test('negative: filled reserves, exhausted evidence and runtime limits cannot authorize fictional activity or unlimited operation', () => {
  assert.ok(/meeting the reserve does not demobilize/.test(parallel), 'a full reserve does not stop the standing stream');
  assert.ok(/Never invent demand/.test(parallel), 'continuous staffing must not turn into busywork');
  assert.ok(/operating window/.test(parallel), 'always-on remains bounded by the engagement');
  assert.ok(/revocation.*safety/.test(parallel), 'continuous operation must honor immediate stops');
  assert.ok(/missed.*deadline.*recovery/.test(parallel), 'lapsed replenishment roles need an explicit recovery response');
});

test('negative: static tests and a roster cannot certify observed simultaneous execution', () => {
  const guide = normalized(read('agents', 'README.md'));
  const toolGuide = normalized(read('tools', 'README.md'));
  assert.ok(/Continuous parallel replenishment/.test(guide), 'the operating model must be documented');
  assert.ok(/parallel-replenishment-contract\.test\.mjs/.test(toolGuide), 'the new checks need a scope disclosure');
  assert.ok(/static.*not.*simultaneous execution/.test(toolGuide), 'contract tests must not claim live host assurance');
  assert.ok(/Four replenishment roles overlap with active delivery/.test(shared), 'the live acceptance scenario must test real overlap');
  assert.ok(/New candidate depends on unfinished peer work/.test(shared), 'the live readiness scenario must reject unresolved peer dependencies');
});
