const testLine = /^(not ok|ok) \d+ - (.+?)(?:\s+#\s*(SKIP|TODO)\b.*)?$/;
const coverageLine = /^#\s+([\w.-]+\.mjs)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|/;
const classifiedTitle = /^(positive|negative): /;

export function failureDiagnostics(text) {
  return [...text.matchAll(/^not ok \d+ - [^\r\n]*\r?\n  ---\r?\n[\s\S]*?\r?\n  \.\.\.(?=\r?$)/gm)]
    .map(([block]) => block);
}

/**
 * Parses Node's TAP reporter output. Only top-level test lines are counted;
 * subtests are indented and ignored. Test files themselves are not coverage targets.
 */
export function parseTap(text) {
  const tests = [];
  const coverage = [];
  for (const line of text.split(/\r?\n/)) {
    const test = testLine.exec(line);
    if (test) {
      tests.push({ ok: test[1] === 'ok', title: test[2], skipped: Boolean(test[3]) });
      continue;
    }
    const cover = coverageLine.exec(line);
    if (cover && !cover[1].endsWith('.test.mjs')) {
      coverage.push({ file: cover[1], lines: Number(cover[2]), branches: Number(cover[3]), functions: Number(cover[4]) });
    }
  }
  return { tests, coverage };
}

/**
 * Evaluates the quality policy: every test passes and is classified, negative tests
 * are at least `minNegativePerPositive` times the positive tests, and every
 * measured source file meets the coverage threshold on lines, branches, and functions.
 */
export function evaluateQuality({ tests, coverage }, { threshold, minNegativePerPositive }) {
  const violations = [];
  const positive = tests.filter((test) => test.title.startsWith('positive: ')).length;
  const negative = tests.filter((test) => test.title.startsWith('negative: ')).length;
  const unclassified = tests.filter((test) => !classifiedTitle.test(test.title));
  const failed = tests.filter((test) => !test.ok);
  const skipped = tests.filter((test) => test.skipped);

  if (!tests.length) violations.push('No tests were reported.');
  for (const test of failed) violations.push(`Failing test: ${test.title}`);
  for (const test of skipped) violations.push(`Skipped test: ${test.title}`);
  for (const test of unclassified) violations.push(`Unclassified test (needs a "positive: " or "negative: " prefix): ${test.title}`);
  if (negative < minNegativePerPositive * positive) {
    violations.push(`Negative tests (${negative}) must be at least ${minNegativePerPositive}x positive tests (${positive}); need ${minNegativePerPositive * positive}.`);
  }
  if (!coverage.length) violations.push('No coverage rows were reported.');
  for (const row of coverage) {
    for (const metric of ['lines', 'branches', 'functions']) {
      if (row[metric] < threshold) violations.push(`${row.file}: ${metric} coverage ${row[metric]}% is below ${threshold}%.`);
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    stats: { total: tests.length, passed: tests.length - failed.length, failed: failed.length, positive, negative, ratio: positive ? Number((negative / positive).toFixed(2)) : null },
  };
}
