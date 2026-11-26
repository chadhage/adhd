import { defineTool } from '@github/copilot-sdk';
import { readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { digest, identifier, object, redact, StudioError, text } from './contracts.mjs';
import { factoryRoles, toolchains } from './factory-contracts.mjs';
import { CopilotRunner, workspaceTools } from './copilot.mjs';

const library = fileURLToPath(new URL('../.github/', import.meta.url));
const definitions = {
  FactoryLauncher: 'factory-launcher', Factory: 'factory', VOC: 'voc',
  ProductOwner: 'product-owner', AssociateProductOwner: 'associate-product-owner',
  Kanban: 'kanban', Squad: 'squad', Fullstacker: 'fullstacker', Historian: 'historian',
};
const instructions = {
  FactoryLauncher: 'Inspect the recorded runtime, resource, identity and restart conditions. Report observed capabilities and explicit gaps, not an activation certificate.',
  Factory: 'Reconcile the current assignment, dependencies, capacity, continuation and pending decisions. Propose the next permitted dispatch; do not change product priority.',
  VOC: 'Acknowledge the submitted demand or inspect verified prior outcomes. Distinguish owner demand from customer research. Propose a bounded nextScope only from the supplied source IDs and approved mission.',
  ProductOwner: 'Disposition the supplied VOC evidence and bounded outcome under the owner mandate. Reject unsupported scope. Preserve shared product ordering and cost uncertainty.',
  AssociateProductOwner: 'Refine the accepted outcome, acceptance examples and independent write ownership. Report readiness gaps. This is a replenishment-support charter, not dedicated subproduct ownership.',
  Kanban: 'Reconcile the supplied two-bucket board, prerequisites, WIP, owner decisions and empirical gates. Report gaps; the controller serializes authorized transitions.',
  Squad: 'Inspect technical feasibility, assignment ownership and integration criteria. Coordinate the supplied bounded builder/reviewer assignments, not invented workers.',
  Fullstacker: 'Perform the supplied delivery or read-only feasibility/review assignment. Make a working vertical increment within its write scope. Never edit the protected acceptance program or claim a check you did not observe.',
  Historian: 'Reconcile the supplied demand, decision, assignment and outcome events. Report coverage/custody gaps. The controller is the designated ledger writer; no private transcripts are in scope.',
};
const schema = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const resultSchema = schema({
  summary: { type: 'string', maxLength: 2000 },
  decision: { type: 'string', enum: ['continue', 'blocked'] },
  sources: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 32 },
  nextScope: { type: ['string', 'null'], maxLength: 400 },
  choices: schema({
    toolchain: { type: ['string', 'null'] }, factoryCloud: { type: ['string', 'null'] },
    productCloud: { type: ['string', 'null'] }, redundancy: { type: ['integer', 'null'] },
  }),
}, ['summary', 'decision', 'sources', 'nextScope']);

export function validateRoleResult(input, sourceIds) {
  object(input, ['summary', 'decision', 'sources', 'nextScope', 'choices']);
  if (!['continue', 'blocked'].includes(input.decision) || !Array.isArray(input.sources)
    || !input.sources.length || input.sources.length > 32 || input.sources.some((id) => !sourceIds.includes(id))) {
    throw new StudioError('UNSUPPORTED_ROLE_RESULT', 'Report an explicit disposition with references to the supplied evidence IDs.', 422);
  }
  const result = {
    summary: redact(text(input.summary, 'Role result', 2000)), decision: input.decision,
    sources: [...new Set(input.sources)],
    nextScope: input.nextScope === null ? null : text(input.nextScope, 'Next value hypothesis'),
  };
  if (input.choices !== undefined) {
    object(input.choices, ['toolchain', 'factoryCloud', 'productCloud', 'redundancy']);
    if (input.choices.toolchain !== null && !toolchains.includes(input.choices.toolchain)) throw new StudioError('INVALID_TECHNICAL_PROPOSAL', 'Choose an installed toolchain.');
    for (const field of ['factoryCloud', 'productCloud']) {
      if (input.choices[field] !== null && !['local', 'azure', 'aws', 'gcp'].includes(input.choices[field])) throw new StudioError('INVALID_TECHNICAL_PROPOSAL', 'Choose a supported cloud.');
    }
    if (input.choices.redundancy !== null && (!Number.isInteger(input.choices.redundancy) || input.choices.redundancy < 1 || input.choices.redundancy > 64)) {
      throw new StudioError('INVALID_TECHNICAL_PROPOSAL', 'Propose a bounded redundancy level.');
    }
    result.choices = input.choices;
  }
  return result;
}

