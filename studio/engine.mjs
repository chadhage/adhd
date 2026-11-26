import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { activeStatuses, digest, identifier, object, recordPath, redact, StudioError, text, validateBlueprint, validateReview } from './contracts.mjs';
import { CopilotRunner, stages } from './copilot.mjs';
import { command, ProductRepository, Records } from './repository.mjs';

export class Studio extends EventEmitter {
  constructor({ workspace, mode = 'local', runner = new CopilotRunner(), verification, recordStore, leaseGuard }) {
    super();
    this.mode = mode;
    this.repository = new ProductRepository(workspace);
    this.runner = runner;
    this.verification = verification;
    this.recordStore = recordStore;
    this.leaseGuard = leaseGuard;
    this.grants = new Map();
    this.executions = new Map();
    this.transient = new Map();
  }

  async initialize() {
    if (!this.verification || typeof this.verification.command !== 'string' || !Array.isArray(this.verification.args)
      || !this.verification.args.every((arg) => typeof arg === 'string')) {
      throw new StudioError('VERIFICATION_REQUIRED', 'Configure the owner-approved verification executable and argument list.');
    }
    await this.repository.initialize();
    this.records = await new Records(this.repository, { store: this.recordStore, leaseGuard: this.leaseGuard }).initialize();
    await this.records.update((data) => {
      for (const run of data.runs) {
        if (['running', 'verifying'].includes(run.status)) {
          run.status = 'interrupted';
          Records.event(data, 'run.interrupted', { runId: run.id, reason: 'Service restarted; no execution was replayed.' });
        }
      }
    });
    return this;
  }

  async snapshot() {
    const { data, revision } = await this.records.read();
    const runs = [];
    for (const run of data.runs) {
      const transient = this.transient.get(run.id) ?? {};
      if (!transient.diff && run.directory && ['review-required', 'verified', 'complete', 'integration-failed'].includes(run.status)) {
        transient.diff = await this.repository.diff(run);
        this.transient.set(run.id, transient);
      }
      runs.push({ ...run, ...transient });
    }
    let factory = data.factory ?? null;
    if (factory?.current?.diffDigest && ['verify', 'integrate'].includes(factory.current.phase)) {
      factory = { ...factory, candidateDiff: await this.repository.diff(factory.current.run) };
    }
    return { version: 1, revision, blueprint: data.blueprint, runs, factory, completed: data.completed, demands: data.demands, repository: await this.repository.info(), mode: this.mode, verification: this.verification, wipLimit: 1 };
  }

  async publish() {
    this.emit('state', await this.snapshot());
  }

  async saveBlueprint(input) {
    object(input, ['blueprint', 'revision']);
    const blueprint = validateBlueprint(input.blueprint);
    if (blueprint.path !== this.mode) throw new StudioError('MODE_MISMATCH', `This service runs in ${this.mode} mode; connect to the selected hosting mode.`, 409);
    await this.repository.assertClean();
    await this.records.update((data) => {
      if (data.runs.some((run) => activeStatuses.includes(run.status))) throw new StudioError('ACTIVE_RUN', 'Finish or cancel the existing cycle before changing its blueprint.', 409);
      if (data.factory && !['checkpoint', 'revoked'].includes(data.factory.status)) throw new StudioError('ACTIVE_FACTORY', 'Reconcile and revoke the current Factory mandate before changing its bound blueprint.', 409);
      if (data.factory?.current) throw new StudioError('UNFINISHED_FACTORY', 'An unfinished Factory card still depends on this blueprint.', 409);
      data.blueprint = blueprint;
      Records.event(data, 'blueprint.saved', { blueprintDigest: digest(blueprint), authority: 'authenticated workspace-owner request' });
    }, text(input.revision, 'Revision', 100));
    this.grants.clear();
    await this.repository.commitRecords('Save Studio product blueprint');
    await this.publish();
    return this.snapshot();
  }

