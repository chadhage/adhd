'use strict';

class StudioClient {
  constructor({ fetchFn = globalThis.fetch.bind(globalThis) } = {}) {
    this.fetch = fetchFn;
    this.endpoint = '';
    this.token = '';
    this.connection = 'idle';
    this.state = null;
    this.review = { scope: '', budget: '30', maxSeconds: '300', write: false, verify: false, share: false, model: 'auto', factoryId: 'f1', squadId: 's1' };
    this.readiness = 'unchecked';
    this.checks = [];
    this.authorizationId = null;
    this.generation = 0;
    this.reviewGeneration = 0;
    this.streamController = null;
    this.idempotencyKey = null;
  }

  get run() { return this.preparingNew ? null : this.state?.runs.at(-1) ?? null; }
  get status() { return this.run?.status ?? 'idle'; }
  get phase() { return this.run?.phase ?? 0; }

  acceptState(state) {
    if (!state || state.version !== 1 || !Array.isArray(state.runs)
      || !state.repository || typeof state.repository.workspace !== 'string'
      || !['local', 'hosted', 'self-hosted'].includes(state.mode)) {
      throw new Error('The service returned an invalid state; no progress is inferred.');
    }
    if (state.factory && (state.factory.version !== 1 || !Array.isArray(state.factory.tasks)
      || !Array.isArray(state.factory.cycles) || !state.factory.accounting || !state.factory.mandate)) {
      throw new Error('The service returned an invalid Factory checkpoint.');
    }
    this.state = state;
    return state;
  }

  setReview(review) {
    if (JSON.stringify(review) === JSON.stringify(this.review)) return;
    this.review = { ...review };
    this.reviewGeneration += 1;
    this.readiness = 'unchecked';
    this.authorizationId = null;
  }

  reviewIssue() {
    const budget = Number(this.review.budget);
    const seconds = Number(this.review.maxSeconds);
    if (!this.review.scope.trim()) return { error: 'Describe one bounded product outcome.', field: 'demo-scope' };
    if (!Number.isFinite(budget) || budget < 30 || budget > 100) return { error: 'Choose an AI-credit limit from 30 to 100.', field: 'demo-budget' };
    if (!Number.isInteger(seconds) || seconds < 30 || seconds > 900) return { error: 'Choose an operating window from 30 to 900 seconds.', field: 'run-seconds' };
    if (!this.review.write || !this.review.verify || !this.review.share) return { error: 'Review and authorize scoped provider access, writes, and verification.', field: 'demo-write' };
    return null;
  }

