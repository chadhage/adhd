import assert from 'node:assert/strict';
import test from 'node:test';
import demoModule from '../../../prototype/demo.js';

const { ActivationDemo } = demoModule;
const review = { scope: 'A synthetic first increment', budget: '5', write: true, verify: true };

function connected(scenario = 'happy') {
  const demo = new ActivationDemo();
  demo.bind('synthetic-blueprint');
  demo.setRepository('https://example.invalid/demo/product');
  demo.setReview(review);
  demo.setScenario(scenario);
  const attempt = demo.beginConnection();
  demo.finishConnection(attempt.token);
  return demo;
}

function ready(scenario = 'happy') {
  const demo = connected(scenario);
  const checks = demo.beginChecks();
  demo.finishChecks(checks.token);
  return demo;
}

test('positive: the bounded simulated cycle records completion only after all four stages', () => {
  const demo = ready();
  const run = demo.start();
  for (let phase = 1; phase <= 4; phase += 1) {
    const result = demo.advance(run.token);
    assert.equal(result.complete, phase === 4);
    assert.equal(demo.phase, phase);
  }
  assert.equal(demo.status, 'complete');
  assert.equal(demo.runNumber, 1);
});

test('positive: pause and resume keep completed stages without replaying them', () => {
  const demo = ready();
  const run = demo.start();
  demo.advance(run.token);
  demo.advance(run.token);
  demo.pause();
  const resumed = demo.resume();
  demo.advance(resumed.token);
  assert.equal(demo.phase, 3);
  demo.advance(resumed.token);
  assert.equal(demo.status, 'complete');
  assert.equal(demo.runNumber, 1);
});

test('negative: incomplete connection, insufficient budget, or missing permissions cannot pass readiness', () => {
  const unconnected = new ActivationDemo();
  assert.equal(unconnected.beginChecks().ok, false);
  for (const change of [{ budget: '0.50' }, { write: false }, { verify: false }, { scope: '' }, { budget: '' }, { budget: 'Infinity' }]) {
    const demo = connected();
    demo.setReview({ ...review, ...change });
    const attempt = demo.beginChecks();
    if (attempt.ok) assert.equal(demo.finishChecks(attempt.token).ok, false);
    assert.equal(demo.start().ok, false);
    assert.notEqual(demo.readiness, 'ready');
  }
});

test('negative: unsafe or credential-bearing repository references cannot begin a demo connection', () => {
  for (const repository of ['javascript:alert(1)', 'http://example.invalid/demo', 'not a URL', 'https://user:password@example.invalid/demo', 'https://example.invalid/demo?token=private', 'https://example.invalid/demo#secret']) {
    const demo = new ActivationDemo();
    demo.setRepository(repository);
    assert.equal(demo.beginConnection().ok, false);
    assert.equal(demo.connection, 'idle');
  }
});

test('negative: duplicate starts cannot create another run or reset the current cursor', () => {
  const demo = ready();
  const run = demo.start();
  demo.advance(run.token);
  assert.equal(demo.start().ok, false);
  assert.equal(demo.runNumber, 1);
  assert.equal(demo.phase, 1);
  assert.equal(demo.advance(run.token).ok, true);
});

test('negative: changed repository, review, or blueprint rejects stale callbacks and old readiness', () => {
  const connection = connected();
  const attempt = connection.beginConnection();
  connection.setRepository('https://example.invalid/other');
  assert.equal(connection.finishConnection(attempt.token).stale, true);
  assert.equal(connection.connection, 'idle');
  const checks = connected();
  const check = checks.beginChecks();
  checks.setReview({ ...review, budget: '0' });
  assert.equal(checks.finishChecks(check.token).stale, true);
  const demo = ready();
  const run = demo.start();
  demo.bind('changed-blueprint');
  assert.equal(demo.advance(run.token).stale, true);
  assert.equal(demo.start().ok, false);
  assert.equal(demo.phase, 0);
});

test('negative: paused or cancelled timers cannot advance an unfinished cycle', () => {
  for (const stop of ['pause', 'cancel']) {
    const demo = ready();
    const run = demo.start();
    demo.advance(run.token);
    demo[stop]();
    assert.equal(demo.advance(run.token).stale, true);
    assert.equal(demo.phase, 1);
    assert.notEqual(demo.status, 'complete');
  }
});

test('negative: injected connection and readiness failures remain blocked until explicit recovery', () => {
  const connection = connected('connection-failure');
  assert.equal(connection.connection, 'failed');
  assert.equal(connection.start().ok, false);
  const retry = connection.beginConnection();
  assert.equal(connection.finishConnection(retry.token).ok, true);
  const gap = ready('readiness-gap');
  assert.equal(gap.readiness, 'blocked');
  assert.equal(gap.start().ok, false);
  gap.restoreCapability();
  assert.equal(gap.start().ok, false);
  const checks = gap.beginChecks();
  assert.equal(gap.finishChecks(checks.token).ok, true);
});

test('negative: a failed verification cannot become completion or advance past failure', () => {
  const demo = ready('verification-failure');
  const run = demo.start();
  for (let i = 0; i < 3; i += 1) demo.advance(run.token);
  assert.equal(demo.advance(run.token).ok, false);
  assert.equal(demo.status, 'failed');
  assert.equal(demo.phase, 3);
  assert.equal(demo.advance(run.token).stale, true);
});

test('negative: injected interruption preserves a real demo cursor instead of finishing silently', () => {
  const demo = ready('interruption');
  const run = demo.start();
  demo.advance(run.token);
  assert.equal(demo.advance(run.token).paused, true);
  assert.equal(demo.phase, 2);
  assert.equal(demo.advance(run.token).stale, true);
  const resumed = demo.resume();
  demo.advance(resumed.token);
  demo.advance(resumed.token);
  assert.equal(demo.status, 'complete');
});

test('negative: edited pending connections cannot stay stuck and active cycles cannot be overwritten by checks or replay', () => {
  const connection = new ActivationDemo();
  connection.setRepository('https://example.invalid/demo');
  const pending = connection.beginConnection();
  connection.setReview(review);
  assert.equal(connection.connection, 'idle');
  assert.equal(connection.finishConnection(pending.token).stale, true);
  const demo = ready();
  const run = demo.start();
  demo.advance(run.token);
  assert.equal(demo.beginChecks().ok, false);
  assert.equal(demo.replay().ok, false);
  assert.equal(demo.phase, 1);
  assert.equal(demo.status, 'running');
});
