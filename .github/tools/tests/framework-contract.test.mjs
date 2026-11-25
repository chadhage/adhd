import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { operatingProfiles } from '../../hooks/factory-ops.mjs';
import { repoRoot } from './helpers.mjs';

const read = (...parts) => readFileSync(join(repoRoot, ...parts), 'utf8').replaceAll('\r\n', '\n');
const normalize = (source) => source.replace(/\s+/g, ' ');
const roles = ['factory-launcher', 'factory', 'voc', 'product-owner', 'associate-product-owner', 'kanban', 'squad', 'fullstacker', 'historian'];
const profileLink = 'factory-mvp-and-recovery/SKILL.md#operating-profiles';
const policy = normalize(read('.github', 'skills', 'factory-mvp-and-recovery', 'SKILL.md'));

test('positive: all nine roles explicitly load the same operating-profile contract', () => {
  for (const role of roles) {
    assert.ok(read('.github', 'agents', `${role}.agent.md`).includes(profileLink), role);
  }
  for (const parts of [
    ['README.md'], ['.github', 'copilot-instructions.md'], ['.github', 'SECURITY.md'],
  ]) assert.ok(read(...parts).includes(profileLink), parts.join('/'));
});

test('positive: all nine roles load one repeat-run continuation procedure with explicit custody', () => {
  const link = 'factory-mvp-and-recovery/SKILL.md#repeat-run-continuation';
  for (const role of roles) assert.ok(read('.github', 'agents', `${role}.agent.md`).includes(link), role);
  const continuation = normalize(read('.github', 'skills', 'factory-mvp-and-recovery', 'SKILL.md')
    .split('## Repeat-Run Continuation\n')[1]?.split('\n## ')[0] ?? '');
  for (const name of ['FactoryLauncher', 'Factory', 'Squad', 'Kanban', 'VOC', 'ProductOwner', 'AssociateProductOwner', 'Fullstacker', 'Historian']) {
    assert.ok(continuation.includes(`| ${name} |`), name);
  }
  for (const field of ['invocation/assignment ID', 'operating run ID', 'iteration/value-cycle ID', 'remaining horizon', 'actual executor', 'success signal']) {
    assert.ok(continuation.includes(field), field);
  }
  assert.match(continuation, /before the agreed checkpoint/);
  assert.match(continuation, /actual next executor\/trigger/);
});

test('negative: repeat-run guidance cannot manufacture iteration authority, rate freshness or a persistent worker', () => {
  const continuation = normalize(read('.github', 'skills', 'factory-mvp-and-recovery', 'SKILL.md')
    .split('## Repeat-Run Continuation\n')[1]?.split('\n## ')[0] ?? '');
  assert.match(continuation, /A child return or checkpoint is not by itself a new run/);
  assert.match(continuation, /provisional plan, backlog or no-stop directive supplies none/);
  assert.match(continuation, /human rate confirmation.*even within 24 hours/);
  assert.match(continuation, /old acceptance is not acceptance by a new instance/);
  assert.match(continuation, /A planned bounded return is not that defect/);
  assert.match(continuation, /not live-host repeatability evidence/);
  const launch = normalize(read('.github', 'skills', 'factory-mvp-and-recovery', 'references', 'launch-and-health.md'));
  assert.match(launch, /Reuse an explicit, still-valid authorization covering that iteration/);
});

test('negative: a scoped stoppage cannot become shutdown authority or permission to erase stop controls', () => {
  const continuation = normalize(read('.github', 'skills', 'factory-mvp-and-recovery', 'SKILL.md')
    .split('## Repeat-Run Continuation\n')[1]?.split('\n## ')[0] ?? '');
  assert.match(continuation, /only `factory-shutdown-approval` suppresses whole-Factory/);
  assert.match(continuation, /`stoppage-approval` remains binding on its affected actions, not a whole-Factory shutdown/);
  assert.match(continuation, /inhibit file still prevents all supervised restarts/);
  assert.match(continuation, /never clear it without the required authority/);
});