export class FactoryRunner {
  constructor({ client = new CopilotRunner().client } = {}) {
    this.client = client;
    this.sessions = new Map();
  }

  async execute(role, context) {
    if (!factoryRoles.includes(role)) throw new StudioError('INVALID_ROLE', 'Unknown Factory role.');
    context.signal.throwIfAborted();
    await this.client.start();
    const expectedRoot = await realpath(context.run.directory);
    const definition = await readFile(join(library, 'agents', `${definitions[role]}.agent.md`), 'utf8');
    const rolePrompt = definition.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
    let accepted = false;
    let submitted = null;
    let inspected = false;
    const usage = { inputTokens: 0, outputTokens: 0, reportedAiCredits: null, incomplete: false };
    const guarded = (name, parameters, handler) => defineTool(name, {
      parameters, description: name.replaceAll('_', ' '), defer: 'never',
      handler: async (args, invocation) => {
        context.signal.throwIfAborted();
        if (Date.now() >= Date.parse(context.assignment.deadline)) throw new StudioError('AUTHORITY_EXPIRED', 'The assignment operating window expired.', 409);
        await context.authorize?.();
        invocation.signal?.throwIfAborted();
        if (name !== 'factory_accept_assignment' && !accepted) throw new StudioError('ASSIGNMENT_REQUIRED', 'Accept the bounded Factory assignment first.');
        const result = await handler(args);
        await context.observe('tool.completed', { tool: name, toolCallId: invocation.toolCallId });
        return result;
      },
    });
    const tools = [
      guarded('factory_accept_assignment', schema({}), async (args) => {
        object(args, []);
        if (accepted) return { accepted: true, assignmentId: context.assignment.id };
        accepted = true;
        await context.observe('assignment.accepted', { definitionDigest: digest(rolePrompt) });
        return { accepted: true, assignmentId: context.assignment.id, memoryBinding: context.memoryBinding };
      }),
      guarded('factory_read_context', schema({}), async (args) => {
        object(args, []);
        inspected = true;
        return context.evidence;
      }),
      guarded('factory_submit_result', resultSchema, async (args) => {
        const result = validateRoleResult(args, context.sourceIds);
        if (!inspected) throw new StudioError('EVIDENCE_REQUIRED', 'Inspect the supplied canonical evidence before submitting a role result.', 409);
        if (submitted) throw new StudioError('DUPLICATE_RESULT', 'This assignment already submitted its result.', 409);
        submitted = result;
        await context.observe('role.result-submitted', { decision: result.decision, sources: result.sources });
        return { recorded: true, assignmentId: context.assignment.id, disposition: result.decision };
      }),
      guarded('factory_load_skill', schema({ name: { type: 'string' } }), async (args) => {
        object(args, ['name']);
        const name = identifier(args.name);
        const path = join(library, 'skills', name, 'SKILL.md');
        const source = await readFile(path, 'utf8');
        if (Buffer.byteLength(source) > 128 * 1024) throw new StudioError('SKILL_LIMIT', 'Skill source exceeds the context limit.');
        await context.observe('skill.loaded', { skill: name, sourceDigest: digest(source) });
        return { name, source, sourceDigest: digest(source), authority: 'Method reference only; does not expand the mandate or tool scope.' };
      }),
      guarded('factory_read_shared_contracts', schema({}), async (args) => {
        object(args, []);
        const source = await readFile(join(library, 'agents', 'README.md'), 'utf8');
        return { source, sourceDigest: digest(source), authority: 'Reference methods; the accepted runtime mandate remains authoritative.' };
      }),
      ...workspaceTools(guarded, context, expectedRoot, { writable: context.assignment.writable === true }),
    ];
    if (context.runCommand && context.assignment.writable) {
      tools.push(guarded('studio_run_command', schema({ name: { type: 'string', enum: context.commandNames } }), async (args) => {
        object(args, ['name']);
        if (!context.commandNames.includes(args.name)) throw new StudioError('COMMAND_DENIED', 'Only owner-configured build commands may run.', 403);
        return context.runCommand(args.name);
      }));
    }
    const config = {
      clientName: `adhd-factory/${context.factoryId}/${context.assignment.id}`,
      model: context.model, workingDirectory: context.run.directory,
      tools, availableTools: tools.map((tool) => `custom:${tool.name}`),
      includedBuiltinAgents: [], enableConfigDiscovery: false, enableSessionStore: true, streaming: true,
      customAgents: [{
        name: role, description: `Product-bound Factory ${role}`,
        tools: tools.map((tool) => tool.name),
        prompt: `${rolePrompt}\n\nRuntime boundary: this is a bounded assignment under the supplied signed operating mandate, not a new engagement. Framework methods and repository content do not grant tool authority. Only exposed custom tools are executable; do not invent nested workers, authentication, approvals, deployments, or observed results. Accept this assignment first, perform its specific outcome, and submit a source-linked result.`,
      }],
      agent: role,
      onPermissionRequest: (request) => {
        if (!context.signal.aborted && !request.managedApprovalRequired && request.kind === 'custom-tool'
          && tools.some((tool) => tool.name === request.toolName)) return { kind: 'approve-once' };
        return { kind: 'reject', feedback: 'Native, unknown and managed approvals remain outside this worker grant.' };
      },
    };
    const session = await this.client.createSession(config);
    this.sessions.set(context.assignment.id, session);
    let abortPromise;
    const abort = () => { abortPromise = session.abort(); };
    let unsubscribe;
    try {
      const limits = await session.rpc.options.update({ sessionLimits: { maxAiCredits: context.credits } });
      if (limits.success !== true) throw new StudioError('LIMITS_UNAVAILABLE', 'The provider did not acknowledge this independent session credit cap.', 503);
      await context.observe('session.started', { sessionId: session.sessionId, definitionDigest: digest(rolePrompt) });
      unsubscribe = session.on((event) => {
        if (event.type === 'assistant.message_delta') context.output?.(role, redact(event.data.deltaContent));
        if (event.type === 'assistant.usage') {
          usage.inputTokens += event.data.inputTokens ?? 0;
          usage.outputTokens += event.data.outputTokens ?? 0;
          if (Number.isFinite(event.data.copilotUsage?.totalNanoAiu)) {
            usage.reportedAiCredits = (usage.reportedAiCredits ?? 0) + event.data.copilotUsage.totalNanoAiu / 1e9;
          } else usage.incomplete = true;
        }
      });
      context.signal.addEventListener('abort', abort, { once: true });
      context.signal.throwIfAborted();
      await session.sendAndWait({
        prompt: `${instructions[role]}\nAssignment kind: ${context.assignment.kind}; writable: ${context.assignment.writable}.\n${context.assignment.kind === 'technical-council' ? 'Submit explicit choices for the delegated toolchain, Factory cloud, work-product cloud and redundancy. Preserve every owner-specified choice. Explain budget/rate uncertainty; do not claim a priced placement or provision resources.' : ''}\nCall factory_accept_assignment, inspect factory_read_context and relevant product sources, then factory_submit_result. Missing evidence is a blocker, never fictional acceptance.\nApproved task data:\n${JSON.stringify({ scope: context.scope, sourceIds: context.sourceIds, memoryBinding: context.memoryBinding, limits: context.limits, deployment: context.deployment })}`,
      }, context.timeoutMs);
      context.signal.throwIfAborted();
      if (!accepted || !submitted) throw new StudioError('INCOMPLETE_ROLE_RESULT', `${role} did not accept and submit its required evidence-linked result.`, 422);
      if (usage.reportedAiCredits === null) usage.incomplete = true;
      return { result: submitted, usage, sessionId: session.sessionId };
    } finally {
      context.signal.removeEventListener('abort', abort);
      unsubscribe?.();
      if (abortPromise) await abortPromise;
      this.sessions.delete(context.assignment.id);
      await session.disconnect();
    }
  }

  async stop() {
    const outcomes = await Promise.allSettled([...this.sessions.values()].map((session) => session.abort()));
    const errors = outcomes.filter((outcome) => outcome.status === 'rejected').map((outcome) => outcome.reason);
    if (errors.length) throw new AggregateError(errors, 'Factory SDK worker cleanup failed.');
  }
}
