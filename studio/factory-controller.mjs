import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { isAbsolute, join } from 'node:path';
import { lstat, mkdir, readFile } from 'node:fs/promises';
import { containsCredential, digest, identifier, object, recordPath, redact, StudioError, text } from './contracts.mjs';
import { factoryRoles, mayWrite, validateMandate } from './factory-contracts.mjs';
import { FactoryRunner, validateRoleResult } from './factory-runner.mjs';
import { command, Records } from './repository.mjs';
import { FactoryObservability } from './observability.mjs';
import { compileFactoryPackage, materializeFactoryPackage } from './package.mjs';

const now = () => new Date().toISOString();
const verificationEnv = () => Object.fromEntries(
  ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'TEMP', 'TMP', 'PATHEXT']
    .filter((key) => process.env[key]).map((key) => [key, process.env[key]]),
);
const signatureEqual = (left, right) => typeof left === 'string' && /^[a-f0-9]{64}$/.test(left)
  && timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
const statePayload = (factory) => {
  const { stateSignature, ...data } = factory;
  return data;
};

export class FactoryController extends EventEmitter {
  constructor(studio, { secret, runner = new FactoryRunner({ client: studio.runner.client }), execution = 'local', commands = {}, operations = {}, executor, observer = new FactoryObservability(studio) } = {}) {
    super();
    if (typeof secret !== 'string' || secret.length < 32) throw new StudioError('AUTH_CONFIGURATION', 'Factory authority requires the configured owner secret.');
    if (!['local', 'workers'].includes(execution)) throw new StudioError('INVALID_FACTORY_CONFIGURATION', 'Choose local execution or registered workers.');
    this.studio = studio;
    this.secret = secret;
    this.runner = runner;
    this.execution = execution;
    this.commands = commands;
    this.operations = operations;
    this.executor = executor;
    this.observer = observer;
    this.hostPolicyDigest = digest({
      execution, commands, executor: executor?.policyDigest ?? null,
      operations: Object.fromEntries(Object.entries(operations).map(([action, adapter]) => [action, adapter.policyDigest ?? null])),
    });
    this.waiters = new Map();
    this.active = new Map();
    this.loop = null;
    this.starting = null;
    this.controller = null;
  }

  seal(value) {
    return createHmac('sha256', this.secret).update(JSON.stringify(value)).digest('hex');
  }

  authorityPayload(factory) {
    return { id: factory.id, productId: factory.productId, productRootCommits: factory.productRootCommits, blueprintDigest: factory.blueprintDigest, hostPolicyDigest: factory.hostPolicyDigest, mandate: factory.mandate };
  }

  verifyState(factory, data, { checkHostPolicy = true } = {}) {
    if (!factory || !signatureEqual(factory.authoritySignature, this.seal(this.authorityPayload(factory)))
      || !signatureEqual(factory.stateSignature, this.seal(statePayload(factory)))) {
      throw new StudioError('UNVERIFIED_FACTORY_AUTHORITY', 'Factory authority or checkpoint integrity could not be verified against the owner key. Reconcile; imported approval claims cannot restart production.', 409);
    }
    if (factory.productId !== data.productId || factory.blueprintDigest !== digest(data.blueprint)) {
      throw new StudioError('STALE_BLUEPRINT', 'The Factory mandate is not bound to this product and blueprint revision.', 409);
    }
    if (checkHostPolicy && factory.hostPolicyDigest !== this.hostPolicyDigest) throw new StudioError('HOST_POLICY_CHANGED', 'The executor or reviewed operation targets changed. The owner must reconcile and explicitly amend the operating mandate.', 409);
  }

  async read() {
    const snapshot = await this.studio.records.read();
    if (snapshot.data.factory) this.verifyState(snapshot.data.factory, snapshot.data);
    return snapshot;
  }

  async mutate(action, { publish = true, allowHostPolicyChange = false } = {}) {
    let events;
    const result = await this.studio.records.update(async (data) => {
      this.verifyState(data.factory, data, { checkHostPolicy: !allowHostPolicyChange });
      const before = data.history.length;
      await action(data.factory, data);
      data.factory.stateSignature = this.seal(statePayload(data.factory));
      events = data.history.slice(before);
    });
    await this.observer?.record(events);
    this.emit('changed', result.data.factory);
    if (publish) await this.studio.publish();
    return result.data.factory;
  }

  async initialize() {
    const { data } = await this.studio.records.read();
    if (data.factory) this.verifyState(data.factory, data, { checkHostPolicy: false });
    if (data.factory && data.factory.hostPolicyDigest !== this.hostPolicyDigest) {
      await this.mutate((factory, records) => {
        factory.status = 'restricted';
        factory.reason = 'The host executor or operation-target policy changed. No work was replayed; an authenticated owner amendment is required.';
        Records.event(records, 'factory.host-policy-changed', { factoryId: factory.id, expected: factory.hostPolicyDigest, observed: this.hostPolicyDigest });
      }, { allowHostPolicyChange: true });
      await this.studio.repository.commitRecords('Preserve Factory host-policy amendment gap');
      return this;
    }
    if (data.factory) await this.observer?.ensure(data.factory, data.blueprint);
    if (data.factory?.status === 'running') {
      await this.mutate((factory, records) => {
        factory.status = 'interrupted';
        factory.reason = 'Controller restarted. Saved gates and reservations are preserved; no consequential operation was replayed.';
        for (const task of factory.tasks.filter((entry) => ['queued', 'running'].includes(entry.status))) {
          task.status = 'interrupted';
          task.endedAt = now();
          factory.accounting.chargedCredits += task.reservedCredits;
          factory.accounting.reservedCredits -= task.reservedCredits;
          task.usage = { reportedAiCredits: null, incomplete: true };
        }
        Records.event(records, 'factory.interrupted', { factoryId: factory.id, reason: factory.reason });
      });
      await this.studio.repository.commitRecords('Record Factory controller interruption');
    }
    return this;
  }

