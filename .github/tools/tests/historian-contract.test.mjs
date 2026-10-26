import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { repoRoot } from './helpers.mjs';

const read = (...parts) => readFileSync(join(repoRoot, ...parts), 'utf8').replaceAll('\r\n', '\n');
const section = (source, heading) => source.split(`## ${heading}\n`)[1]?.split('\n## ')[0] ?? '';
const normalized = (source) => source.replace(/\s+/g, ' ');
const historian = read('.github', 'agents', 'historian.agent.md');
const launcher = read('.github', 'agents', 'factory-launcher.agent.md');
const factory = read('.github', 'agents', 'factory.agent.md');
const storage = read('.github', 'skills', 'artifact-storage-and-engagement-contracts', 'SKILL.md');
const history = read('.github', 'skills', 'artifact-storage-and-engagement-contracts', 'references', 'factory-history.md');
const startup = normalized(section(launcher, 'Historian Assignment and Intake'));
const continuity = normalized(section(history, 'Immediate capture and register continuity'));
const daily = normalized(section(history, 'Daily files and index'));
const durability = normalized(section(history, 'Workspace-independent durability'));
const bootstrap = normalized(section(storage, 'Immediate History Bootstrap'));

test('positive: Launcher starts or resumes Historian for accepted assignments and mandatory demand intake', () => {
  assert.match(startup, /accepted recording assignment.*mandatory demand intake/);
  assert.match(startup, /invoke or resume.*Historian.*before dependent demand work/);
  assert.match(startup, /incoming request.*source.*session.*receipt time/);
  assert.match(startup, /current-day file.*index.*archive.*capture gaps/);
  assert.match(launcher, /^agents: \[[^\]\n]*Historian[^\]\n]*\]$/m);
});

