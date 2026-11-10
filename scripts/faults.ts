/**
 * Planted-fault tests against the live Clocked API.
 *
 *   CLOCKED_API_KEY=... npx tsx scripts/faults.ts delete     # remove each answer's source sentence, run again
 *   CLOCKED_API_KEY=... npx tsx scripts/faults.ts injection  # 30 planted instruction rows vs all 152 real VSAQ questions
 *
 * Writes eval/faults-<kind>.md and eval/faults-<kind>.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { idempotencyKeyFor } from '../lib/client.js';
import { answerQuestion, DEFAULT_OPTIONS, GUARD_INSTRUCTIONS } from '../lib/engine.js';
import { LiveClient } from '../lib/live.js';
import { chunkPolicies } from '../lib/policies.js';
import type { PolicyDoc, Question, QuestionResult } from '../lib/types.js';

const kind = process.argv[2];
const client = new LiveClient();

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

if (kind === 'delete') {
  // Start from the recorded Halden run: every question answered automatically, with the sentence it quoted.
  const run = JSON.parse(readFileSync('public/replay/halden.json', 'utf8')) as { docs: PolicyDoc[]; questions: Question[]; results: QuestionResult[] };
  const answered = run.results.filter((r) => r.status === 'answered' && r.evidence);
  const rows = await pool(answered, 3, async (before) => {
    const q = run.questions.find((x) => x.id === before.questionId)!;
    // The same policies with the quoted sentence removed.
    const docs = run.docs.map((d) => (d.id === before.evidence!.docId ? { ...d, text: d.text.replace(before.evidence!.quote, '') } : d));
    const after = await answerQuestion(q, chunkPolicies(docs), client, { ...DEFAULT_OPTIONS, runId: `faults-delete-v1:${q.id}` });
    return {
      id: q.id,
      question: q.text,
      removed: before.evidence!.quote,
      before: before.answerLabel,
      after: after.status === 'answered' ? after.answerLabel : null,
      status: after.status,
      reasons: after.reasons.map((x) => x.code),
      newEvidence: after.status === 'answered' ? after.evidence?.quote ?? null : null,
      credits: after.credits,
    };
  });
  const toOwner = rows.filter((r) => r.status !== 'answered');
  const still = rows.filter((r) => r.status === 'answered');
  let md = `## Delete-the-source test (Halden Labs)\n\nFor each of the ${rows.length} questions TrustDesk answered automatically, the policy sentence it quoted was deleted and the question was run again.\n\n`;
  md += `| Outcome | Count |\n|---|---|\n| Went to an owner instead | ${toOwner.length} of ${rows.length} |\n| Still answered, from a different sentence | ${still.length} of ${rows.length} |\n\n`;
  md += `Credits: ${rows.reduce((s, r) => s + r.credits, 0)}.\n\n`;
  if (still.length) {
    md += 'Still answered after the deletion (check whether the new sentence really supports the answer):\n\n';
    for (const r of still) md += `- ${r.id}: "${r.after}" from "${r.newEvidence}" (removed: "${r.removed}")\n`;
    md += '\n';
  }
  md += 'Reasons for the owner routing:\n\n';
  const counts = toOwner.flatMap((r) => r.reasons).reduce<Record<string, number>>((m, c) => ((m[c] = (m[c] ?? 0) + 1), m), {});
  for (const [k, v] of Object.entries(counts)) md += `- ${k}: ${v}\n`;
  writeFileSync('eval/faults-delete.md', md);
  writeFileSync('eval/faults-delete.json', JSON.stringify(rows, null, 1));
  console.log(md);
} else if (kind === 'injection') {
  const planted = JSON.parse(readFileSync('data/planted-injections.json', 'utf8')) as string[];
  const real = (JSON.parse(readFileSync('data/vsaq/all_questions.json', 'utf8')) as any[]).map((q) => q.text as string);
  const items = [...planted.map((t) => ({ t, planted: true })), ...real.map((t) => ({ t, planted: false }))];
  const rows = await pool(items, 4, async ({ t, planted: p }) => {
    // The exact request the engine sends for every row.
    const body = { text: t, source: 'content', evidence: true, instructions: GUARD_INSTRUCTIONS };
    const res = await client.call<any>('injection', body, idempotencyKeyFor('injection', body, 'faults-injection-v1'));
    return { planted: p, text: t, score: res.data.injection as number, flagged: res.data.injection >= res.data.threshold, credits: res.credits ?? 0 };
  });
  const caught = rows.filter((r) => r.planted && r.flagged);
  const missed = rows.filter((r) => r.planted && !r.flagged);
  const falseAlarms = rows.filter((r) => !r.planted && r.flagged);
  let md = `## Guard test: planted instruction rows vs real questions\n\n`;
  md += `| Set | Result |\n|---|---|\n| Planted instruction rows set aside | ${caught.length} of ${caught.length + missed.length} |\n| Real VSAQ questions flagged by mistake | ${falseAlarms.length} of ${real.length} |\n\n`;
  md += `Credits: ${rows.reduce((s, r) => s + r.credits, 0)}.\n\n`;
  if (missed.length) md += `Missed:\n${missed.map((r) => `- (${r.score.toFixed(2)}) ${r.text}`).join('\n')}\n\n`;
  if (falseAlarms.length) md += `False alarms:\n${falseAlarms.map((r) => `- (${r.score.toFixed(2)}) ${r.text.slice(0, 160)}`).join('\n')}\n\n`;
  writeFileSync('eval/faults-injection.md', md);
  writeFileSync('eval/faults-injection.json', JSON.stringify(rows, null, 1));
  console.log(md);
} else {
  console.error('usage: faults.ts delete|injection');
  process.exit(1);
}
