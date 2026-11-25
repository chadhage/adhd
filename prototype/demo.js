'use strict';

class ActivationDemo {
  constructor() {
    this.generation = 0;
    this.runNumber = 0;
    this.binding = null;
    this.reset('');
  }

  reset(binding) {
    this.generation += 1;
    this.binding = binding;
    this.repository = '';
    this.connection = 'idle';
    this.connectionAttempts = 0;
    this.review = { scope: '', budget: '5', write: true, verify: true };
    this.scenario = 'happy';
    this.capabilityRestored = false;
    this.readiness = 'unchecked';
    this.checks = [];
    this.status = 'idle';
    this.phase = 0;
    this.interruptionUsed = false;
  }

  bind(binding) {
    if (binding === this.binding) return false;
    this.reset(binding);
    return true;
  }

  invalidateChecks() {
    this.generation += 1;
    if (this.connection === 'checking') this.connection = 'idle';
    this.readiness = 'unchecked';
    this.checks = [];
    this.status = 'idle';
    this.phase = 0;
    this.interruptionUsed = false;
  }

  setRepository(repository) {
    if (repository === this.repository) return;
    this.repository = repository;
    this.connection = 'idle';
    this.connectionAttempts = 0;
    this.invalidateChecks();
  }

  setReview(review) {
    if (JSON.stringify(review) === JSON.stringify(this.review)) return;
    this.review = { ...review };
    this.invalidateChecks();
  }

  setScenario(scenario) {
    if (!['happy', 'connection-failure', 'readiness-gap', 'interruption', 'verification-failure'].includes(scenario)) {
      return { ok: false, error: 'Choose one of the available demo scenarios.' };
    }
    if (scenario !== this.scenario) {
      this.scenario = scenario;
      this.capabilityRestored = false;
      this.connection = 'idle';
      this.connectionAttempts = 0;
      this.invalidateChecks();
    }
    return { ok: true };
  }

  reviewIssue() {
    if (typeof this.review.scope !== 'string' || !this.review.scope.trim()) {
      return { error: 'Describe one small outcome for this simulated cycle.', field: 'demo-scope' };
    }
    const budget = Number(this.review.budget);
    if (typeof this.review.budget !== 'string' || !this.review.budget.trim() || !Number.isFinite(budget) || budget < 0 || budget > 10000) {
      return { error: 'Use a sample budget between 0 and 10,000. No money is charged.', field: 'demo-budget' };
    }
    return null;
  }

  beginConnection() {
    if (this.connection === 'checking') return { ok: false, error: 'The simulated connection is already being checked.' };
    let url;
    try {
      url = new URL(this.repository);
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      return { ok: false, error: 'Use a complete HTTPS demo repository reference, or use the sample.', field: 'demo-repository' };
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      return { ok: false, error: 'Use an HTTPS reference without credentials, query parameters, or a fragment. Nothing is fetched.', field: 'demo-repository' };
    }
    this.invalidateChecks();
    this.connection = 'checking';
    this.connectionAttempts += 1;
    return { ok: true, token: this.generation };
  }

  finishConnection(token) {
    if (token !== this.generation || this.connection !== 'checking') return { ok: false, stale: true };
    if (this.scenario === 'connection-failure' && this.connectionAttempts === 1) {
      this.connection = 'failed';
      return { ok: false, error: 'Injected demo connection failure. The sample service recovers on your next explicit retry; no real service was contacted.' };
    }
    this.connection = 'connected';
    return { ok: true };
  }

  beginChecks() {
    if (this.connection !== 'connected') return { ok: false, error: 'Complete the simulated connection first.' };
    if (this.status !== 'idle') return { ok: false, error: 'Return to the existing demo cycle, or explicitly replay it before new checks.' };
    const issue = this.reviewIssue();
    if (issue) return { ok: false, ...issue };
    if (this.readiness === 'checking') return { ok: false, error: 'The simulated checks are already running.' };
    this.invalidateChecks();
    this.readiness = 'checking';
    return { ok: true, token: this.generation };
  }