  async authorize(input, restoration) {
    object(input, ['mandate', 'revision']);
    const mandate = validateMandate(input.mandate);
    const snapshot = await this.studio.records.read();
    if (!snapshot.data.blueprint?.deployment) throw new StudioError('DEPLOYMENT_REQUIRED', 'Save a deployment-enabled blueprint before authorizing a Factory.', 409);
    if (this.loop || this.starting || snapshot.data.runs.some((run) => !['complete', 'failed', 'cancelled'].includes(run.status))) {
      throw new StudioError('UNFINISHED_FACTORY', 'Stop the current executor or manual card before amending the Factory mandate.', 409);
    }
    if (snapshot.data.factory) this.verifyState(snapshot.data.factory, snapshot.data, { checkHostPolicy: false });
    if (snapshot.data.factory && mandate.maxCredits < snapshot.data.factory.accounting.chargedCredits + snapshot.data.factory.accounting.reservedCredits) {
      throw new StudioError('UNFUNDED_COST', 'An amendment cannot erase spent or reserved credits.', 409);
    }
    for (const action of mandate.actions) {
      if (['git-publish', 'merge-pull-request', 'infrastructure', 'deploy-nonproduction', 'release-production'].includes(action)
        && !this.operations[action]) {
        throw new StudioError('OPERATION_NOT_CONFIGURED', `Delegated ${action} needs an owner-configured, cost-bounded plan/apply adapter on this host.`, 409);
      }
    }
    await this.studio.repository.assertClean();
    const productRootCommits = (await this.studio.repository.git(['rev-list', '--max-parents=0', 'HEAD'])).trim().split(/\r?\n/).sort();
    const id = snapshot.data.factory?.id ?? restoration?.id ?? randomUUID();
    await this.studio.records.update((data) => {
      const previous = data.factory;
      data.factory = previous ? {
        ...previous, mandate, status: 'authorized', authorizedAt: now(), reason: null, hostPolicyDigest: this.hostPolicyDigest,
        controlEpoch: (previous.controlEpoch ?? 0) + 1,
        mandateHistory: [...(previous.mandateHistory ?? []), { mandate: previous.mandate, authorizedAt: previous.authorizedAt }],
      } : {
        version: 1, id, productId: data.productId, productRootCommits, blueprintDigest: digest(data.blueprint), hostPolicyDigest: this.hostPolicyDigest, mandate,
        status: 'authorized', authority: 'authenticated owner mandate request', authorizedAt: now(),
        cycles: [], tasks: [], current: null, nextScope: data.blueprint.goal, restarts: 0, controlEpoch: 0, mandateHistory: [],
        accounting: { chargedCredits: 0, reservedCredits: 0, reportedCredits: 0, incomplete: false, operationReservedCost: 0 },
        memoryBinding: { factoryId: id, recordsIndex: recordPath, productId: data.productId, transcriptCapture: false },
      };
      data.factory.authoritySignature = this.seal(this.authorityPayload(data.factory));
      data.factory.stateSignature = this.seal(statePayload(data.factory));
      if (!data.recordsIndex.sections.includes('factory')) data.recordsIndex.sections.push('factory');
      Records.event(data, 'factory.authorized', { factoryId: id, mandateDigest: digest(mandate), blueprintDigest: data.factory.blueprintDigest });
    }, text(input.revision, 'Revision', 100));
    await this.studio.repository.commitRecords('Accept product-owned Factory operating mandate');
    const accepted = (await this.read()).data;
    await this.observer?.ensure(accepted.factory, accepted.blueprint);
    await this.studio.publish();
    return this.studio.snapshot();
  }

  async exportMandate() {
    const { data } = await this.read();
    if (!data.factory) throw new StudioError('MANDATE_REQUIRED', 'No accepted Factory mandate is available.', 409);
    return { version: 1, ...this.authorityPayload(data.factory), authoritySignature: data.factory.authoritySignature };
  }

  async importMandate(envelope) {
    object(envelope, ['version', 'id', 'productId', 'productRootCommits', 'blueprintDigest', 'hostPolicyDigest', 'mandate', 'authoritySignature']);
    const { data, revision } = await this.studio.records.read();
    if (envelope.version !== 1 || !signatureEqual(envelope.authoritySignature, this.seal({
      id: envelope.id, productId: envelope.productId, productRootCommits: envelope.productRootCommits,
      blueprintDigest: envelope.blueprintDigest, hostPolicyDigest: envelope.hostPolicyDigest, mandate: envelope.mandate,
    }))) throw new StudioError('UNVERIFIED_FACTORY_AUTHORITY', 'The startup file is not a mandate signed by this owner key.', 409);
    if (envelope.productId !== data.productId || envelope.blueprintDigest !== digest(data.blueprint)) throw new StudioError('PRODUCT_BINDING_MISMATCH', 'The startup mandate belongs to a different product or blueprint.', 409);
    if (envelope.hostPolicyDigest !== this.hostPolicyDigest) throw new StudioError('HOST_POLICY_CHANGED', 'The startup envelope authorizes a different executor or operation-target policy.', 409);
    const roots = (await this.studio.repository.git(['rev-list', '--max-parents=0', 'HEAD'])).trim().split(/\r?\n/).sort();
    if (digest(roots) !== digest(envelope.productRootCommits)) throw new StudioError('PRODUCT_BINDING_MISMATCH', 'The startup mandate was accepted by a different Git repository.', 409);
    if (data.factory) {
      this.verifyState(data.factory, data);
      if (data.factory.authoritySignature !== envelope.authoritySignature) throw new StudioError('AUTHORITY_CHANGED', 'The saved mandate changed; an older startup envelope cannot replace it.', 409);
      return;
    }
    if (data.history.some((event) => event.factoryId === envelope.id)) throw new StudioError('METERING_RECONCILIATION_REQUIRED', 'Prior Factory history exists without its accounting checkpoint. An envelope cannot reset spent authority.', 409);
    await this.authorize({ mandate: validateMandate(envelope.mandate), revision }, { id: envelope.id });
    await this.studio.repository.commitRecords('Restore independently signed startup mandate without spending');
  }

