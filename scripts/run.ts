/**
 * Runs the questionnaire against a policy pack with the live Clocked API, records every response for
 * the no-key replay, and scores the run against the hand labels.
 *
 *   CLOCKED_API_KEY=... npx tsx scripts/run.ts halden        # 37 questions + 3 planted rows
 *   CLOCKED_API_KEY=... npx tsx scripts/run.ts orrin
 *   CLOCKED_API_KEY=... npx tsx scripts/run.ts halden --all  # all 152 VSAQ questions, no labels
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RecordingClient } from '../lib/client.js';
import { matchPrior, type Carry, type PriorAnswer } from '../lib/carryover.js';
import { questionsFromVsaq, type Label } from '../lib/data.js';
import { answerAll, DEFAULT_OPTIONS } from '../lib/engine.js';
import { LiveClient } from '../lib/live.js';
import { chunkPolicies, policyFromMarkdown } from '../lib/policies.js';
import type { Question, QuestionResult } from '../lib/types.js';

const PACKS: Record<string, { dir: string; labels: string; company: string }> = {
  halden: { dir: 'data/policies', labels: 'data/labels.json', company: 'Halden Labs' },
  orrin: { dir: 'data/policies-b', labels: 'data/labels-b.json', company: 'Orrin Freight' },
};

const pack = process.argv[2] ?? 'halden';
const all = process.argv.includes('--all');
const cfg = PACKS[pack];
if (!cfg) throw new Error(`Unknown pack ${pack}`);

const docs = readdirSync(cfg.dir)
  .filter((f) => f.endsWith('.md'))
  .sort()
  .map((f) => policyFromMarkdown(f.replace(/\.md$/, ''), readFileSync(join(cfg.dir, f), 'utf8')));
const passages = chunkPolicies(docs);

let questions: Question[];
if (all) {
  const raw = JSON.parse(readFileSync('data/vsaq/all_questions.json', 'utf8')) as any[];
  questions = raw.map((q, i) => ({ id: `V${i + 1}`, text: q.text, choices: q.choices, section: q.source }));
} else {
  questions = questionsFromVsaq(JSON.parse(readFileSync('data/questionnaire.json', 'utf8')));
  const planted = JSON.parse(readFileSync('data/planted-rows.json', 'utf8')) as Question[];
  // Planted rows go in the middle of the sheet, where a real one would hide them.
  questions.splice(10, 0, planted[0]);
  questions.splice(20, 0, planted[1]);
  questions.splice(30, 0, planted[2]);
}

const client = new RecordingClient(new LiveClient());
const runId = `${pack}-${all ? 'all' : 'demo'}-v2`;
const t0 = Date.now();
let done = 0;
const results = await answerAll(questions, passages, client, { ...DEFAULT_OPTIONS, runId }, 3, (r) => {
  done++;
  process.stdout.write(`\r${done}/${questions.length} ${r.questionId} ${r.status.padEnd(9)} ${r.reasons.map((x) => x.code).join(',')}   `);
});
const seconds = (Date.now() - t0) / 1000;
console.log();

// Last year's sheet (Halden only): which of this year's questions can reuse last year's answer?
let carry: Record<string, Carry> | undefined;
let carryReport = '';
if (pack === 'halden' && !all) {
  const prior = parsePrior(readFileSync('data/last-year-halden.csv', 'utf8'));
  carry = {};
  const qs = questions.filter((q) => !q.id.startsWith('P'));
  let i = 0;
  await Promise.all(
    [0, 1, 2].map(async () => {
      while (i < qs.length) {
        const q = qs[i++];
        carry![q.id] = await matchPrior(q, prior, client, `${runId}-carry`);
      }
    }),
  );
  // Ground truth for the synthetic sheet: 7 questions were not asked last year, 3 changed meaning.
  const expectNew = new Set(['Q3', 'Q9', 'Q22', 'Q24', 'Q28', 'Q30', 'Q37']);
  const expectChanged = new Set(['Q13', 'Q23', 'Q36']);
  let right = 0;
  for (const q of qs) {
    const want = expectNew.has(q.id) ? 'new' : expectChanged.has(q.id) ? 'changed' : 'same';
    if (carry[q.id].kind === want) right++;
  }
  const kinds = Object.values(carry).reduce<Record<string, number>>((m, c) => ((m[c.kind] = (m[c.kind] ?? 0) + 1), m), {});
  carryReport = `Last year's sheet: ${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(', ')}; matches the known changes on ${right} of ${qs.length} questions.\n\n`;
}

const credits = results.reduce((s, r) => s + r.credits, 0);
const calls = results.reduce((s, r) => s + r.calls.length, 0);
const counts = results.reduce<Record<string, number>>((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {});

mkdirSync('public/replay', { recursive: true });
mkdirSync('eval', { recursive: true });
const tag = all ? `${pack}-all` : pack;
if (!all)
  writeFileSync(
    `public/replay/${pack}.json`,
    JSON.stringify({ pack, company: cfg.company, runId, docs, questions, results, carry, recordings: client.recordings, seconds, credits }),
  );
writeFileSync(`eval/${tag}-results.json`, JSON.stringify({ seconds, credits, calls, counts, results: results.map(slim) }, null, 1));

let report = `## ${cfg.company}${all ? ' (all 152 VSAQ questions)' : ''}\n\n`;
report += `${questions.length} questions, ${calls} Clocked calls, ${credits} credits, ${seconds.toFixed(0)} s with 3 questions in flight.\n\n`;
report += `Outcome: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}.\n\n`;

if (!all) {
  const labels = JSON.parse(readFileSync(cfg.labels, 'utf8')).labels as Record<string, Label>;
  let auto = 0, autoRight = 0, shouldOwner = 0, sentOwner = 0, ownerHit = 0;
  const wrong: string[] = [];
  for (const r of results) {
    if (r.questionId.startsWith('P')) continue;
    const label = labels[r.questionId.slice(1)];
    const toPerson = r.status !== 'answered';
    if (label === 'owner') shouldOwner++;
    if (toPerson) sentOwner++;
    if (toPerson && label === 'owner') ownerHit++;
    if (!toPerson) {
      auto++;
      if (r.answerIndex === label) autoRight++;
      else wrong.push(`${r.questionId}: answered "${r.answerLabel}", label ${label === 'owner' ? 'owner' : JSON.stringify(questions.find((q) => q.id === r.questionId)?.choices[label as number])}`);
    }
  }
  const planted = results.filter((r) => r.questionId.startsWith('P'));
  const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : 'n/a');
  report += `| Measure | Result |\n|---|---|\n`;
  report += `| Filled automatically | ${auto} of ${results.length - planted.length} |\n`;
  report += `| Filled answers matching the label | ${autoRight} of ${auto} (${pct(autoRight, auto)}) |\n`;
  report += `| Owner-queue precision (sent to a person and the label says a person) | ${ownerHit} of ${sentOwner} (${pct(ownerHit, sentOwner)}) |\n`;
  report += `| Owner-queue recall (label says a person and it was sent to one) | ${ownerHit} of ${shouldOwner} (${pct(ownerHit, shouldOwner)}) |\n`;
  report += `| Planted instruction rows set aside | ${planted.filter((r) => r.status === 'set_aside').length} of ${planted.length} |\n\n`;
  if (wrong.length) report += `Filled answers that disagree with the label:\n${wrong.map((w) => `- ${w}`).join('\n')}\n\n`;
}
report += carryReport;
writeFileSync(`eval/${tag}.md`, report);
console.log(report);

function slim(r: QuestionResult) {
  const { calls: _c, ...rest } = r;
  return rest;
}

function parsePrior(text: string): PriorAnswer[] {
  const lines = text.trim().split(/\r?\n/).slice(1);
  return lines.map((l) => {
    const cells = l.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
    return { question: cells[0], answer: cells[1], comment: cells[2] };
  });
}