  async request(path, { method = 'GET', body, signal } = {}) {
    const generation = this.generation;
    const response = await this.fetch(`${this.endpoint}${path}`, {
      method, headers: { Authorization: `Bearer ${this.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal, redirect: 'error', credentials: 'omit',
    });
    const result = await response.json();
    if (generation !== this.generation) throw new Error('The service connection changed while the request was running. Its result was not applied; reconnect to verify the operation before retrying.');
    if (!response.ok) throw new Error(result.error?.message ?? `Service request failed (HTTP ${response.status}).`);
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('The service returned an invalid response.');
    return result;
  }

  async connect(endpoint, token, mode) {
    const url = new URL(endpoint);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/'
      || !['http:', 'https:'].includes(url.protocol)
      || (url.protocol !== 'https:' && (mode !== 'local' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
      throw new Error('Use a trusted HTTPS service origin, or HTTP loopback for local mode. No URL credentials, paths, queries, or fragments.');
    }
    if (!token || token.length < 32) throw new Error('Enter the service owner-issued access token.');
    this.disconnect();
    this.endpoint = url.origin;
    this.token = token;
    const generation = this.generation;
    this.connection = 'checking';
    try {
      const state = await this.request('/api/state');
      if (generation !== this.generation) return false;
      if (state.version !== 1 || !Array.isArray(state.runs) || !state.repository || state.mode !== mode) throw new Error('The service protocol or hosting mode does not match your selection.');
      const runtime = await this.request('/api/runtime');
      if (generation !== this.generation) return false;
      if (!Array.isArray(runtime.models)) throw new Error('The service did not report a valid model catalog.');
      this.acceptState(state);
      this.runtime = runtime;
      this.connection = 'connected';
      return true;
    } catch (error) {
      if (generation !== this.generation) return false;
      this.connection = 'failed';
      this.token = '';
      throw error;
    }
  }

  disconnect() {
    this.generation += 1;
    this.streamController?.abort();
    this.streamController = null;
    this.token = '';
    this.state = null;
    this.runtime = null;
    this.connection = 'idle';
    this.readiness = 'unchecked';
    this.authorizationId = null;
    this.preparingNew = false;
  }

  async saveBlueprint(blueprint) {
    this.acceptState(await this.request('/api/blueprint', { method: 'PUT', body: { blueprint, revision: this.state.revision } }));
    this.readiness = 'unchecked';
    return this.state;
  }

  async check() {
    const issue = this.reviewIssue();
    if (issue) throw new Error(issue.error);
    if (!this.state?.blueprint) throw new Error('Save the blueprint to the connected product repository first.');
    this.readiness = 'checking';
    const generation = this.generation;
    const reviewGeneration = this.reviewGeneration;
    try {
      const bytes = new TextEncoder().encode(JSON.stringify(this.state.blueprint));
      const hash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))).map((byte) => byte.toString(16).padStart(2, '0')).join('');
      const result = await this.request('/api/readiness', { method: 'POST', body: { review: this.review, blueprintDigest: hash } });
      if (generation !== this.generation || reviewGeneration !== this.reviewGeneration) throw new Error('Scope or connection changed while checks were running. Recheck the current request.');
      if (!Array.isArray(result.checks) || typeof result.ready !== 'boolean') throw new Error('Invalid readiness response.');
      this.checks = result.checks;
      this.authorizationId = result.authorizationId;
      this.runtime = result.runtime;
      this.readiness = result.ready ? 'ready' : 'blocked';
      return result;
    } catch (error) {
      if (generation === this.generation && reviewGeneration === this.reviewGeneration) this.readiness = 'blocked';
      throw error;
    }
  }

  async start() {
    if (this.readiness !== 'ready' || !this.authorizationId) throw new Error('Pass current readiness checks before starting.');
    this.idempotencyKey ??= globalThis.crypto.randomUUID();
    this.acceptState(await this.request('/api/runs', { method: 'POST', body: { authorizationId: this.authorizationId, idempotencyKey: this.idempotencyKey } }));
    this.preparingNew = false;
    return this.state;
  }

  async control(action) {
    if (!this.run) throw new Error('No connected cycle is available.');
    this.acceptState(await this.request(`/api/runs/${this.run.id}/${action}`, { method: 'POST', body: {} }));
    return this.state;
  }

  async feedback(response, notes) {
    return this.request('/api/feedback', { method: 'POST', body: { runId: this.run?.id, response, notes } });
  }

  async authorizeFactory(mandate) {
    this.acceptState(await this.request('/api/factory/authorize', { method: 'POST', body: { mandate, revision: this.state.revision } }));
    return this.state;
  }

  async factoryControl(action) {
    if (!['start', 'resume', 'pause', 'revoke'].includes(action)) throw new Error('Unsupported Factory control.');
    this.acceptState(await this.request(`/api/factory/${action}`, { method: 'POST', body: {} }));
    return this.state;
  }

  async factoryPackage(image, verification) {
    const result = await this.request('/api/factory/package', { method: 'POST', body: { image, verification, revision: this.state.revision } });
    if (!result.package?.files || typeof result.package.digest !== 'string' || result.saved !== true) throw new Error('The service did not return a durably saved deployment package.');
    this.acceptState(result.state);
    return result.package;
  }

  async factoryMandate() {
    return this.request('/api/factory/mandate');
  }

  async stream(onState, onOutput, onError) {
    this.streamController?.abort();
    const controller = new AbortController();
    this.streamController = controller;
    const generation = this.generation;
    try {
      const response = await this.fetch(`${this.endpoint}/api/events`, { headers: { Authorization: `Bearer ${this.token}` }, signal: controller.signal, redirect: 'error', credentials: 'omit' });
      if (!response.ok || !response.body) throw new Error(`Live stream failed (HTTP ${response.status}).`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!controller.signal.aborted && generation === this.generation) {
        const { value, done } = await reader.read();
        if (controller.signal.aborted || generation !== this.generation) break;
        if (done) throw new Error('Live connection closed. Last known state is retained; reconnect to verify current progress.');
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > 4 * 1024 * 1024) throw new Error('The live stream exceeded its message limit.');
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const message = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const event = /^event: (.+)$/m.exec(message)?.[1];
          const data = /^data: (.+)$/m.exec(message)?.[1];
          if (!data) continue;
          const parsed = JSON.parse(data);
          if (event === 'state') {
            if (parsed.version !== 1 || !Array.isArray(parsed.runs)) throw new Error('Invalid live state.');
            this.acceptState(parsed);
            onState(parsed);
          } else if (event === 'output') onOutput(parsed);
          else if (event === 'factory-event') {
            const factory = this.state?.factory;
            if (!factory || parsed.factoryId !== factory.id) continue;
            const task = factory.tasks.find((entry) => entry.id === parsed.assignmentId);
            if (task) {
              task.lastProgressAt = parsed.time;
              if (parsed.type === 'factory.session.started') task.sessionId = parsed.sessionId;
              if (parsed.type === 'factory.assignment.accepted') task.acceptedAt = parsed.time;
            }
            onState(this.state);
          }
          else if (event === 'incident') throw new Error(parsed.message);
        }
      }
    } catch (error) {
      if (!controller.signal.aborted && generation === this.generation) onError(error);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { StudioClient };