  async package(input) {
    object(input, ['image', 'verification', 'revision']);
    const { data, revision } = await this.read();
    if (input.revision !== revision) throw new StudioError('STALE_REVISION', 'Reload before exporting the current blueprint.', 409);
    if (this.loop || this.starting || data.factory?.current) throw new StudioError('ACTIVE_FACTORY', 'Export a deployment package at an idle, reconciled checkpoint.', 409);
    await this.studio.repository.assertClean();
    const bundle = compileFactoryPackage({ blueprint: data.blueprint, image: input.image, verification: input.verification, bindingKey: data.productId });
    const base = join(this.studio.repository.root, '.adhd', 'studio', 'deployments');
    try { await mkdir(base); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const info = await lstat(base);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new StudioError('PATH_DENIED', 'The product deployment package directory is linked or invalid.', 403);
    const directory = join(base, bundle.digest);
    const existing = data.deployments?.find((entry) => entry.digest === bundle.digest);
    if (existing) {
      for (const [name, content] of Object.entries(bundle.files)) {
        if (await readFile(join(directory, name), 'utf8') !== content) throw new StudioError('PACKAGE_INTEGRITY', 'The saved package changed outside its designated writer.', 409);
      }
    } else {
      await materializeFactoryPackage(bundle, directory);
      await this.studio.records.update((records) => {
        records.deployments ??= [];
        records.deployments.push({ digest: bundle.digest, blueprintDigest: bundle.blueprintDigest, path: `.adhd/studio/deployments/${bundle.digest}`, createdAt: now(), writer: 'authenticated Studio owner package request' });
        if (!records.recordsIndex.sections.includes('deployments')) records.recordsIndex.sections.push('deployments');
        Records.event(records, 'deployment.package-created', { packageDigest: bundle.digest, blueprintDigest: bundle.blueprintDigest });
      }, revision);
      await this.studio.repository.commitManagedAssets([`.adhd/studio/deployments/${bundle.digest}/`, ...this.studio.repository.recordPaths], 'Save blueprint-derived Factory deployment package');
    }
    return { package: bundle, saved: true, repositoryHead: (await this.studio.repository.info()).head, state: await this.studio.snapshot() };
  }

  assertWindow(factory, action) {
    if (['revoked', 'paused', 'restricted', 'checkpoint'].includes(factory.status)) throw new StudioError('FACTORY_RESTRICTED', factory.reason ?? 'This Factory cannot execute.', 409);
    if (Date.now() >= Date.parse(factory.mandate.expiresAt)) throw new StudioError('AUTHORITY_EXPIRED', 'The Factory operating mandate expired. No authority was renewed.', 409);
    if (action && !factory.mandate.actions.includes(action)) throw new StudioError('PERMISSION_REQUIRED', `${action} is not delegated by this mandate.`, 409);
  }

  async start(options = {}) {
    if (this.starting) { await this.starting; return this.studio.snapshot(); }
    this.starting = this.beginStart(options);
    try { return await this.starting; } finally { this.starting = null; }
  }

  async beginStart({ resume = false, automatic = false } = {}) {
    if (this.loop) return this.studio.snapshot();
    const { data } = await this.read();
    const factory = data.factory;
    if (!factory) throw new StudioError('MANDATE_REQUIRED', 'Authorize a Factory operating mandate before starting.', 409);
    if (automatic && data.blueprint.deployment.startup !== 'automatic') throw new StudioError('AUTOSTART_DENIED', 'This blueprint does not select automatic startup.', 409);
    if (factory.status === 'revoked') throw new StudioError('AUTHORITY_REVOKED', 'A revoked Factory cannot restart under its old mandate.', 409);
    if (factory.status === 'interrupted' && !factory.mandate.resumeOnRestart) throw new StudioError('RESTART_NOT_AUTHORIZED', 'Restart continuation was not delegated.', 409);
    if (['paused', 'waiting-human', 'restricted'].includes(factory.status) && !resume) throw new StudioError('RESUME_REQUIRED', 'Explicitly resume the recorded restriction or pending gate.', 409);
    if (factory.cycles.length >= factory.mandate.maxCycles && !factory.current) throw new StudioError('HORIZON_EXHAUSTED', 'The authorized value-cycle horizon is exhausted.', 409);
    if (Date.now() >= Date.parse(factory.mandate.expiresAt)) throw new StudioError('AUTHORITY_EXPIRED', 'The Factory operating window expired.', 409);
    if (factory.status === 'interrupted' && factory.restarts >= factory.mandate.maxRetries) throw new StudioError('RETRY_EXHAUSTED', 'The approved restart limit is exhausted.', 409);
    if (resume && factory.status === 'restricted' && factory.current && factory.restarts >= factory.mandate.maxRetries) throw new StudioError('RETRY_EXHAUSTED', 'The approved recovery retry limit is exhausted.', 409);
    const roots = (await this.studio.repository.git(['rev-list', '--max-parents=0', 'HEAD'])).trim().split(/\r?\n/).sort();
    if (digest(roots) !== digest(factory.productRootCommits)) throw new StudioError('PRODUCT_BINDING_MISMATCH', 'The mounted Git product is not the repository that accepted this mandate.', 409);
    if (data.blueprint.deployment.humanMode !== 'in-loop' && !this.executor) {
      throw new StudioError('ISOLATED_EXECUTOR_REQUIRED', 'On-loop/out-of-loop production requires a configured isolated verification executor. No generated code will run beside controller credentials.', 409);
    }
    await this.executor?.inspect?.();
    const runtime = await this.studio.runner.inspect(this.studio.repository.root);
    if (!runtime.authenticated || !runtime.models.some((model) => model.id === factory.mandate.model)) {
      throw new StudioError('RUNTIME_UNAVAILABLE', 'The selected provider/model is not currently authenticated and available.', 503);
    }
    await this.mutate((current, records) => {
      if (current.controlEpoch !== factory.controlEpoch || current.status === 'revoked') throw new StudioError('AUTHORITY_CHANGED', 'The owner changed or revoked authority while startup was pending.', 409);
      if (['interrupted', 'restricted'].includes(current.status) && current.current) current.restarts += 1;
      current.status = 'running';
      current.reason = null;
      if (resume && current.current?.pendingGate) {
        current.current.ownerApprovedGate = current.current.pendingGate;
        delete current.current.pendingGate;
      }
      Records.event(records, 'factory.started', { factoryId: current.id, resumed: resume, automatic, runtimeEvidence: runtime.inference });
    });
    await this.studio.repository.commitRecords('Start authorized Factory production');
    this.controller = new AbortController();
    this.loop = this.run(this.controller.signal).finally(() => { this.loop = null; });
    this.loop.catch((error) => this.studio.emit('incident', { code: 'FACTORY_RECORDING_FAILED', message: redact(error.message) }));
    return this.studio.snapshot();
  }

  async restrict(error) {
    await this.mutate((factory, data) => {
      if (!['paused', 'revoked'].includes(factory.status)) factory.status = 'restricted';
      factory.reason = redact(error.message);
      Records.event(data, 'factory.restricted', { factoryId: factory.id, code: error.code ?? 'EXECUTION_FAILED', reason: factory.reason });
    });
    await this.studio.repository.commitRecords('Record unfinished Factory restriction');
  }

  async control(action) {
    if (action === 'start') return this.start();
    if (action === 'resume') return this.start({ resume: true });
    if (!['pause', 'revoke'].includes(action)) throw new StudioError('INVALID_TRANSITION', 'Unsupported Factory control.');
    await this.mutate((factory, data) => {
      factory.status = action === 'revoke' ? 'revoked' : 'paused';
      factory.controlEpoch = (factory.controlEpoch ?? 0) + 1;
      factory.reason = action === 'revoke' ? 'The owner revoked this operating mandate.' : 'The owner explicitly paused this Factory.';
      Records.event(data, `factory.${factory.status}`, { factoryId: factory.id });
    });
    this.controller?.abort(new StudioError('FACTORY_STOPPED', `Owner requested ${action}.`, 409));
    for (const entry of this.active.values()) entry.controller.abort();
    await this.loop;
    await this.studio.repository.commitRecords(`Record owner ${action} for Factory`);
    return this.studio.snapshot();
  }

  async gate(name) {
    const { data } = await this.read();
    const factory = data.factory;
    this.assertWindow(factory);
    const action = name === 'verify' ? 'verify' : name === 'integrate' ? 'integrate' : null;
    if (action && !factory.mandate.actions.includes(action)) {
      await this.mutate((current) => {
        current.status = 'waiting-human';
        current.current.pendingGate = name;
        current.reason = `${action} is not delegated. The owner must explicitly amend this mandate; resume alone does not grant permission.`;
      });
      return false;
    }
    if (data.blueprint.deployment.humanMode === 'in-loop' && factory.current.ownerApprovedGate !== name) {
      await this.mutate((current, records) => {
        current.status = 'waiting-human';
        current.current.pendingGate = name;
        current.reason = `Human-in-the-loop approval is required for ${name}.`;
        Records.event(records, 'factory.owner-decision-required', { factoryId: current.id, gate: name });
      });
      await this.studio.repository.commitRecords(`Record pending Factory ${name} decision`);
      return false;
    }
    return true;
  }

  context(task, data) {
    const factory = data.factory;
    const cycle = factory.current;
    const sourceIds = [factory.id, cycle.id, cycle.demandId, ...cycle.evidenceIds, ...factory.cycles.map((entry) => entry.id)];
    return {
      factoryId: factory.id, assignment: task, run: cycle.run, scope: cycle.scope,
      sourceIds, requiredSource: task.requiredSource,
      protectedPaths: [...this.studio.verification.args.filter((arg) => !arg.startsWith('-') && !isAbsolute(arg)).map((arg) => arg.replaceAll('\\', '/')), '.github/hooks/factory-observability.json'],
      writePaths: factory.mandate.writePaths, model: factory.mandate.model, credits: task.reservedCredits,
      allowedToolchains: cycle.technicalChoices?.toolchains ?? data.blueprint.deployment.toolchains,
      timeoutMs: Math.max(1, Math.min(factory.mandate.taskSeconds * 1000, Date.parse(factory.mandate.expiresAt) - Date.now())),
      memoryBinding: { ...factory.memoryBinding, revision: this.studio.records.revision, cycleId: cycle.id, cardId: cycle.run.cardId, assignmentId: task.id },
      limits: factory.mandate, deployment: data.blueprint.deployment,
      evidence: {
        mission: data.blueprint.goal, sourceIds, task: { role: task.role, kind: task.kind, writable: task.writable },
        technicalChoices: cycle.technicalChoices ?? null,
        currentCard: { id: cycle.run.cardId, scope: cycle.scope, bucket: cycle.bucket, readiness: cycle.readiness },
        demand: data.demands.find((entry) => entry.id === cycle.demandId),
        evidence: factory.tasks.filter((entry) => cycle.evidenceIds.includes(entry.id)).map(({ id, role, result, endedAt }) => ({ id, role, result, endedAt })),
        completed: factory.cycles.map(({ id, scope, integratedHead, verification, completedAt }) => ({ id, scope, integratedHead, verification, completedAt })),
        history: data.history.filter((event) => event.factoryId === factory.id).slice(-40),
        accounting: factory.accounting, verification: this.studio.verification,
      },
      commandNames: this.executor ? Object.keys(this.commands) : [],
    };
  }

  async dispatch(role, kind, signal, { writable = false, requiredSource = null } = {}) {
    signal.throwIfAborted();
    const task = { id: randomUUID(), role, kind, writable, requiredSource, status: 'queued', attempt: 0, queuedAt: now() };
    let context;
    await this.mutate((factory, data) => {
      this.assertWindow(factory, writable ? 'generate' : null);
      const active = factory.tasks.filter((entry) => ['queued', 'running'].includes(entry.status)).length;
      if (active >= factory.mandate.maxParallel) throw new StudioError('CAPACITY_EXCEEDED', 'The approved concurrent assignment limit is reached.', 409);
      const cap = factory.mandate.creditsPerTask;
      if (factory.accounting.chargedCredits + factory.accounting.reservedCredits + cap > factory.mandate.maxCredits) {
        throw new StudioError('BUDGET_EXHAUSTED', 'No unreserved AI-credit capacity remains. Unknown billing stays conservatively charged.', 409);
      }
      task.reservedCredits = cap;
      task.deadline = new Date(Math.min(Date.now() + factory.mandate.taskSeconds * 1000, Date.parse(factory.mandate.expiresAt))).toISOString();
      task.cycleId = factory.current.id;
      factory.accounting.reservedCredits += cap;
      factory.tasks.push(task);
      context = this.context(task, data);
      Records.event(data, 'factory.assignment.queued', { factoryId: factory.id, assignmentId: task.id, role, kind });
    });
    if (this.execution === 'workers') return this.awaitWorker(task, context, signal);
    const controller = new AbortController();
    const combined = AbortSignal.any([signal, controller.signal, AbortSignal.timeout(Math.max(1, Date.parse(task.deadline) - Date.now()))]);
    const execution = { controller };
    this.active.set(task.id, execution);
    try {
      await this.mutate((factory) => {
        const stored = factory.tasks.find((entry) => entry.id === task.id);
        stored.status = 'running';
        stored.startedAt = now();
        stored.attempt = 1;
        stored.executor = `local:${process.pid}`;
      });
      const result = await this.runner.execute(role, {
        ...context, signal: combined,
        observe: (type, details) => this.observe(task.id, type, details),
        output: (actor, delta) => this.studio.emit('output', { factoryId: context.factoryId, assignmentId: task.id, role: actor, text: delta }),
        runCommand: (name) => this.buildCommand(task.id, name, combined),
      });
      combined.throwIfAborted();
      return await this.finish(task.id, result);
    } catch (error) {
      await this.fail(task.id, error);
      throw error;
    } finally {
      this.active.delete(task.id);
    }
  }

  async observe(id, type, details) {
    const allowed = ['assignment.accepted', 'session.started', 'tool.completed', 'skill.loaded', 'role.result-submitted'];
    if (!allowed.includes(type)) throw new StudioError('INVALID_EVENT', 'Unsupported Factory worker event.');
    object(details, ['sessionId', 'definitionDigest', 'tool', 'toolCallId', 'skill', 'sourceDigest', 'decision', 'sources']);
    let event;
    await this.mutate((factory, data) => {
      this.assertWindow(factory);
      const task = factory.tasks.find((entry) => entry.id === id);
      if (!task || task.status !== 'running') throw new StudioError('STALE_ASSIGNMENT', 'The assignment is no longer running.', 409);
      task.lastProgressAt = now();
      if (type === 'assignment.accepted') task.acceptedAt = now();
      if (details.sessionId) {
        if (factory.tasks.some((other) => other.id !== id && other.sessionId === details.sessionId)) {
          throw new StudioError('SHARED_SESSION_DENIED', 'Independent Factory assignments cannot share an SDK session.', 409);
        }
        task.sessionId = text(details.sessionId, 'Actual SDK session ID', 100);
      }
      Records.event(data, `factory.${type}`, { factoryId: factory.id, assignmentId: id, role: task.role, ...details });
      event = data.history.at(-1);
    }, { publish: false });
    this.studio.emit('factory-event', event);
  }

  async finish(id, outcome) {
    object(outcome, ['result', 'usage', 'sessionId']);
    let result;
    await this.mutate((factory, data) => {
      const task = factory.tasks.find((entry) => entry.id === id);
      if (!task || task.status !== 'running' || !task.acceptedAt || !task.sessionId) throw new StudioError('STALE_ASSIGNMENT', 'Only an accepted, independently observed running assignment may finish.', 409);
      this.assertWindow(factory);
      const context = this.context(task, data);
      result = validateRoleResult(outcome.result, context.sourceIds);
      if (task.requiredSource && !result.sources.includes(task.requiredSource)) throw new StudioError('MISSING_DEPENDENT_EVIDENCE', 'The role result did not cite its verified predecessor.', 422);
      if (outcome.sessionId !== task.sessionId) throw new StudioError('SESSION_SCOPE_MISMATCH', 'Worker completion belongs to another session.', 409);
      const reported = outcome.usage?.reportedAiCredits;
      const complete = outcome.usage?.incomplete === false && Number.isFinite(reported) && reported >= 0 && reported <= task.reservedCredits;
      task.usage = { reportedAiCredits: Number.isFinite(reported) ? reported : null, incomplete: !complete };
      factory.accounting.reservedCredits -= task.reservedCredits;
      factory.accounting.chargedCredits += complete ? reported : Math.max(task.reservedCredits, Number.isFinite(reported) ? reported : 0);
      if (Number.isFinite(reported) && reported >= 0) factory.accounting.reportedCredits += reported;
      factory.accounting.incomplete ||= !complete;
      task.result = result;
      task.status = 'complete';
      task.endedAt = now();
      if (factory.current?.id === task.cycleId) factory.current.evidenceIds.push(id);
      Records.event(data, 'factory.assignment.completed', { factoryId: factory.id, assignmentId: id, role: task.role, usage: task.usage });
      if (Number.isFinite(reported) && reported > task.reservedCredits) {
        factory.status = 'restricted';
        factory.reason = 'Provider usage exceeded its acknowledged cap; no further inference is authorized.';
      }
    });
    return { id, result };
  }

  async fail(id, error) {
    await this.mutate((factory, data) => {
      const task = factory.tasks.find((entry) => entry.id === id);
      if (!task || !['queued', 'running'].includes(task.status)) return;
      task.status = 'failed';
      task.error = redact(error.message);
      task.endedAt = now();
      task.usage = { reportedAiCredits: null, incomplete: true };
      factory.accounting.reservedCredits -= task.reservedCredits;
      factory.accounting.chargedCredits += task.reservedCredits;
      factory.accounting.incomplete = true;
      Records.event(data, 'factory.assignment.failed', { factoryId: factory.id, assignmentId: id, role: task.role, error: task.error });
    });
  }

  async buildCommand(id, name, signal) {
    const spec = this.commands[name];
    if (!spec) throw new StudioError('COMMAND_DENIED', 'This build command is not configured.', 403);
    const { data } = await this.read();
    this.assertWindow(data.factory, 'generate');
    const task = data.factory.tasks.find((entry) => entry.id === id);
    if (!task?.writable || task.status !== 'running') throw new StudioError('COMMAND_DENIED', 'Only the active builder may invoke a configured build command.', 403);
    if (!this.executor) throw new StudioError('ISOLATED_EXECUTOR_REQUIRED', 'Generated build commands require isolated execution.', 409);
    const result = await this.executor.execute({ directory: data.factory.current.run.directory, verification: spec, signal, maximumMillis: data.factory.mandate.taskSeconds * 1000 });
    if (result.code !== 0) throw new StudioError('BUILD_FAILED', result.output || `Configured ${name} failed.`, 422);
    return result;
  }

  async newCycle(signal) {
    signal.throwIfAborted();
    const { data } = await this.read();
    const factory = data.factory;
    this.assertWindow(factory, 'generate');
    if (factory.cycles.length >= factory.mandate.maxCycles) return false;
    const id = randomUUID();
    const runId = randomUUID();
    const demandId = randomUUID();
    await this.studio.repository.assertClean();
    await this.mutate((current, records) => {
      current.current = {
        id, demandId, scope: text(current.nextScope, 'Authorized outcome'), phase: 'prepare',
        evidenceIds: [], bucket: 'To Do', readiness: false,
        run: { id: runId, cardId: `CARD-${runId}` },
      };
      const squads = records.blueprint.factories.flatMap((entry) => entry.squads.map((squad) => ({ factoryId: entry.id, squad })));
      const assigned = squads[current.cycles.length % squads.length];
      current.current.factoryId = assigned.factoryId;
      current.current.squadId = assigned.squad.id;
      current.current.members = Number(assigned.squad.members);
      records.demands.push({ id: demandId, source: current.cycles.length ? 'VOC outcome-learning proposal under delegated mission' : 'Authenticated owner mission', scope: current.current.scope, custody: 'Pending VOC', disposition: 'Pending', receivedAt: now(), factoryId: current.id });
      Records.event(records, 'demand.received', { factoryId: current.id, demandId, cycleId: id });
    });
    await this.studio.repository.commitRecords(`Register Factory demand ${demandId}`);
    const worktree = await this.studio.repository.createWorktree(runId);
    await this.mutate((current) => Object.assign(current.current.run, worktree));
    return true;
  }

  async run(signal) {
    try {
      while (!signal.aborted) {
        let factory = (await this.read()).data.factory;
        if (!factory.current && !await this.newCycle(signal)) {
          await this.mutate((current, records) => {
            current.status = 'checkpoint';
            current.reason = 'Authorized value-cycle horizon reached. This is a bounded checkpoint, not Factory shutdown or permission for additional cycles.';
            Records.event(records, 'factory.checkpoint', { factoryId: current.id, cycles: current.cycles.length });
          });
          break;
        }
        factory = (await this.read()).data.factory;
        await this.studio.repository.assertWorktree(factory.current.run);
        if (factory.current.phase === 'prepare') {
          if (!factory.current.technicalChoices && (factory.mandate.actions.includes('technical-decisions'))) {
            const choices = await this.council(signal);
            await this.mutate((current) => { current.current.technicalChoices = choices; });
          }
          let predecessor = null;
          for (const role of ['VOC', 'ProductOwner', 'AssociateProductOwner', 'Squad', 'Kanban']) {
            factory = (await this.read()).data.factory;
            const completed = factory.tasks.find((task) => task.cycleId === factory.current.id && task.kind === 'readiness' && task.role === role && task.status === 'complete');
            const outcome = completed ? { id: completed.id, result: completed.result } : await this.dispatch(role, 'readiness', signal, { requiredSource: predecessor });
            if (outcome.result.decision !== 'continue') throw new StudioError('READINESS_BLOCKED', `${role}: ${outcome.result.summary}`, 409);
            predecessor = outcome.id;
            if (role === 'VOC') await this.mutate((current, data) => { data.demands.find((entry) => entry.id === current.current.demandId).custody = 'Acknowledged by VOC'; });
            if (role === 'ProductOwner') await this.mutate((current, data) => { data.demands.find((entry) => entry.id === current.current.demandId).disposition = 'Accepted within delegated mission'; });
          }
          await this.mutate((current, data) => {
            current.current.readiness = true;
            current.current.phase = 'deliver';
            Records.event(data, 'factory.card.ready', { factoryId: current.id, cardId: current.current.run.cardId, evidenceIds: current.current.evidenceIds });
          });
          await this.studio.repository.commitRecords('Record verified Factory readiness handoffs');
        }
        factory = (await this.read()).data.factory;
        if (factory.current.phase === 'deliver') {
          if (!await this.gate('deliver')) break;
          const actorCount = factoryRoles.length + factory.current.members - 1;
          if (actorCount > factory.mandate.maxParallel) throw new StudioError('CAPACITY_EXCEEDED', 'The configured Squad and nine-role roster exceed approved concurrency. No reduced roster was silently substituted.', 409);
          if (factory.accounting.chargedCredits + factory.accounting.reservedCredits + actorCount * factory.mandate.creditsPerTask > factory.mandate.maxCredits) {
            throw new StudioError('BUDGET_EXHAUSTED', 'The remaining credit escrow cannot fund all nine independent role caps; no partial concurrent wave was started.', 409);
          }
          await this.mutate((current) => { current.current.bucket = 'In Progress'; });
          // Different role assignments start before any is awaited; they never share an SDK context.
          const assignments = factoryRoles.map((role) => this.dispatch(role, role === 'Fullstacker' ? 'delivery' : 'replenishment-and-assurance', signal, { writable: role === 'Fullstacker' }));
          for (let member = 1; member < factory.current.members; member += 1) assignments.push(this.dispatch('Fullstacker', 'technical-review', signal));
          const outcomes = await Promise.allSettled(assignments);
          const failures = outcomes.filter((outcome) => outcome.status === 'rejected');
          if (failures.length) throw new AggregateError(failures.map((outcome) => outcome.reason), 'Factory role assignments failed; unfinished work is preserved.');
          const blocked = outcomes.map((outcome) => outcome.value).find((outcome) => outcome.result.decision === 'blocked');
          if (blocked) throw new StudioError('ROLE_BLOCKED', blocked.result.summary, 409);
          const current = (await this.read()).data.factory.current;
          await this.studio.repository.git(['add', '--all'], current.run.directory);
          const paths = (await this.studio.repository.git(['diff', '--name-only', current.run.baseHead], current.run.directory)).trim().split(/\r?\n/).filter(Boolean);
          if (paths.some((path) => !mayWrite(factory.mandate.writePaths, path) || path.startsWith('.adhd/') || path.startsWith('.factory/'))) throw new StudioError('PATH_DENIED', 'The candidate changed files outside its authorized write scope.', 403);
          const diff = await this.studio.repository.diff(current.run);
          if (!diff.trim()) throw new StudioError('NO_INCREMENT', 'The Factory produced no changed work product.', 422);
          if (containsCredential(diff)) throw new StudioError('CREDENTIAL_CONTENT_DENIED', 'Potential credentials in the candidate prevent integration.', 403);
          await this.mutate((state) => { state.current.diffDigest = digest(diff); state.current.phase = 'verify'; });
          await this.studio.repository.commitRecords('Record Factory candidate review checkpoint');
        }
        factory = (await this.read()).data.factory;
        if (factory.current.phase === 'verify') {
          if (!await this.gate('verify')) break;
          const cycle = factory.current;
          if (digest(await this.studio.repository.diff(cycle.run)) !== cycle.diffDigest) throw new StudioError('CANDIDATE_CHANGED', 'The reviewed candidate changed before verification.', 409);
          const verification = await this.verify(cycle.run.directory, signal);
          if (digest(await this.studio.repository.diff(cycle.run)) !== cycle.diffDigest) throw new StudioError('CANDIDATE_CHANGED', 'Verification modified the candidate.', 409);
          const candidateHead = await this.studio.repository.commitCandidate(cycle.run);
          await this.mutate((current, records) => {
            current.current.run.candidateHead = candidateHead;
            current.current.verification = verification;
            current.current.phase = 'integrate';
            Records.event(records, 'factory.verification.passed', { factoryId: current.id, cycleId: current.current.id, candidateHead, verification });
          });
          await this.studio.repository.commitRecords('Record verified Factory candidate');
        }
        factory = (await this.read()).data.factory;
        if (factory.current.phase === 'integrate') {
          if (!await this.gate('integrate')) break;
          const head = await this.studio.repository.accept(factory.current.run);
          await this.mutate((current) => { current.current.integratedHead = head; current.current.phase = 'integrated-check'; });
          await this.studio.repository.commitRecords('Checkpoint Factory integration before checking the integrated product');
        }
        factory = (await this.read()).data.factory;
        if (factory.current.phase === 'integrated-check') {
          const verification = await this.verify(this.studio.repository.root, signal);
          await this.mutate((current, records) => {
            current.current.integratedVerification = verification;
            current.current.phase = 'operations';
            Records.event(records, 'factory.integration.passed', { factoryId: current.id, cycleId: current.current.id, head: current.current.integratedHead, verification });
          });
          await this.studio.repository.commitRecords('Record integrated Factory acceptance evidence');
        }
        factory = (await this.read()).data.factory;
        if (factory.current.phase === 'operations') {
          for (const action of ['git-publish', 'merge-pull-request', 'infrastructure', 'deploy-nonproduction', 'release-production']) {
            if (factory.mandate.actions.includes(action)) await this.operation(action, signal);
          }
          await this.mutate((current) => { current.current.phase = 'learn'; });
        }
        factory = (await this.read()).data.factory;
        if (factory.current.phase === 'learn') {
          const cycle = factory.current;
          if (!factory.cycles.some((entry) => entry.id === cycle.id)) {
            await this.mutate((current, records) => {
              const completion = { ...current.current, completedAt: now(), bucket: undefined };
              current.cycles.push(completion);
              records.completed.push({ id: randomUUID(), factoryId: current.id, cardId: completion.run.cardId, cycleId: completion.id, head: completion.integratedHead, verification: completion.integratedVerification, time: completion.completedAt });
              records.demands.find((entry) => entry.id === completion.demandId).disposition = 'Produced and empirically integrated';
              Records.event(records, 'factory.increment.completed', { factoryId: current.id, cycleId: completion.id, head: completion.integratedHead });
            });
            await this.studio.repository.commitRecords('Record verified Factory value increment');
          }
          factory = (await this.read()).data.factory;
          if (factory.cycles.length < factory.mandate.maxCycles) {
            this.assertWindow(factory, 'replenish');
            const learning = await this.dispatch('VOC', 'outcome-learning', signal, { requiredSource: cycle.id });
            if (learning.result.decision === 'blocked' || !learning.result.nextScope) throw new StudioError('NO_EVIDENCED_NEXT_OUTCOME', 'VOC did not supply an evidenced next outcome; no demand or continuation was invented.', 409);
            await this.mutate((current) => { current.nextScope = learning.result.nextScope; });
          }
          await this.mutate((current) => { current.current = null; });
          await this.studio.repository.commitRecords('Checkpoint Factory outcome learning and next cursor');
        }
      }
      await this.studio.repository.commitRecords('Save Factory operating checkpoint');
    } catch (error) {
      if (signal.aborted && signal.reason?.code === 'CONTROLLER_INTERRUPTED') {
        await this.mutate((factory, data) => {
          factory.status = 'interrupted';
          factory.reason = signal.reason.message;
          Records.event(data, 'factory.interrupted', { factoryId: factory.id, reason: signal.reason.message });
        });
        await this.studio.repository.commitRecords('Save interrupted Factory restart cursor');
      } else await this.restrict(error);
    }
  }

  async verify(directory, signal) {
    const { data } = await this.read();
    this.assertWindow(data.factory, 'verify');
    signal.throwIfAborted();
    const timeout = Math.min(data.factory.mandate.taskSeconds * 1000, Date.parse(data.factory.mandate.expiresAt) - Date.now());
    const combined = AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, timeout))]);
    const result = this.executor
      ? await this.executor.execute({ directory, verification: this.studio.verification, signal: combined, maximumMillis: timeout })
      : await command(this.studio.verification.command, this.studio.verification.args, directory, { signal: combined, env: verificationEnv() });
    combined.throwIfAborted();
    if (result.code !== 0 || /^# tests 0$/m.test(result.output)) throw new StudioError('VERIFICATION_FAILED', result.output || 'The owner-configured acceptance command failed.', 422);
    return { ...this.studio.verification, exitCode: result.code, output: result.output, observedAt: now() };
  }

  async council(signal) {
    const { data } = await this.read();
    const configuration = data.blueprint.deployment;
    const delegated = !configuration.toolchains.length || configuration.factoryCloud === 'council'
      || configuration.productCloud === 'council' || configuration.redundancy === null;
    if (!delegated) return { toolchains: configuration.toolchains, factoryCloud: configuration.factoryCloud, productCloud: configuration.productCloud, redundancy: configuration.redundancy, source: 'explicit blueprint owner choices' };
    this.assertWindow(data.factory, 'technical-decisions');
    const members = data.factory.current.members;
    if (members > data.factory.mandate.maxParallel) throw new StudioError('CAPACITY_EXCEEDED', 'The Fullstacker council exceeds approved concurrency.', 409);
    const outcomes = await Promise.all(Array.from({ length: members }, () => this.dispatch('Fullstacker', 'technical-council', signal)));
    if (outcomes.some((entry) => entry.result.decision === 'blocked' || !entry.result.choices)) throw new StudioError('COUNCIL_EVIDENCE_REQUIRED', 'Every participating Fullstacker must submit an explicit source-backed technical proposal.', 409);
    const selected = outcomes[0].result.choices;
    if (outcomes.some((entry) => digest(entry.result.choices) !== digest(selected))) throw new StudioError('COUNCIL_DISAGREEMENT', 'The Fullstacker council has not agreed on one technical proposal; no choice or authority was fabricated.', 409);
    if ((!configuration.toolchains.length && selected.toolchain === null)
      || (configuration.factoryCloud === 'council' && selected.factoryCloud === null)
      || (configuration.productCloud === 'council' && selected.productCloud === null)
      || (configuration.redundancy === null && selected.redundancy === null)) {
      throw new StudioError('COUNCIL_EVIDENCE_REQUIRED', 'Delegated technical choices must be explicit, not unknown defaults.', 409);
    }
    return {
      toolchains: configuration.toolchains.length ? configuration.toolchains : [selected.toolchain],
      factoryCloud: configuration.factoryCloud === 'council' ? selected.factoryCloud : configuration.factoryCloud,
      productCloud: configuration.productCloud === 'council' ? selected.productCloud : configuration.productCloud,
      redundancy: configuration.redundancy ?? selected.redundancy,
      sources: outcomes.map((entry) => entry.id),
      placementState: 'Technical decision only; infrastructure changes still require a priced plan and delegated apply adapter.',
    };
  }

  async operation(action, signal) {
    const adapter = this.operations[action];
    if (!adapter) throw new StudioError('OPERATION_NOT_CONFIGURED', `No trusted adapter is configured for ${action}.`, 409);
    const { data } = await this.read();
    this.assertWindow(data.factory, action);
    const cycle = data.factory.current;
    if (cycle.operations?.[action]?.status === 'complete') return;
    if (cycle.operations?.[action]?.status === 'applying') throw new StudioError('OPERATION_RECONCILIATION_REQUIRED', `${action} was interrupted during apply. Reconcile the observed effect before any retry.`, 409);
    const plan = await adapter.plan({ head: cycle.integratedHead, cycleId: cycle.id, signal });
    if (!plan || plan.head !== cycle.integratedHead || !Number.isFinite(plan.maximumCost) || plan.maximumCost < 0 || !plan.costSource || !plan.digest) {
      throw new StudioError('UNVERIFIED_OPERATION_PLAN', `${action} did not return a source-bound immutable plan and a maximum cost.`, 409);
    }

    const cost = data.factory.mandate.cost;
    if (plan.maximumCost > 0 && (!cost || plan.currency !== cost.currency)) throw new StudioError('UNPRICED_OPERATION', 'A priced operation requires a confirmed matching currency envelope.', 409);
    await this.mutate((factory, records) => {
      this.assertWindow(factory, action);
      if (cost && factory.accounting.operationReservedCost + plan.maximumCost > cost.infrastructureReserve) throw new StudioError('COST_LIMIT', 'The operation would exceed the remaining approved infrastructure reserve.', 409);
      factory.accounting.operationReservedCost += plan.maximumCost;
      factory.current.operations ??= {};
      factory.current.operations[action] = { status: 'applying', planDigest: plan.digest, head: plan.head, maximumCost: plan.maximumCost, costSource: plan.costSource };
      Records.event(records, 'factory.operation.reserved', { factoryId: factory.id, action, planDigest: plan.digest, maximumCost: plan.maximumCost });
    });
    await this.studio.repository.commitRecords(`Reserve and bind ${action} plan before apply`);
    signal.throwIfAborted();
    if (!await adapter.validate(plan, { signal })) throw new StudioError('PLAN_CHANGED', 'The approved plan, target or artifact changed before apply.', 409);
    this.assertWindow((await this.read()).data.factory, action);
    const receipt = await adapter.apply(plan, { signal });
    if (receipt?.planDigest !== plan.digest || receipt?.success !== true) throw new StudioError('OPERATION_UNVERIFIED', `${action} did not supply an observed receipt for the exact plan.`, 409);
    await this.mutate((factory, records) => {
      factory.current.operations[action].status = 'complete';
      factory.current.operations[action].receipt = receipt;
      Records.event(records, 'factory.operation.completed', { factoryId: factory.id, action, planDigest: plan.digest });
    });
    await this.studio.repository.commitRecords(`Record observed ${action} receipt`);
  }

  async awaitWorker(task, context, signal) {
    return new Promise((resolve, reject) => {
      const finish = async (error) => {
        const waiter = this.waiters.get(task.id);
        if (!waiter) return;
        this.waiters.delete(task.id);
        clearTimeout(waiter.timer);
        signal.removeEventListener('abort', abort);
        try { await this.fail(task.id, error); } catch (recording) { reject(recording); return; }
        reject(error);
      };
      const abort = () => finish(signal.reason ?? new StudioError('INTERRUPTED', 'Worker assignment stopped.', 409));
      const timer = setTimeout(() => finish(new StudioError('WORKER_TIMEOUT', 'The registered worker missed its owner-approved assignment deadline.', 409)), context.timeoutMs);
      this.waiters.set(task.id, { resolve, reject, context, timer, abort, signal });
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  }

  async claim(role, input) {
    object(input, ['workerId']);
    const workerId = identifier(input.workerId);
    const snapshot = await this.read();
    if (!snapshot.data.factory || snapshot.data.factory.status !== 'running') return { task: null };
    this.assertWindow(snapshot.data.factory);
    if (!snapshot.data.factory.tasks.some((entry) => entry.role === role && entry.status === 'queued' && this.waiters.has(entry.id))) return { task: null };
    let claimed = null;
    await this.mutate((factory, data) => {
      this.assertWindow(factory);
      const task = factory.tasks.find((entry) => entry.role === role && entry.status === 'queued' && this.waiters.has(entry.id));
      if (!task) return;
      task.status = 'running';
      task.workerId = workerId;
      task.lease = randomUUID();
      task.startedAt = now();
      task.attempt = 1;
      claimed = { ...this.context(task, data), lease: task.lease };
      Records.event(data, 'factory.worker.claimed', { factoryId: factory.id, assignmentId: task.id, role, workerId });
    });
    return { task: claimed };
  }

  async workerTask(role, id, lease) {
    const { data } = await this.read();
    this.assertWindow(data.factory);
    const task = data.factory.tasks.find((entry) => entry.id === id);
    if (!task || task.role !== role || task.lease !== lease || task.status !== 'running' || !this.waiters.has(id)) {
      throw new StudioError('STALE_WORKER_LEASE', 'The worker assignment lease is no longer valid.', 409);
    }
    return task;
  }

  async workerEvent(role, id, input) {
    object(input, ['lease', 'type', 'details']);
    await this.workerTask(role, id, input.lease);
    await this.observe(id, input.type, input.details);
    return { recorded: true };
  }

  async workerComplete(role, id, input) {
    object(input, ['lease', 'outcome', 'error']);
    const { data } = await this.read();
    const previous = data.factory.tasks.find((task) => task.id === id);
    if (previous?.role === role && previous.lease === input.lease && previous.completionDigest === digest(input)) return { recorded: true, duplicate: true };
    await this.workerTask(role, id, input.lease);
    const waiter = this.waiters.get(id);
    try {
      if (input.error) {
        const error = new StudioError('WORKER_FAILED', redact(text(input.error, 'Worker error', 2000)), 422);
        await this.fail(id, error);
        waiter.reject(error);
      } else {
        const result = await this.finish(id, input.outcome);
        waiter.resolve(result);
      }
      await this.mutate((factory) => { factory.tasks.find((task) => task.id === id).completionDigest = digest(input); });
    } catch (error) {
      await this.fail(id, error);
      waiter.reject(error);
      throw error;
    } finally {
      clearTimeout(waiter.timer);
      waiter.signal.removeEventListener('abort', waiter.abort);
      this.waiters.delete(id);
    }
    return { recorded: true };
  }

  async close() {
    this.controller?.abort(new StudioError('CONTROLLER_INTERRUPTED', 'The Factory controller is stopping; preserve its cursor.', 409));
    await this.loop;
    await this.runner.stop();
    await this.observer?.close();
  }
}