test('positive: editor schema, shipped defaults and runtime recognize the same named profiles', () => {
  const settings = JSON.parse(read('.vscode', 'settings.json'));
  const association = settings['json.schemas']?.find((item) => item.fileMatch.includes('/.github/hooks/factory-ops.json'));
  assert.ok(association, 'Factory configuration must have a local editor schema');
  const schemaPath = resolve(repoRoot, association.url);
  assert.ok(existsSync(schemaPath));
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  assert.deepEqual(schema.properties.operatingProfile.enum, operatingProfiles);
  assert.equal(schema.properties.operatingProfile.default, 'bounded');
  assert.equal(JSON.parse(read('.github', 'hooks', 'factory-ops.json')).operatingProfile, 'bounded');
});

test('negative: bounded defaults cannot silently downgrade existing parallel contracts or certify runtime capability', () => {
  assert.match(policy, /bounded.*default/i);
  assert.match(policy, /existing accepted.*not.*silently/);
  assert.match(policy, /human-approved profile amendment/);
  assert.match(policy, /Unknown, stale, failed or unavailable evidence does not pass/);
  assert.match(policy, /configuration is not live-host proof/);
  assert.match(policy, /bounded turn.*not.*shutdown approval/i);
  assert.match(policy, /Missing profile.*legacy.*preserv/i);
});

test('negative: profiles cannot remove canonical intake, ownership, readiness, economics or release obligations', () => {
  const storage = normalize(read('.github', 'skills', 'artifact-storage-and-engagement-contracts', 'SKILL.md'));
  const kanban = normalize(read('.github', 'agents', 'kanban.agent.md'));
  const delivery = normalize(read('.github', 'agents', 'fullstacker.agent.md'));
  const associate = normalize(read('.github', 'agents', 'associate-product-owner.agent.md'));
  const rates = normalize(read('.github', 'skills', 'product-financial-modeling', 'SKILL.md'));
  assert.match(storage, /VOC-First Demand Intake/);
  assert.match(storage, /memory_binding/);
  assert.match(storage, /Designate one writer for each shared record/);
  assert.match(storage, /Require Historian events/);
  assert.match(kanban, /exactly `To Do` and `In Progress`/);
  assert.match(kanban, /Record verified completion.*before removing its card/);
  assert.match(delivery, /A missing required criterion leaves the card unfinished/);
  assert.match(delivery, /production deployment and release require their own approval/);
  assert.match(associate, /P\(acceleration\) > 0\.80/);
  assert.match(rates, /Exactly 24 hours is stale/);
  assert.match(policy, /All profiles retain.*VOC.*Kanban.*quality.*permission.*release/);
});

test('negative: operating feasibility cannot be inferred from role counts, generic pricing or unlimited host capacity', () => {
  for (const requirement of [
    'model/tool versions', 'licensing/access', 'context and concurrency limits',
    'quotas', 'latency', 'token/tool charges', 'human intervention',
  ]) assert.ok(policy.includes(requirement), requirement);
  assert.match(policy, /compare.*simpler baseline/);
  assert.match(policy, /approved.*budget.*deadline/);
  assert.match(policy, /not.*billed actual/);
});

test('negative: workspace settings cannot manufacture approval, disable sandboxing or autostart MCP services', () => {
  const settings = JSON.parse(read('.vscode', 'settings.json'));
  assert.equal(settings['chat.useHooks'], true);
  assert.equal(settings['chat.subagents.allowInvocationsFromSubagents'], true);
  assert.deepEqual(Object.keys(settings).sort(), [
    'chat.subagents.allowInvocationsFromSubagents', 'chat.useHooks', 'json.schemas',
  ].sort());
  const instructions = normalize(read('.github', 'copilot-instructions.md'));
  assert.match(instructions, /Do not change workspace\/global permission defaults/);
  assert.match(instructions, /configuration is not live-host proof/);
  assert.match(instructions, /not.*install.*scheduler/);
});