  async check(input) {
    object(input, ['review', 'blueprintDigest']);
    const { data } = await this.records.read();
    if (!data.blueprint || digest(data.blueprint) !== input.blueprintDigest) throw new StudioError('STALE_BLUEPRINT', 'Save the current blueprint before checking readiness.', 409);
    const review = validateReview(input.review, data.blueprint);
    await this.repository.assertClean();
    const runtime = await this.runner.inspect(this.repository.root);
    const checks = [
      { title: 'Product repository', ok: true, note: 'Existing product Git worktree verified; the framework is not used for product records.' },
      { title: 'Copilot authentication', ok: runtime.authenticated, note: runtime.authenticated ? 'SDK authentication observed. Inference is verified by execution, not this check.' : 'Run copilot login yourself on the service host, then retry.' },
      { title: 'Selected model', ok: runtime.models.some((model) => model.id === review.model), note: 'The selected concrete model or routing entry must be reported by this session-scoped catalog. Unavailable defaults are not silently used.' },
      { title: 'Bounded execution', ok: true, note: `${review.budget} AI credits maximum in one shared SDK accounting window; ${review.maxSeconds} seconds. Sequential role handoffs share context, not independent workers. No automatic next cycle.` },
      { title: 'Verification and acceptance', ok: true, note: 'The displayed command runs only after you inspect the generated diff. Integration requires a separate acceptance action.' },
    ];
    const ready = checks.every((check) => check.ok);
    let authorizationId = null;
    if (ready) {
      authorizationId = randomUUID();
      this.grants.set(authorizationId, { review, blueprintDigest: input.blueprintDigest, head: (await this.repository.info()).head, expires: Date.now() + 5 * 60_000 });
    }
    return { ready, checks, authorizationId, runtime };
  }

  async start(input) {
    object(input, ['authorizationId', 'idempotencyKey']);
    identifier(input.idempotencyKey);
    const before = await this.records.read();
    const existing = before.data.runs.find((run) => run.idempotencyKey === input.idempotencyKey);
    if (existing) return this.snapshot();
    const grant = this.grants.get(input.authorizationId);
    if (!grant || grant.expires < Date.now() || grant.blueprintDigest !== digest(before.data.blueprint)) {
      throw new StudioError('AUTHORIZATION_EXPIRED', 'Check the current scope and permissions again before starting.', 409);
    }
    if (before.data.runs.some((run) => activeStatuses.includes(run.status))) throw new StudioError('WIP_LIMIT', 'One product card is already unfinished. Resume, accept, or cancel it first.', 409);
    if (before.data.factory?.current || before.data.factory?.status === 'running') throw new StudioError('WIP_LIMIT', 'The Factory owns product delivery. Reconcile its current card before starting a manual card.', 409);
    await this.repository.assertClean();
    if ((await this.repository.info()).head !== grant.head) throw new StudioError('BASE_CHANGED', 'The product revision changed; repeat readiness checks.', 409);
    const id = randomUUID();
    const run = {
      id, cardId: `CARD-${id}`, demandId: `DEMAND-${id}`, idempotencyKey: input.idempotencyKey,
      status: 'running', phase: 0, sessions: {}, review: grant.review, blueprintDigest: grant.blueprintDigest,
      createdAt: new Date().toISOString(), deadline: new Date(Date.now() + grant.review.maxSeconds * 1000).toISOString(),
      usage: { inputTokens: 0, outputTokens: 0, reportedAiCredits: null, incomplete: true },
      contract: { status: 'Accepted', authority: 'authenticated workspace-owner readiness and start requests', operatingProfile: 'bounded', recordLocation: recordPath, noRemotePublication: true, transcriptCapture: false },
    };
    await this.records.update((data) => {
      data.demands.push({ id: run.demandId, sourceEventId: input.idempotencyKey, source: 'authenticated owner submission', receivedAt: run.createdAt, scope: grant.review.scope, custody: 'Pending VOC', disposition: 'Conditionally accepted by workspace owner', runId: id });
      data.runs.push(run);
      Records.event(data, 'demand.received', { runId: id, demandId: run.demandId });
    }, before.revision);
    await this.repository.commitRecords(`Register Studio demand ${run.demandId}`);
    const worktree = await this.repository.createWorktree(id);
    await this.records.update((data) => Object.assign(data.runs.find((entry) => entry.id === id), worktree));
    this.grants.delete(input.authorizationId);
    this.launch(id);
    await this.publish();
    return this.snapshot();
  }

