import assert from 'node:assert/strict';
import test from 'node:test';
import { computeBaseline, median, parseSamples, percentile, selectSample } from '../baseline-calc.mjs';

const minute = 60_000;
const at = (offsetMinutes) => new Date(Date.UTC(2026, 9, 1, 0, 0) + offsetMinutes * minute).toISOString();
const slice = (id, durationMinutes, extra = {}) => ({ id, start: at(0), end: at(durationMinutes), class: 'CRUD', ...extra });

test('median and nearest-rank percentile follow their definitions', () => {
  assert.equal(median([1, 2, 3]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(percentile([10, 20, 30, 40, 50], 80), 40);
  assert.equal(percentile([10, 20, 30, 40, 50], 100), 50);
  assert.equal(percentile([10, 20, 30], 1), 10);
});

test('three CRUD slices produce a median proposal with range, n, and a decision request', () => {
  const result = computeBaseline([slice('A', 90), slice('B', 240), slice('C', 120)], {
    statistic: 'median',
    unit: 'minutes',
    klass: 'CRUD',
  });
  assert.equal(result.status, 'proposed');
  assert.equal(result.value, 120);
  assert.equal(result.sampleSize, 3);
  assert.deepEqual(result.range, { min: 90, max: 240 });
  assert.match(result.authority, /Provisional/);
  assert.match(result.request, /Yes, No, or supply a replacement/);
});

test('class filter, explicit exclusions, and invalid timestamps are handled honestly', () => {
  const samples = [slice('A', 60), slice('B', 100, { exclude: 'blocked on external vendor' }), { id: 'Z', start: at(0), end: at(5), class: 'Report' }];
  const result = computeBaseline(samples, { statistic: 'median', unit: 'minutes', klass: 'crud' });
  assert.equal(result.sampleSize, 1);
  assert.deepEqual(result.excluded, [{ id: 'B', reason: 'blocked on external vendor' }]);

  assert.throws(() => computeBaseline([{ id: 'X', start: at(10), end: at(0), class: 'CRUD' }], { statistic: 'median', unit: 'minutes' }), /reversed/);
  assert.throws(() => computeBaseline([slice('A', 1)], { statistic: 'p0', unit: 'minutes' }), /statistic/);
  assert.throws(() => computeBaseline([slice('A', 1)], { statistic: 'median', unit: 'fortnights' }), /unit/);
});

test('no comparable samples yields no-data and a checkpoint-based next step, never a number', () => {
  const result = computeBaseline([], { statistic: 'median', unit: 'minutes' });
  assert.equal(result.status, 'no-data');
  assert.equal(result.value, undefined);
  assert.match(result.next, /checkpoint/);
});

test('seeded sampling is reproducible and requires a recorded seed', () => {
  const pool = Array.from({ length: 10 }, (_, index) => slice(`S${index}`, 30 + index));
  const one = computeBaseline(pool, { statistic: 'median', unit: 'minutes', sampleSize: 3, seed: 42 });
  const two = computeBaseline(pool, { statistic: 'median', unit: 'minutes', sampleSize: 3, seed: 42 });
  assert.deepEqual(one.samples, two.samples);
  assert.equal(one.sampleSize, 3);
  assert.deepEqual(selectSample([1, 2, 3, 4, 5], 5, 7).sort(), [1, 2, 3, 4, 5]);
  assert.throws(() => computeBaseline(pool, { statistic: 'median', unit: 'minutes', sampleSize: 3 }), /seed/);
});

test('JSON and CSV inputs parse to the same samples', () => {
  const csv = parseSamples(`id,start,end,class\nA,${at(0)},${at(30)},CRUD\n`);
  const json = parseSamples(JSON.stringify([{ id: 'A', start: at(0), end: at(30), class: 'CRUD' }]));
  assert.deepEqual(csv, json);
});