test('negative: MCP configuration cannot expand the approved query-only connection and tool surfaces', () => {
  const configuration = JSON.parse(read('.mcp.json'));
  assert.deepEqual(Object.keys(configuration), ['mcpServers']);
  assert.deepEqual(Object.keys(configuration.mcpServers).sort(), ['fabriciq', 'workiq']);
  const expected = {
    workiq: {
      url: 'https://workiq.svc.cloud.microsoft/mcp',
      tools: ['ask', 'fetch', 'search_paths', 'get_schema'],
    },
    fabriciq: {
      url: 'https://fabriciq.svc.cloud.microsoft/v1/mcp/fabriciq',
      tools: ['DiscoverArtifacts', 'ResolveFabricItem', 'GetReportMetadata', 'GetSemanticModelSchema', 'ValueSearch', 'ExecuteQuery'],
    },
  };
  for (const [name, contract] of Object.entries(expected)) {
    const server = configuration.mcpServers[name];
    assert.deepEqual(Object.keys(server).sort(), (name === 'workiq'
      ? ['type', 'url', 'oauthClientId', 'oauthPublicClient', 'auth', 'tools']
      : ['type', 'url', 'headers', 'tools']).sort());
    assert.equal(server.type, 'http');
    assert.equal(server.url, contract.url);
    assert.deepEqual(server.tools, contract.tools);
    assert.equal(server.command, undefined);
    assert.equal(server.env, undefined);
    assert.equal(server.headers?.Authorization, undefined);
    if (name === 'workiq') {
      assert.equal(server.oauthPublicClient, true);
      assert.deepEqual(server.auth, { redirectPort: 12798 });
    } else {
      assert.deepEqual(server.headers, { 'X-Variants': 'Fabric.Routing.FabricIQ.V1' });
    }
  }
  for (const role of roles) {
    const source = read('.github', 'agents', `${role}.agent.md`);
    for (const [name, contract] of Object.entries(expected)) {
      for (const tool of contract.tools) assert.ok(source.includes(`${name}/${tool}`), `${role}: ${name}/${tool}`);
    }
  }
});

test('negative: operating profiles cannot introduce transcript listeners or tool-approval hook decisions', () => {
  const hooks = JSON.parse(read('.github', 'hooks', 'tool-policy.json')).hooks;
  assert.deepEqual(Object.keys(hooks).sort(), ['agentStop', 'postToolUse', 'preToolUse', 'subagentStart'].sort());
  assert.equal(hooks.preToolUse.length, 1);
  assert.match(hooks.preToolUse[0].command, /pre-tool-policy\.mjs preToolUse$/);
  const security = normalize(read('.github', 'SECURITY.md'));
  assert.match(security, /profile.*not.*host permission/i);
  assert.match(security, /bounded turn.*not.*Factory shutdown approval/i);
  assert.match(security, /does not log prompts or tool payloads/);
});

test('positive: CI preserves the existing quality authority across Windows and Linux', () => {
  const workflow = read('.github', 'workflows', 'factory-quality.yml');
  assert.match(workflow, /os: \[windows-latest, ubuntu-latest\]/);
  assert.match(workflow, /runs-on: \$\{\{ matrix\.os \}\}/);
  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.equal([...workflow.matchAll(/uses: actions\/(?:checkout|setup-node)@[0-9a-f]{40}/g)].length, 2);
  assert.match(workflow, /run-tests\.mjs/);
  assert.doesNotMatch(workflow, /pull_request_target|contents:\s*write|permissions:\s*write-all|secrets:\s*inherit/);
});

test('negative: quality requirements cannot be reduced to make an operating profile pass', () => {
  const runner = read('.github', 'tools', 'run-tests.mjs');
  assert.match(runner, /threshold: 85, minNegativePerPositive: 2/);
  assert.match(runner, /evaluateQuality\(parseTap\(output\), policy\)/);
  const assurance = normalize(read('.github', 'skills', 'factory-real-host-assurance', 'SKILL.md'));
  assert.match(assurance, /operating profile/);
  assert.match(assurance, /cost.*latency.*human intervention/);
  assert.match(assurance, /not.*universal reliability/);
});
