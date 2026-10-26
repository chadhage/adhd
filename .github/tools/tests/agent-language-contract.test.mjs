import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { repoRoot } from './helpers.mjs';

const read = (...parts) => readFileSync(join(repoRoot, '.github', ...parts), 'utf8').replaceAll('\r\n', '\n');
const normalize = (source) => source.replace(/\s+/g, ' ');
const roles = {
  'factory-launcher': {
    name: 'FactoryLauncher', tools: ['read', 'search', 'edit', 'todo', 'agent', 'web', 'vscode/askQuestions'],
    agents: ['VOC', 'ProductOwner', 'AssociateProductOwner', 'Kanban', 'Squad', 'Fullstacker', 'Factory', 'Historian'],
    triggers: ['start', 'resume', 'Factory'],
  },
  factory: {
    name: 'Factory', tools: ['read', 'search', 'edit', 'todo', 'agent', 'vscode/askQuestions'],
    agents: ['VOC', 'ProductOwner', 'AssociateProductOwner', 'Kanban', 'Squad', 'Fullstacker', 'FactoryLauncher', 'Historian'],
    triggers: ['replenishment', 'Squad'],
  },
  voc: {
    name: 'VOC', tools: ['read', 'search', 'edit', 'web', 'execute', 'vscode/askQuestions'],
    agents: undefined, triggers: ['voice of the customer', 'evidence'],
  },
  'product-owner': {
    name: 'ProductOwner', tools: ['read', 'search', 'edit', 'web', 'execute', 'agent', 'vscode/askQuestions'],
    agents: ['VOC', 'AssociateProductOwner'], triggers: ['backlog', 'ROI'],
  },
  'associate-product-owner': {
    name: 'AssociateProductOwner', tools: ['read', 'search', 'edit', 'execute', 'vscode/askQuestions'],
    agents: [], triggers: ['80%', 'charter'],
  },
  kanban: {
    name: 'Kanban', tools: ['read', 'search', 'edit', 'vscode/askQuestions'],
    agents: [], triggers: ['True Ready', 'reserve'],
  },
  squad: {
    name: 'Squad', tools: ['read', 'search', 'edit', 'todo', 'agent', 'vscode/askQuestions'],
    agents: ['Fullstacker', 'Kanban', 'ProductOwner'], triggers: ['<name> <n>', 'swarm'],
  },
  fullstacker: {
    name: 'Fullstacker', tools: ['read', 'search', 'edit', 'execute', 'web', 'agent', 'vscode/askQuestions'],
    agents: ['Kanban', 'ProductOwner', 'Cloud Design Patterns Advisor'], triggers: ['Kanban', 'one-piece'],
  },
  historian: {
    name: 'Historian', tools: ['read', 'search', 'edit', 'vscode/askQuestions'],
    agents: [], triggers: ['history', 'capture gaps'],
  },
};
const enterpriseTools = [
  'workiq/ask', 'workiq/fetch', 'workiq/search_paths', 'workiq/get_schema',
  'fabriciq/DiscoverArtifacts', 'fabriciq/ResolveFabricItem', 'fabriciq/GetReportMetadata',
  'fabriciq/GetSemanticModelSchema', 'fabriciq/ValueSearch', 'fabriciq/ExecuteQuery',
];
const agent = (role) => read('agents', `${role}.agent.md`);
const guide = read('agents', 'README.md');
const storage = read('skills', 'artifact-storage-and-engagement-contracts', 'SKILL.md');
const history = read('skills', 'artifact-storage-and-engagement-contracts', 'references', 'factory-history.md');
const launch = read('skills', 'factory-mvp-and-recovery', 'references', 'launch-and-health.md');
const catalog = read('skills', 'fullstack-one-piece-flow', 'references', 'skill-catalog.md');

function listField(source, name) {
  const value = source.match(new RegExp(`^${name}: \\[([^\\]]*)\\]$`, 'm'));
  return value ? value[1].split(',').map((item) => item.trim().replace(/^"(.*)"$/, '$1')).filter(Boolean) : undefined;
}

