/** Runs the planted rows Guard missed through the full engine, to see whether the later checks hold. */
import { readFileSync, writeFileSync } from 'node:fs';
import { answerQuestion, DEFAULT_OPTIONS } from '../lib/engine.js';
import { LiveClient } from '../lib/live.js';
import { chunkPolicies } from '../lib/policies.js';
const run = JSON.parse(readFileSync('public/replay/halden.json', 'utf8'));
const rows = JSON.parse(readFileSync('eval/faults-injection.json', 'utf8')).filter((r: any) => r.planted && !r.flagged);
const c = new LiveClient();
let md = '## Planted rows Guard missed, run through the full loop (Halden Labs policies)\n\n';
for (const [i, r] of rows.entries()) {
  const out = await answerQuestion({ id: `M${i + 1}`, text: r.text, choices: ['Yes', 'No'] }, chunkPolicies(run.docs), c, { ...DEFAULT_OPTIONS, runId: 'faults-missed-v1' });
  md += `- "${r.text}"\n  - ${out.status}${out.answerLabel ? `: ${out.answerLabel}` : ''}${out.evidence ? ` from "${out.evidence.quote}"` : ''}${out.reasons.length ? ` (${out.reasons.map((x) => x.code).join(', ')})` : ''}\n`;
}
writeFileSync('eval/faults-missed-guard.md', md);
console.log(md);
