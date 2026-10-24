import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateQuality, parseTap } from './lib/test-report.mjs';

// Owner-specified quality policy.
const policy = { threshold: 85, minNegativePerPositive: 2 };

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const testDirectories = ['.github/tools/tests', '.github/hooks/tests'];

function findTests(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return findTests(path);
    return name.endsWith('.test.mjs') ? [path] : [];
  });
}

const files = testDirectories.flatMap((directory) => findTests(join(root, directory)).map((path) => relative(root, path).replaceAll('\\', '/'))).sort();

const run = spawnSync(
  process.execPath,
  [
    '--test',
    '--test-reporter=tap',
    '--experimental-test-coverage',
    '--test-coverage-include=.github/tools/**',
    '--test-coverage-include=.github/hooks/*.mjs',
    '--test-coverage-include=.github/skills/factory-observability/scripts/**/*.mjs',
    '--test-coverage-exclude=**/tests/**',
    '--test-coverage-exclude=**/run-tests.mjs',
    `--test-coverage-lines=${policy.threshold}`,
    `--test-coverage-branches=${policy.threshold}`,
    `--test-coverage-functions=${policy.threshold}`,
    ...files,
  ],
  { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);

const output = `${run.stdout}\n${run.stderr}`;
const verdict = evaluateQuality(parseTap(output), policy);

process.stdout.write(`${files.length} test files, ${verdict.stats.total} tests: ${verdict.stats.passed} passed, ${verdict.stats.failed} failed\n`);
process.stdout.write(`positive=${verdict.stats.positive} negative=${verdict.stats.negative} (negative/positive = ${verdict.stats.ratio}, required >= ${policy.minNegativePerPositive})\n`);
if (verdict.ok && run.status === 0) {
  process.stdout.write(`Quality gate PASSED: all tests pass, every source file >= ${policy.threshold}% lines/branches/functions.\n`);
} else {
  for (const violation of verdict.violations) process.stdout.write(`VIOLATION: ${violation}\n`);
  if (run.status !== 0 && verdict.ok) process.stdout.write(`VIOLATION: node --test exited with status ${run.status}.\n`);
  process.stdout.write('Quality gate FAILED.\n');
  process.exitCode = 1;
}