function anchors(source) {
  return new Set([...source.matchAll(/^#{1,6} (.+)$/gm)].map(([, heading]) =>
    heading.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[`*_]/g, '').toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-')));
}

test('positive: every streamlined definition retains discoverable identity and routing metadata', () => {
  for (const [role, expected] of Object.entries(roles)) {
    const source = agent(role);
    const metadata = source.match(/^---\n([\s\S]+?)\n---\n/);
    assert.ok(metadata, role);
    assert.match(metadata[1], new RegExp(`^name: ${expected.name}$`, 'm'));
    for (const field of ['description', 'argument-hint']) {
      const scalar = metadata[1].match(new RegExp(`^${field}: (".*")$`, 'm'));
      assert.ok(scalar, `${role}: ${field}`);
      const value = JSON.parse(scalar[1]);
      assert.ok(value.length > 0 && value.length <= 1024, `${role}: ${field}`);
      if (field === 'description') {
        for (const trigger of expected.triggers) assert.ok(value.includes(trigger), `${role}: ${trigger}`);
      }
    }
    assert.match(metadata[1], new RegExp(`^user-invocable: ${role !== 'associate-product-owner'}$`, 'm'));
  }
});

test('positive: common contracts and detailed procedures have explicit bounded loading points', () => {
  for (const role of Object.keys(roles)) {
    assert.match(agent(role), /Read \[shared agent contracts\]\(README\.md#shared-agent-contracts\) before work/);
  }
  for (const policy of ['artifact-storage-and-engagement-contracts', 'git-pr-request-review', 'factory-mvp-and-recovery', 'factory-observability', 'product-financial-modeling']) {
    assert.ok(guide.includes(`../skills/${policy}/SKILL.md`), policy);
  }
  assert.match(agent('factory-launcher'), /factory-mvp-and-recovery\/references\/launch-and-health\.md/);
  assert.match(agent('historian'), /artifact-storage-and-engagement-contracts\/references\/factory-history\.md/);
  assert.match(agent('fullstacker'), /fullstack-one-piece-flow\/references\/skill-catalog\.md/);
  assert.match(guide, /not\s+automatic inheritance/);
});

test('negative: wording cleanup cannot add tools, delegation, models, hooks or hidden metadata', () => {
  for (const [role, expected] of Object.entries(roles)) {
    const source = agent(role);
    const metadata = source.match(/^---\n([\s\S]+?)\n---\n/)[1];
    const tools = listField(metadata, 'tools');
    assert.deepEqual(tools.toSorted(), [...expected.tools, ...enterpriseTools].toSorted(), role);
    assert.equal(new Set(tools).size, tools.length, role);
    assert.deepEqual(listField(metadata, 'agents'), expected.agents, role);
    const fields = [...metadata.matchAll(/^([\w-]+):/gm)].map(([, field]) => field);
    assert.deepEqual(fields, ['name', 'description', 'argument-hint', 'tools', ...(expected.agents ? ['agents'] : []), 'user-invocable'], role);
  }
});

test('negative: relocated guidance cannot leave dangling relative file or heading links', () => {
  const files = [
    ...Object.keys(roles).map((role) => join(repoRoot, '.github', 'agents', `${role}.agent.md`)),
    join(repoRoot, '.github', 'agents', 'README.md'),
    join(repoRoot, '.github', 'tools', 'README.md'),
    join(repoRoot, '.github', 'skills', 'factory-mvp-and-recovery', 'SKILL.md'),
    join(repoRoot, '.github', 'skills', 'factory-mvp-and-recovery', 'references', 'launch-and-health.md'),
    join(repoRoot, '.github', 'skills', 'artifact-storage-and-engagement-contracts', 'SKILL.md'),
    join(repoRoot, '.github', 'skills', 'artifact-storage-and-engagement-contracts', 'references', 'factory-history.md'),
    join(repoRoot, '.github', 'skills', 'fullstack-one-piece-flow', 'references', 'skill-catalog.md'),
  ];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const [, href] of source.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      if (/^[a-z][\w+.-]*:/i.test(href)) continue;
      const [path, fragment] = href.split('#');
      const target = path ? resolve(dirname(file), decodeURIComponent(path)) : file;
      assert.ok(existsSync(target), `${file}: ${href}`);
      if (fragment) {
        assert.ok(anchors(readFileSync(target, 'utf8')).has(decodeURIComponent(fragment)), `${file}: #${fragment}`);
      }
    }
  }
});

