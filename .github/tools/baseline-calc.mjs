import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

const unitMs = { ms: 1, seconds: 1000, minutes: 60_000, hours: 3_600_000, days: 86_400_000 };

export function parseSamples(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('[')) return JSON.parse(trimmed);
  const [header, ...rows] = trimmed.split(/\r?\n/).filter((line) => line.trim() !== '');
  const columns = header.split(',').map((column) => column.trim());
  return rows.map((row) => {
    const cells = row.split(',').map((cell) => cell.trim());
    return Object.fromEntries(columns.map((column, index) => [column, cells[index] ?? '']));
  });
}

export function median(sorted) {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Nearest-rank percentile: the smallest observed value covering p percent of samples. */
export function percentile(sorted, p) {
  return sorted[Math.max(1, Math.ceil((p / 100) * sorted.length)) - 1];
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded Fisher-Yates selection so a recorded seed reproduces the sample. */
export function selectSample(items, count, seed) {
  const random = mulberry32(seed);
  const pool = [...items];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  return pool.slice(0, count);
}

function statisticOf(name, sorted) {
  if (name === 'median') return median(sorted);
  const match = /^p(\d{1,3})$/.exec(name);
  if (match && Number(match[1]) >= 1 && Number(match[1]) <= 100) return percentile(sorted, Number(match[1]));
  throw new Error('statistic must be median or pNN (1-100)');
}

/**
 * Builds an owner-facing baseline proposal from observed samples.
 * The result is provisional until a human confirms or replaces it.
 */
export function computeBaseline(samples, { statistic, unit, klass, sampleSize, seed, term = 'cycle time' }) {
  if (!(unit in unitMs)) throw new Error(`unit must be one of ${Object.keys(unitMs).join(', ')}`);
  const problems = [];
  const excluded = [];
  let eligible = [];

  for (const sample of samples) {
    const label = sample.id ?? '(no id)';
    if (klass && String(sample.class ?? '').toLowerCase() !== klass.toLowerCase()) continue;
    if (sample.exclude) {
      excluded.push({ id: label, reason: String(sample.exclude) });
      continue;
    }
    const start = Date.parse(sample.start);
    const end = Date.parse(sample.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      problems.push(`${label}: invalid or reversed timestamps`);
      continue;
    }
    eligible.push({ id: label, durationMs: end - start });
  }
  if (problems.length) throw new Error(`Invalid samples: ${problems.join('; ')}`);

  if (sampleSize !== undefined) {
    if (seed === undefined) throw new Error('seed is required with sampleSize so the selection is reproducible');
    eligible = selectSample(eligible, sampleSize, seed);
  }

  const base = {
    term,
    class: klass ?? null,
    statistic,
    unit,
    status: eligible.length ? 'proposed' : 'no-data',
    authority: 'Provisional until the human owner confirms or replaces it; grants no authority, WIP, budget, or scope.',
    sampleSize: eligible.length,
    selection: sampleSize !== undefined ? { requested: sampleSize, seed } : { method: 'all eligible samples' },
    excluded,
  };
  if (!eligible.length) {
    return {
      ...base,
      next: 'No comparable samples. Instrument the first bounded authorized work to record start and end events; escalate at the next handoff or cycle checkpoint, not at a timer.',
    };
  }

  const sorted = eligible.map((sample) => sample.durationMs).sort((a, b) => a - b);
  const convert = (ms) => Math.round((ms / unitMs[unit]) * 1000) / 1000;
  const value = convert(statisticOf(statistic, sorted));
  return {
    ...base,
    value,
    range: { min: convert(sorted[0]), max: convert(sorted.at(-1)) },
    samples: eligible.map((sample) => ({ id: sample.id, duration: convert(sample.durationMs) })),
    request: `Confirm ${statistic} ${term}${klass ? ` for ${klass}` : ''} = ${value} ${unit} (n=${eligible.length}, range ${convert(sorted[0])}-${convert(sorted.at(-1))} ${unit})? Reply Yes, No, or supply a replacement value.`,
  };
}

async function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      input: { type: 'string' },
      statistic: { type: 'string' },
      unit: { type: 'string' },
      class: { type: 'string' },
      sample: { type: 'string' },
      seed: { type: 'string' },
      term: { type: 'string' },
    },
  });
  for (const required of ['input', 'statistic', 'unit']) {
    if (!values[required]) throw new Error(`--${required} is required`);
  }
  const samples = parseSamples(await readFile(resolve(values.input), 'utf8'));
  return computeBaseline(samples, {
    statistic: values.statistic,
    unit: values.unit,
    klass: values.class,
    sampleSize: values.sample === undefined ? undefined : Number(values.sample),
    seed: values.seed === undefined ? undefined : Number(values.seed),
    term: values.term,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(await main(process.argv.slice(2)), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
