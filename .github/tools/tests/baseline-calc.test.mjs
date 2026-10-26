import assert from 'node:assert/strict';
import test from 'node:test';
import { computeBaseline, median, parseSamples, percentile, selectSample } from '../baseline-calc.mjs';

const minute = 60_000;
const at = (offsetMinutes) => new Date(Date.UTC(2026, 9, 1, 0, 0) + offsetMinutes * minute).toISOString();
const slice = (id, durationMinutes, extra = {}) => ({ id, start: at(0), end: at(durationMinutes), class: 'CRUD', ...extra });
const options = { statistic: 'median', unit: 'minutes' };

// ---- statistics ----

test('positive: median of an odd count is the middle value', () => assert.equal(median([1, 2, 3]), 2));
test('positive: median of an even count averages the two middle values', () => assert.equal(median([1, 2, 3, 4]), 2.5));
test('positive: nearest-rank percentile returns an observed value', () => {
  assert.equal(percentile([10, 20, 30, 40, 50], 80), 40);
  assert.equal(percentile([10, 20, 30, 40, 50], 100), 50);
  assert.equal(percentile([10, 20, 30], 1), 10);
});

// ---- proposals ----

test('positive: three CRUD slices produce a median proposal with n, range, and a decision request', () => {
  const result = computeBaseline([slice('A', 90), slice('B', 240), slice('C', 120)], { ...options, klass: 'CRUD' });
  assert.equal(result.status, 'proposed');
  assert.equal(result.value, 120);
  assert.equal(result.sampleSize, 3);
  assert.deepEqual(result.range, { min: 90, max: 240 });
  assert.match(result.authority, /Provisional/);
  assert.match(result.request, /Yes, No, or supply a replacement/);
});

test('positive: an upper percentile supports waiting and liveness deadlines', () => {
  const samples = [10, 20, 30, 40, 50].map((minutes, index) => slice(`S${index}`, minutes));
  const result = computeBaseline(samples, { statistic: 'p80', unit: 'minutes' });
  assert.equal(result.value, 40);
  assert.match(result.request, /p80/);
});

test('positive: units convert and the class filter ignores case', () => {
  const result = computeBaseline([slice('A', 120)], { statistic: 'median', unit: 'hours', klass: 'crud' });
  assert.equal(result.value, 2);
  assert.equal(result.unit, 'hours');
});

test('positive: seeded sampling is reproducible and returns the requested size', () => {
  const pool = Array.from({ length: 10 }, (_, index) => slice(`S${index}`, 30 + index));
  const one = computeBaseline(pool, { ...options, sampleSize: 3, seed: 42 });
  const two = computeBaseline(pool, { ...options, sampleSize: 3, seed: 42 });
  assert.deepEqual(one.samples, two.samples);
  assert.equal(one.sampleSize, 3);
  assert.deepEqual(one.selection, { requested: 3, seed: 42 });
});

test('positive: selecting every item returns a permutation of the pool', () => {
  assert.deepEqual(selectSample([1, 2, 3, 4, 5], 5, 7).sort(), [1, 2, 3, 4, 5]);
});

test('positive: JSON and CSV inputs parse to the same samples', () => {
  const csv = parseSamples(`id,start,end,class\nA,${at(0)},${at(30)},CRUD\n`);
  const json = parseSamples(JSON.stringify([{ id: 'A', start: at(0), end: at(30), class: 'CRUD' }]));
  assert.deepEqual(csv, json);
});

// ---- rejection and honesty ----

for (const statistic of ['p0', 'p101', 'mean', 'median2', '']) {
  test(`negative: statistic "${statistic}" is rejected`, () => {
    assert.throws(() => computeBaseline([slice('A', 1)], { statistic, unit: 'minutes' }), /statistic/);
  });
}

test('negative: an unknown unit is rejected', () => {
  assert.throws(() => computeBaseline([slice('A', 1)], { statistic: 'median', unit: 'fortnights' }), /unit/);
});

test('negative: reversed timestamps are rejected rather than clamped', () => {
  assert.throws(() => computeBaseline([{ id: 'X', start: at(10), end: at(0), class: 'CRUD' }], options), /reversed/);
});

test('negative: an unparseable timestamp is rejected and names the sample', () => {
  assert.throws(() => computeBaseline([{ id: 'BAD', start: 'yesterday-ish', end: at(0) }], options), /BAD/);
});

test('negative: a sample without an id is still reported by a placeholder label', () => {
  assert.throws(() => computeBaseline([{ start: 'x', end: 'y' }], options), /\(no id\)/);
});

test('negative: no comparable samples yields no-data and never a number', () => {
  const result = computeBaseline([], options);
  assert.equal(result.status, 'no-data');
  assert.equal(result.value, undefined);
  assert.match(result.next, /checkpoint/);
});

test('negative: a class with no matching samples yields no-data', () => {
  assert.equal(computeBaseline([slice('A', 5, { class: 'Report' })], { ...options, klass: 'CRUD' }).status, 'no-data');
});

test('negative: excluded samples are reported with their reason and never counted', () => {
  const result = computeBaseline([slice('A', 60), slice('B', 100, { exclude: 'blocked on external vendor' })], options);
  assert.equal(result.sampleSize, 1);
  assert.deepEqual(result.excluded, [{ id: 'B', reason: 'blocked on external vendor' }]);
});

test('negative: sampling without a recorded seed is rejected so the selection stays reproducible', () => {
  assert.throws(() => computeBaseline([slice('A', 1)], { ...options, sampleSize: 1 }), /seed/);
});

test('negative: requesting more samples than exist cannot invent any', () => {
  assert.equal(computeBaseline([slice('A', 5)], { ...options, sampleSize: 3, seed: 1 }).sampleSize, 1);
});

test('negative: CSV rows with missing cells yield empty values that fail validation', () => {
  const [row] = parseSamples(`id,start,end,class\nA,${at(0)}`);
  assert.equal(row.end, '');
  assert.throws(() => computeBaseline([row], options), /A/);
});