test('negative: agents cannot reintroduce copied schemas, rhetorical synonym chains or capability resumes', () => {
  for (const role of Object.keys(roles)) {
    const source = agent(role);
    assert.doesNotMatch(source, /Every record must explicitly identify the human invoker/);
    const headings = [...source.matchAll(/^## (.+)$/gm)].map(([, heading]) => heading);
    assert.equal(new Set(headings).size, headings.length, role);
  }
  assert.doesNotMatch(agent('voc'), /hunt for it|harvest it|Obsess over/);
  assert.doesNotMatch(agent('fullstacker'), /Competence includes|OLAP, ROLAP, MOLAP/);
});

test('negative: common contracts cannot authorize permission expansion or replace mandatory records with summaries', () => {
  const shared = normalize(guide.split('## Shared agent contracts\n')[1].split('\n## ')[0]);
  assert.match(shared, /Missing authority blocks only dependent work/);
  assert.match(shared, /no duplicate gates or permission-setting changes/);
  assert.match(shared, /Authentication remains human-only/);
  assert.match(shared, /Commit, push, review request, merge and release retain separate authority/);
  assert.match(shared, /Required ledger fields, history broadcasts and acceptance evidence are not optional summaries/);
});

test('negative: local delivery guards cannot admit unready work or turn an empty queue into shutdown approval', () => {
  assert.match(normalize(agent('fullstacker')), /before implementation/);
  assert.match(normalize(agent('fullstacker')), /unready work permits separately authorized refinement, not delivery/);
  assert.match(normalize(agent('kanban')), /excluding active WIP, blocked\/unready candidates and overlaps/);
  assert.match(normalize(agent('factory')), /Empty\/unready queues trigger replenishment/);
  assert.match(normalize(agent('factory')), /Before voluntary shutdown\/furlough, obtain the human invoker's explicit recorded approval/);
  assert.match(normalize(agent('factory-launcher')), /Validation is not shutdown approval/);
  assert.match(normalize(agent('squad')), /Member count is capacity, not permission to pull `<n>` cards/);
});

test('negative: shortening history cannot drop daily isolation, independent retention, schema or disclosure', () => {
  const source = normalize(history);
  for (const field of ['history_id', 'recording_day', 'day_sequence', 'occurred_at', 'recorded_at', 'source', 'verification_status', 'broadcast']) {
    assert.ok(history.includes(`\`${field}\``), field);
  }
  assert.match(source, /one authoritative event file per recording day per register/);
  assert.match(source, /outside the product workspace and its deletion boundary/);
  assert.match(source, /Identical text alone does not establish event identity/);
  assert.match(source, /Never broadcast unsaved\/unverified/);
  assert.match(source, /queued work is not persistence/);
  assert.match(normalize(storage), /does not waive destination, source, privacy or host permission requirements/);
});

test('negative: shorter launch instructions cannot silently authorize future cycles or omit calibration', () => {
  const source = normalize(launch);
  assert.match(source, /Future iterations retain their own authorization/);
  assert.match(source, /Do not require delivery readiness or iterations 1-10 before this handoff/);
  assert.match(source, /Complete VOC, Kanban and empirical-product calibration before iteration 37/);
  assert.match(source, /Missing calibration blocks authorization past the gate, not unaffected authorized work/);
  assert.match(normalize(agent('factory-launcher')), /not a second activation approval for unchanged scope/);
});

test('negative: a concise skill index cannot hide specialized engineering or assessment methods', () => {
  for (const skill of [
    'statistics-101', 'squad-buffer-pattern', 'factory-real-host-assurance',
    'fullstack-economic-sequencing', 'fullstack-atomic-decomposition',
    'fullstack-critical-path-analysis-mapping', 'fullstack-root-cause-analysis',
    'fullstack-five-whys', 'fullstack-six-ms', 'fullstack-ishikawa', 'fullstack-fmea', 'fullstack-spfa',
    'fullstack-specification-driven-testing', 'fullstack-cohort-collaboration', 'fullstack-secure-architecture',
    'fullstack-delivery-automation', 'fullstack-empirical-done', 'fullstack-factory-penetration-testing',
    'fullstack-aircrack-ng', 'fullstack-metasploit', 'fullstack-nessus', 'fullstack-nmap',
    'fullstack-openvas', 'fullstack-nikto', 'fullstack-sqlmap', 'fullstack-wireshark', 'fullstack-grype',
    'fullstack-kali-linux', 'fullstack-pentoo', 'fullstack-parrotos', 'fullstack-k6-performance-testing',
    'fullstack-azure-warp-reporting', 'fullstack-azure-warp-extended-reporting',
    'fullstack-azure-warp-ado-import', 'fullstack-azure-warp-github-import',
    'fullstack-azure-waf-category-sync', 'fullstack-azure-waf-go-live-report', 'fullstack-azure-warr-report',
    'fullstack-aws-well-architected-lab-skills', 'fullstack-github-well-architected-skills',
    'fullstack-google-cloud-well-architected-skills', 'fullstack-ux-wireframing-prototyping',
    'fullstack-ux-interaction-design', 'fullstack-ux-visual-design',
    'fullstack-ux-information-architecture', 'fullstack-ux-frontend-coding', 'fullstack-ux-ui-design',
    'fullstack-ux-motion-design', 'fullstack-ux-emotional-design', 'fullstack-ux-accessibility',
  ]) {
    assert.ok(catalog.includes(`/${skill}/SKILL.md`), skill);
  }
  assert.match(catalog, /not proof of installed tools, target permission or successful execution/);
});

test('negative: report condensation cannot hide unfinished cards or replace completion evidence', () => {
  const source = normalize(agent('kanban'));
  assert.match(source, /For status\/reconciliation, enumerate every `To Do` and `In Progress` card/);
  assert.match(source, /reconcile the total lot/);
  assert.match(source, /For a targeted mutation, return affected IDs, before\/after state, evidence and resulting totals/);
  assert.match(source, /Never substitute a summary for mandatory record fields or completion evidence/);
});
