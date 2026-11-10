import { ReplayClient, type Recording } from '../lib/client.js';
import { answerAll, DEFAULT_OPTIONS } from '../lib/engine.js';
import { chunkPolicies } from '../lib/policies.js';
import type { Carry } from '../lib/carryover.js';
import type { PolicyDoc, Question, QuestionResult } from '../lib/types.js';

export interface SampleRun {
  pack: string;
  company: string;
  runId: string;
  docs: PolicyDoc[];
  questions: Question[];
  results: QuestionResult[];
  carry?: Record<string, Carry>;
  recordings: Recording[];
  seconds: number;
  credits: number;
}

export async function loadSample(pack: string): Promise<SampleRun> {
  const r = await fetch(`/replay/${pack}.json`);
  if (!r.ok) throw new Error('The sample run could not be loaded.');
  return r.json();
}

/**
 * Re-runs the sample through the same engine the live API uses, answering every Clocked call from
 * the recorded live responses. Nothing here is precomputed: the routing rules run again in the browser.
 */
export async function replaySample(s: SampleRun, onResult: (r: QuestionResult) => void): Promise<QuestionResult[]> {
  const client = new ReplayClient(s.recordings, 40);
  return answerAll(s.questions, chunkPolicies(s.docs), client, { ...DEFAULT_OPTIONS, runId: s.runId }, 3, onResult);
}

/** Live run: one request per question to /api/answer, three in flight. */
export async function runLive(
  questions: Question[],
  docs: PolicyDoc[],
  runId: string,
  onResult: (r: QuestionResult) => void,
): Promise<void> {
  let next = 0;
  async function worker() {
    while (next < questions.length) {
      const q = questions[next++];
      onResult(await answerLive(q, docs, runId));
    }
  }
  await Promise.all([worker(), worker(), worker()]);
}

export async function answerLive(q: Question, docs: PolicyDoc[], runId: string): Promise<QuestionResult> {
  try {
    const res = await fetch('/api/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, docs, runId }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    return body;
  } catch (e) {
    return failedResult(q.id, e instanceof Error ? e.message : String(e));
  }
}

export function failedResult(questionId: string, message: string): QuestionResult {
  return {
    questionId,
    status: 'failed',
    reasons: [{ code: 'call_failed', text: `Not answered: ${message}` }],
    answerIndex: null,
    answerLabel: null,
    probability: null,
    probabilities: null,
    evidence: null,
    ownerTeam: null,
    controlArea: null,
    comment: null,
    grounded: null,
    exportBlocked: true,
    conflict: null,
    passages: [],
    injection: null,
    calls: [],
    credits: 0,
    ms: 0,
  };
}

/** CSV with a header row: question, then answer options separated by "|". */
export function parseQuestionCsv(text: string): Question[] {
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: Question[] = [];
  for (const [i, line] of rows.entries()) {
    const cells = splitCsvLine(line);
    if (i === 0 && /question/i.test(cells[0])) continue;
    const textCell = cells[0];
    const choices = (cells[1] ?? 'Yes|No').split('|').map((c) => c.trim()).filter(Boolean);
    if (textCell) out.push({ id: `Q${out.length + 1}`, text: textCell, choices: choices.length >= 2 ? choices : ['Yes', 'No'] });
  }
  return out;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') out.push(cur), (cur = '');
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