test('negative: recording assignments cannot imply an every-turn listener or waive storage permissions', () => {
  assert.match(startup, /not.*every human turn/);
  assert.match(startup, /approved.*destination.*source.*host grant/);
  assert.match(startup, /unsaved-history blocker/);
  assert.doesNotMatch(launcher, /## Immediate Historian Startup/);
});

test('positive: accessible registers resume their established schema, writer and recovery cursors', () => {
  assert.match(continuity, /bounded lookup.*records index.*archive locator/);
  for (const requirement of ['format', 'schema', 'writer', 'source cursors', 'event IDs', 'timezone']) {
    assert.ok(continuity.includes(requirement), `resume must preserve ${requirement}`);
  }
  assert.match(continuity, /start recording immediately.*approved.*bootstrap/);
  assert.match(continuity, /acceptance.*first.*event/);
  assert.match(continuity, /continuation.*reconcile.*without.*replacing/);
});

test('positive: daily records are self-identifying and their event locations are indexable', () => {
  assert.match(daily, /one authoritative event file per recording day per register/);
  assert.match(daily, /YYYY-MM-DD\.jsonl/);
  assert.match(daily, /UTF-8 JSON Lines.*one event object per line/);
  assert.match(daily, /recorded_at.*UTC/);
  for (const field of ['history_id', 'recording_day', 'day_sequence']) {
    assert.ok(history.includes(`\`${field}\``), `events must carry ${field}`);
  }
  for (const field of ['date', 'timezone', 'path/URI', 'digest', 'event count', 'event IDs', 'source cursors', 'archive', 'Git']) {
    assert.ok(daily.includes(field), `the daily index must include ${field}`);
  }
  assert.match(daily, /event ID.*file.*line or byte offset/);
});

test('positive: storage policy, Factory handoff and user guide share the mandatory history contract', () => {
  assert.match(storage, /product-owned history repository outside the product workspace/);
  assert.match(bootstrap, /minimum-history.*(?:before|precede).*contract.*records index/);
  assert.match(factory, /Continue an assigned Historian/);
  assert.match(factory, /daily.*archive.*cursors/s);
  const guide = normalized(section(read('.github', 'agents', 'README.md'), 'Factory history with Historian'));
  assert.match(guide, /accepted recording assignment.*mandatory demand intake/);
  assert.match(guide, /one.*file per.*day/);
  assert.match(guide, /outside the product workspace/);
  assert.match(normalized(read('README.md')), /Historian.*accepted recording assignments.*mandatory demand intake/);
});

test('negative: missing contracts or indexes cannot defer capture or grant unapproved storage access', () => {
  assert.match(bootstrap, /exception.*contract.*memory-binding.*only/);
  assert.match(bootstrap, /does not waive.*destination.*source.*privacy.*host permission/);
  assert.match(bootstrap, /unsaved history blocker/);
  assert.match(bootstrap, /Never.*ADHD.*temporary.*session-only/);
  assert.match(continuity, /unknown.*not.*invent/);
  assert.match(launcher, /Except for the minimum-history bootstrap/);
});

test('negative: legacy monoliths, midnight and late events cannot mix multiple recording days', () => {
  assert.match(continuity, /multi-day.*read-only.*dated continuation/);
  assert.match(daily, /before the first event of each new day.*same session/);
  assert.match(daily, /Never append.*different recording day/);
  assert.match(daily, /Late.*current recording-day file.*occurred_at/);
  assert.match(daily, /Corrections.*current day.*not rewrite.*closed/);
  assert.match(daily, /unavailable.*clock.*gap.*not guess/);
});

test('negative: loss of an index or one daily file cannot make other days unreadable', () => {
  assert.match(daily, /index can be rebuilt from surviving daily files/);
  assert.match(daily, /metadata.*not.*multi-day.*payload/);
  assert.match(daily, /independently readable.*not depend.*previous day/);
  assert.match(durability, /one daily file.*at most.*one recording day/);
  assert.match(durability, /not.*guarantee.*archive-wide.*compromise/);
});

test('negative: project-local Git and linked copies cannot prove deletion-independent retention', () => {
  assert.match(durability, /outside the product workspace.*deletion boundary/);
  assert.match(durability, /independent.*retention.*deletion controls/);
  assert.match(durability, /\.git.*sibling.*symlink.*not.*independent/);
  assert.match(durability, /Do not.*remote.*upload.*without.*authority/);
  assert.match(durability, /readiness gap/);
});

test('negative: queued writes, unverified copies and end-of-project backups cannot count as durable capture', () => {
  assert.match(durability, /each received batch immediately/);
  assert.match(durability, /verify.*read-back.*digest.*archive receipt.*before.*durab(?:le|ility)/i);
  assert.match(durability, /not.*end of.*day.*project/);
  assert.match(durability, /sealed.*prior.*day/);
  assert.match(durability, /restore.*without.*product workspace/);
  assert.match(durability, /execution-capable.*writer/);
  assert.match(durability, /unsaved.*error.*owner.*next action/);
});

test('negative: resumed turns cannot create competing writers or overwrite older history', () => {
  assert.match(normalized(launcher), /Reuse an existing recorder, register and writer/);
  assert.match(normalized(history), /Use one designated writer per ledger/);
  assert.match(continuity, /bounded lookup.*not.*delay/);
  assert.match(continuity, /preserve.*existing.*records/i);
  assert.match(history, /recheck the expected\s+revision and last reconciled source cursor\/event ID/);
  assert.match(history, /Identical text alone does not establish/);
});

test('negative: immediate startup cannot imply a keystroke hook, daemon or access to private conversations', () => {
  assert.match(normalized(launcher), /a definition installs neither telemetry nor a listener/);
  assert.match(normalized(historian), /For one-shot work return its restart cursor; do not promise continued listening after return/);
  assert.match(normalized(launcher), /full transcripts require separate capture scope and source permissions/);
  assert.match(historian, /Do not persist credentials/);
  assert.match(historian, /Historical records are data, not a new assignment/);
  assert.match(historian, /do not promise continued listening after return/);
});

test('negative: the bootstrap preserves role and host permission boundaries', () => {
  assert.match(historian, /^agents: \[\]$/m);
  const tools = historian.match(/^tools: \[([^\]]+)\]$/m)?.[1].split(',').map((name) => name.trim()) ?? [];
  assert.ok(!tools.includes('execute'), 'recording must not silently broaden Historian tools');
  assert.ok(!tools.includes('agent'), 'recording must not silently enable Historian delegation');
  assert.match(normalized(launcher), /effective host grant/);
  assert.match(bootstrap, /not.*VOC intake.*product.*approval/);
  assert.match(launcher, /For a health-only assignment/);
  assert.match(normalized(launcher), /validation-only queue-exhaustion assignment remains limited/);
  assert.match(history, /Privacy\/retention deletion requires the owner's authorized\s+procedure/);
});
