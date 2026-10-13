import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateQuality, parseTap } from '../lib/test-report.mjs';

const policy = { threshold: 85, minNegativePerPositive: 2 };
const tap = (lines) => lines.join('\n');
const goodTests = ['ok 1 - positive: a', 'ok 2 - negative: b', 'ok 3 - negative: c'];
const goodCoverage = ['# file | line % | branch % | funcs % | uncovered lines', '#   tool.mjs | 90.00 | 86.00 | 100.00 | 1-2'];
const verdict = (lines) => evaluateQuality(parseTap(tap(lines)), policy);

// ---- parsing ----

test('positive: top-level test lines and coverage rows are parsed', () => {
  const parsed = parseTap(tap([...goodTests, ...goodCoverage]));
  assert.equal(parsed.tests.length, 3);
  assert.deepEqual(parsed.coverage, [{ file: 'tool.mjs', lines: 90, branches: 86, functions: 100 }]);
});

test('positive: a failing test line is parsed as not ok', () => {
  assert.equal(parseTap('not ok 4 - negative: broken').tests[0].ok, false);
});

test('negative: indented subtests are not counted as top-level tests', () => {
  assert.equal(parseTap('    ok 1 - positive: nested\nok 2 - positive: top').tests.length, 1);
});

test('negative: coverage rows for test files are ignored', () => {
  assert.deepEqual(parseTap('#   thing.test.mjs | 100 | 100 | 100 |').coverage, []);
});

test('negative: unrelated output lines are ignored', () => {
  const parsed = parseTap('# Subtest: x\n  ---\n  duration_ms: 1\n  ...\nTAP version 13');
  assert.deepEqual(parsed, { tests: [], coverage: [] });
});

test('negative: skipped and TODO tests are flagged', () => {
  const parsed = parseTap('ok 1 - positive: later # SKIP not now\nok 2 - negative: wip # TODO');
  assert.deepEqual(parsed.tests.map((test) => test.skipped), [true, true]);
});

// ---- policy ----

test('positive: all tests passing, classified, 2:1 negative, and covered passes the gate', () => {
  const result = verdict([...goodTests, ...goodCoverage]);
  assert.equal(result.ok, true, result.violations.join('; '));
  assert.deepEqual(result.stats, { total: 3, passed: 3, failed: 0, positive: 1, negative: 2, ratio: 2 });
});

test('positive: more than two negatives per positive also passes', () => {
  assert.equal(verdict(['ok 1 - positive: a', 'ok 2 - negative: b', 'ok 3 - negative: c', 'ok 4 - negative: d', ...goodCoverage]).ok, true);
});

test('negative: a failing test fails the gate and is named', () => {
  const result = verdict(['ok 1 - positive: a', 'not ok 2 - negative: b', 'ok 3 - negative: c', ...goodCoverage]);
  assert.equal(result.ok, false);
  assert.ok(result.violations.includes('Failing test: negative: b'));
});

test('negative: a skipped test fails the gate', () => {
  assert.ok(verdict([...goodTests, 'ok 4 - negative: d # SKIP', ...goodCoverage]).violations.some((v) => v.startsWith('Skipped test')));
});

test('negative: an unclassified test fails the gate', () => {
  const result = verdict([...goodTests, 'ok 4 - plain title', ...goodCoverage]);
  assert.ok(result.violations.some((v) => v.startsWith('Unclassified test')));
});

test('negative: fewer than two negatives per positive fails and states the shortfall', () => {
  const result = verdict(['ok 1 - positive: a', 'ok 2 - positive: b', 'ok 3 - negative: c', ...goodCoverage]);
  assert.ok(result.violations.some((v) => /Negative tests \(1\) must be at least 2x positive tests \(2\); need 4/.test(v)));
});

test('negative: exactly one negative per positive is not enough', () => {
  assert.equal(verdict(['ok 1 - positive: a', 'ok 2 - negative: b', ...goodCoverage]).ok, false);
});

for (const metric of ['lines', 'branches', 'functions']) {
  test(`negative: ${metric} coverage just below the threshold fails the gate`, () => {
    const row = { lines: 90, branches: 90, functions: 90, [metric]: 84.99 };
    const result = verdict([...goodTests, `#   tool.mjs | ${row.lines} | ${row.branches} | ${row.functions} |`]);
    assert.ok(result.violations.some((v) => v.includes(metric)), result.violations.join('; '));
  });
}

test('negative: coverage exactly at the threshold passes', () => {
  assert.equal(verdict([...goodTests, '#   tool.mjs | 85 | 85 | 85 |']).ok, true);
});

test('negative: no tests and no coverage rows are both violations', () => {
  const result = verdict([]);
  assert.ok(result.violations.includes('No tests were reported.'));
  assert.ok(result.violations.includes('No coverage rows were reported.'));
});

test('negative: with no positive tests the ratio is not reported', () => {
  assert.equal(verdict(['ok 1 - negative: only', ...goodCoverage]).stats.ratio, null);
});