  finishChecks(token) {
    if (token !== this.generation || this.readiness !== 'checking') return { ok: false, stale: true };
    const gap = this.scenario === 'readiness-gap' && !this.capabilityRestored;
    this.checks = [
      { title: 'Repository and runtime', ok: this.connection === 'connected', note: 'Simulated link only. No account, network, or Git access was verified.' },
      { title: 'One bounded outcome', ok: !this.reviewIssue(), note: 'One sample cycle; no production deployment or future-cycle authority.' },
      { title: 'Demo permissions and capability', ok: this.review.write === true && this.review.verify === true && !gap, note: gap ? 'Injected missing verification capability. Restore the demo capability and retry.' : 'Both sample permissions are needed. These checkboxes do not change host permissions.' },
      { title: 'Sample budget', ok: Number(this.review.budget) >= 1, note: 'Scripted example estimate: $1.00. Not provider pricing; actual charge: none.' },
      { title: 'Current blueprint', ok: typeof this.binding === 'string' && this.binding.length > 0, note: 'Current page-only plan is bound. Real concurrency, readiness, and quality are unverified.' },
    ];
    this.readiness = this.checks.every((check) => check.ok) ? 'ready' : 'blocked';
    return { ok: this.readiness === 'ready', checks: this.checks };
  }

  restoreCapability() {
    this.capabilityRestored = true;
    this.invalidateChecks();
  }

  start() {
    if (this.readiness !== 'ready') return { ok: false, error: 'Pass the current simulated readiness checks before starting.' };
    if (this.status !== 'idle') return { ok: false, error: 'This demo cycle already started. Resume it or explicitly replay the demo.' };
    this.generation += 1;
    this.runNumber += 1;
    this.status = 'running';
    return { ok: true, token: this.generation };
  }

  advance(token) {
    if (token !== this.generation || this.status !== 'running') return { ok: false, stale: true };
    if (this.phase === 3 && this.scenario === 'verification-failure') {
      this.status = 'failed';
      this.generation += 1;
      return { ok: false, error: 'Scripted acceptance verification failed. No demo completion is recorded.' };
    }
    this.phase += 1;
    if (this.phase === 2 && this.scenario === 'interruption' && !this.interruptionUsed) {
      this.interruptionUsed = true;
      this.pause();
      return { ok: true, paused: true };
    }
    if (this.phase === 4) this.status = 'complete';
    return { ok: true, complete: this.status === 'complete' };
  }

  pause() {
    if (this.status !== 'running') return { ok: false, error: 'Only a running demo cycle can be paused.' };
    this.generation += 1;
    this.status = 'paused';
    return { ok: true };
  }

  resume() {
    if (this.status !== 'paused' || this.readiness !== 'ready') return { ok: false, error: 'Resume needs a paused demo and unchanged, passing checks.' };
    this.generation += 1;
    this.status = 'running';
    return { ok: true, token: this.generation };
  }

  cancel() {
    if (!['running', 'paused'].includes(this.status)) return { ok: false, error: 'There is no active demo cycle to end.' };
    this.generation += 1;
    this.status = 'cancelled';
    return { ok: true };
  }

  interruptPending() {
    if (this.connection === 'checking') this.connection = 'idle';
    if (this.readiness === 'checking') this.readiness = 'unchecked';
    this.generation += 1;
  }

  replay() {
    if (['running', 'paused'].includes(this.status)) return { ok: false, error: 'End the current demo before replaying it.' };
    this.generation += 1;
    this.status = 'idle';
    this.phase = 0;
    this.interruptionUsed = false;
    return { ok: true };
  }
}

// Classic browser script; the existing Node runner tests the same state machine.
if (typeof module !== 'undefined' && module.exports) module.exports = { ActivationDemo };