  launch(id) {
    const controller = new AbortController();
    const execution = { controller, promise: null };
    this.executions.set(id, execution);
    execution.promise = this.work(id, controller.signal).finally(() => this.executions.delete(id));
    execution.promise.catch((error) => this.emit('incident', { runId: id, message: redact(error.message), code: 'EXECUTION_RECORDING_FAILED' }));
  }

  async change(id, action) {
    await this.records.update((data) => {
      const run = data.runs.find((entry) => entry.id === id);
      if (!run) throw new StudioError('NOT_FOUND', 'Cycle not found.', 404);
      action(run, data);
    });
    await this.publish();
  }

  async work(id, signal) {
    let timer;
    try {
      let run = (await this.records.read()).data.runs.find((entry) => entry.id === id);
      await this.repository.assertWorktree(run);
      const remaining = Date.parse(run.deadline) - Date.now();
      if (remaining <= 0) throw new StudioError('WINDOW_EXPIRED', 'The approved operating window expired; no execution was resumed.', 409);
      timer = setTimeout(() => this.executions.get(id)?.controller.abort(new StudioError('WINDOW_EXPIRED', 'The operating window expired.', 409)), remaining);
      const protectedPaths = this.verification.args.filter((arg) => !arg.startsWith('-') && !isAbsolute(arg)).map((arg) => arg.replaceAll('\\', '/'));
      for (let index = run.phase; index < stages.length; index += 1) {
        const role = stages[index];
        await this.runner.execute(role, {
          run, signal, protectedPaths,
          observe: async (type, details) => {
            await this.change(id, (current, data) => {
              if (details.sessionId) current.sessions[role] = details.sessionId;
              if (type === 'register_intake') data.demands.find((entry) => entry.id === current.demandId).custody = 'Acknowledged by VOC';
              Records.event(data, type, { runId: id, ...details });
            });
          },
          output: (actor, delta) => {
            const transient = this.transient.get(id) ?? { output: '' };
            transient.output = (transient.output + `${actor}: ${delta}`).slice(-64 * 1024);
            this.transient.set(id, transient);
            this.emit('output', { runId: id, role: actor, text: delta });
          },
          usage: (actor, usage) => {
            const transient = this.transient.get(id) ?? { output: '' };
            const previous = transient.usage ?? { inputTokens: 0, outputTokens: 0, reportedAiCredits: null, incomplete: false };
            previous.inputTokens += usage.inputTokens ?? 0;
            previous.outputTokens += usage.outputTokens ?? 0;
            if (Number.isFinite(usage.copilotUsage?.totalNanoAiu)) previous.reportedAiCredits = (previous.reportedAiCredits ?? 0) + usage.copilotUsage.totalNanoAiu / 1e9;
            else previous.incomplete = true;
            transient.usage = previous;
            this.transient.set(id, transient);
          },
        });
        signal.throwIfAborted();
        await this.change(id, (current, data) => {
          current.phase = index + 1;
          current.usage = this.transient.get(id)?.usage ?? current.usage;
          Records.event(data, 'role.completed', { runId: id, role });
        });
        run = (await this.records.read()).data.runs.find((entry) => entry.id === id);
        await this.repository.commitRecords(`Record ${role} handoff for ${run.cardId}`);
      }
      await this.repository.git(['add', '--all'], run.directory);
      const diff = await this.repository.diff(run);
      if (!diff.trim()) throw new StudioError('NO_INCREMENT', 'No product changes were produced.', 422);
      this.transient.set(id, { ...(this.transient.get(id) ?? {}), diff });
      await this.change(id, (current, data) => {
        current.status = 'review-required';
        current.diffDigest = digest(diff);
        Records.event(data, 'verification.review-required', { runId: id });
      });
      await this.repository.commitRecords(`Record review checkpoint for ${run.cardId}`);
    } catch (error) {
      await this.change(id, (run, data) => {
        const requested = this.executions.get(id)?.requestedStatus;
        if (requested) run.status = requested;
        if (!['paused', 'cancelled'].includes(run.status)) {
          run.status = 'failed';
          run.error = redact(error.message);
        }
        Records.event(data, 'run.stopped', { runId: id, status: run.status, error: redact(error.message) });
      });
      await this.repository.commitRecords(`Record stopped Studio cycle ${id}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async control(id, action) {
    identifier(id);
    const finishing = this.executions.get(id);
    if (action === 'verify' && finishing) await finishing.promise;
    const run = (await this.records.read()).data.runs.find((entry) => entry.id === id);
    if (!run) throw new StudioError('NOT_FOUND', 'Cycle not found.', 404);
    if (action === 'pause' || action === 'cancel') {
      if (!activeStatuses.includes(run.status)) throw new StudioError('INVALID_TRANSITION', 'This cycle is not active.', 409);
      if (action === 'pause' && run.status !== 'running') throw new StudioError('INVALID_TRANSITION', 'Pause only active generation. Completed generation needs review, not a new AI turn.', 409);
      const execution = this.executions.get(id);
      if (execution) {
        execution.requestedStatus = action === 'pause' ? 'paused' : 'cancelled';
        execution.controller.abort(new StudioError('INTERRUPTED', 'Execution was stopped by its owner.', 409));
      }
      await this.change(id, (current, data) => {
        current.status = action === 'pause' ? 'paused' : 'cancelled';
        Records.event(data, `run.${current.status}`, { runId: id });
      });
      if (execution) {
        try { await execution.promise; } catch (error) {
          if (error.code !== 'INTERRUPTED') throw error;
        }
      }
      await this.repository.commitRecords(`Record ${action} for Studio cycle ${id}`);
    } else if (action === 'resume') {
      if (!['paused', 'interrupted', 'review-required'].includes(run.status) || this.executions.has(id)) throw new StudioError('INVALID_TRANSITION', 'Resume only an interrupted or paused cycle.', 409);
      if (run.phase === stages.length) {
        await this.change(id, (current) => { current.status = 'review-required'; });
      } else {
        if (Date.now() >= Date.parse(run.deadline)) throw new StudioError('WINDOW_EXPIRED', 'The original operating window expired; create a newly authorized cycle.', 409);
        await this.change(id, (current) => { current.status = 'running'; });
        this.launch(id);
      }
    } else if (action === 'verify') {
      if (run.status !== 'review-required' || this.executions.has(id)) throw new StudioError('INVALID_TRANSITION', 'Inspect the generated candidate before verification.', 409);
      const diff = await this.repository.diff(run);
      if (digest(diff) !== run.diffDigest) throw new StudioError('CANDIDATE_CHANGED', 'The candidate changed since review; no verification was run.', 409);
      await this.change(id, (current) => { current.status = 'verifying'; });
      const controller = new AbortController();
      let settle;
      const execution = { controller, promise: new Promise((resolve) => { settle = resolve; }) };
      this.executions.set(id, execution);
      const timeout = setTimeout(() => controller.abort(), 120_000);
      try {
        const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'TEMP', 'TMP', 'PATHEXT'].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
        const result = await command(this.verification.command, this.verification.args, run.directory, { signal: controller.signal, env });
        controller.signal.throwIfAborted();
        if (result.code !== 0 || /^# tests 0$/m.test(result.output)) throw new StudioError('VERIFICATION_FAILED', result.output || 'The configured acceptance command failed.', 422);
        if (digest(await this.repository.diff(run)) !== run.diffDigest) throw new StudioError('CANDIDATE_CHANGED', 'Verification changed product files; review and verify again.', 409);
        const candidateHead = await this.repository.commitCandidate(run);
        controller.signal.throwIfAborted();
        await this.change(id, (current, data) => {
          current.status = 'verified';
          delete current.error;
          current.candidateHead = candidateHead;
          current.verification = { ...this.verification, exitCode: result.code, output: result.output, observedAt: new Date().toISOString() };
          Records.event(data, 'verification.passed', { runId: id, candidateHead });
        });
      } catch (error) {
        await this.change(id, (current, data) => {
          current.status = execution.requestedStatus ?? 'review-required';
          current.error = redact(error.message);
          Records.event(data, 'verification.failed', { runId: id, error: current.error });
        });
        throw error;
      } finally {
        clearTimeout(timeout);
        try {
          await this.repository.commitRecords(`Record verification for Studio cycle ${id}`);
        } finally {
          this.executions.delete(id);
          settle();
        }
      }
    } else if (action === 'accept') {
      if (run.status !== 'verified') throw new StudioError('VERIFICATION_REQUIRED', 'Only an unchanged verified candidate may be integrated.', 409);
      const head = await this.repository.accept(run);
      const integrated = await command(this.verification.command, this.verification.args, this.repository.root, {
        signal: AbortSignal.timeout(120_000),
        env: Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'TEMP', 'TMP', 'PATHEXT'].filter((key) => process.env[key]).map((key) => [key, process.env[key]])),
      });
      if (integrated.code !== 0 || /^# tests 0$/m.test(integrated.output)) {
        await this.change(id, (current, data) => {
          current.status = 'integration-failed';
          current.integratedHead = head;
          current.error = 'Integrated acceptance checks failed. The merge is preserved for explicit recovery; no completion is claimed.';
          Records.event(data, 'integration.failed', { runId: id, head, output: integrated.output });
        });
        await this.repository.commitRecords(`Record failed integration checks for ${id}`);
        throw new StudioError('INTEGRATION_FAILED', 'Integrated acceptance checks failed; inspect the preserved merge before recovery.', 422);
      }
      await this.change(id, (current, data) => {
        current.status = 'complete';
        delete current.error;
        current.integratedHead = head;
        current.integratedVerification = { exitCode: integrated.code, output: integrated.output, observedAt: new Date().toISOString() };
        data.completed.push({ id: randomUUID(), cardId: current.cardId, demandId: current.demandId, runId: id, head, verification: current.verification, time: new Date().toISOString() });
        data.demands.find((entry) => entry.id === current.demandId).disposition = 'Produced and explicitly accepted';
        Records.event(data, 'increment.accepted', { runId: id, head });
      });
      await this.repository.commitRecords(`Record completion for Studio cycle ${id}`);
    } else throw new StudioError('INVALID_TRANSITION', 'Unsupported cycle control.');
    await this.publish();
    return this.snapshot();
  }

  async feedback(input) {
    object(input, ['runId', 'response', 'notes']);
    const id = randomUUID();
    await this.records.update((data) => {
      if (!data.runs.some((run) => run.id === input.runId)) throw new StudioError('NOT_FOUND', 'Cycle not found.', 404);
      if (!['unaided', 'help-needed', 'confusing'].includes(input.response) || typeof input.notes !== 'string' || input.notes.length > 1200) {
        throw new StudioError('INVALID_INPUT', 'Choose a feedback response and supply at most 1200 characters of optional notes.');
      }
      data.demands.push({ id, runId: input.runId, response: input.response, scope: input.notes.trim(), source: 'authenticated user feedback', custody: 'Pending VOC', receivedAt: new Date().toISOString(), disposition: 'Pending' });
      Records.event(data, 'feedback.received', { demandId: id, runId: input.runId });
    });
    await this.repository.commitRecords('Record Studio feedback receipt');
    return { id, custody: 'Pending VOC', saved: true };
  }

  async close() {
    await this.factory?.close();
    for (const { controller } of this.executions.values()) controller.abort(new Error('Service is stopping.'));
    const outcomes = await Promise.allSettled([...this.executions.values()].map(({ promise }) => promise));
    try {
      await this.runner.stop();
    } finally {
      await this.records?.close();
    }
    const errors = outcomes.filter((result) => result.status === 'rejected').map((result) => result.reason);
    if (errors.length) throw new AggregateError(errors, 'Execution cleanup had recording failures; reconcile the preserved state.');
  }
}
