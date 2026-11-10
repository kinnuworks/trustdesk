import { idempotencyKeyFor, type ClockedLike } from './client.js';
import type { CallRecord, Question } from './types.js';

/** A row from last year's completed questionnaire. */
export interface PriorAnswer {
  question: string;
  answer: string;
  comment?: string;
}

export type Carry =
  | { kind: 'same'; prior: PriorAnswer; relation: string; calls: CallRecord[] }
  | { kind: 'changed'; prior: PriorAnswer; relation: string; calls: CallRecord[] }
  | { kind: 'new'; calls: CallRecord[] };

/**
 * Match this year's question to last year's sheet. Rerank finds the closest prior question; Compare
 * says whether the two ask the same thing. Only "same" carries the old answer forward. "Changed" and
 * "new" questions go through the full answering loop.
 */
export async function matchPrior(q: Question, prior: PriorAnswer[], client: ClockedLike, runId: string): Promise<Carry> {
  const calls: CallRecord[] = [];
  const call = async (endpoint: 'rerank' | 'compare', body: object) => {
    const key = idempotencyKeyFor(endpoint, body, runId);
    const res = await client.call<any>(endpoint, body, key);
    calls.push({ endpoint, request: body, response: res.data, credits: res.credits, modelMs: res.modelMs, idempotencyKey: key, replayed: res.replayed });
    return res.data;
  };
  if (prior.length === 0) return { kind: 'new', calls };
  const rr = await call('rerank', {
    query: q.text,
    documents: prior.map((p, i) => ({ id: `prior-${i}`, text: p.question })),
    top_n: 1,
    instructions: 'Find last year\'s question that asks the same thing as this one.',
  });
  const best = (rr.results as any[])[0];
  if (!best || best.action === 'skip') return { kind: 'new', calls };
  const p = prior[best.index];
  const cmp = await call('compare', {
    documents: [
      { id: 'this_year', text: q.text },
      { id: 'last_year', text: p.question },
    ],
    instructions: 'Two security questionnaire questions. They are the same if one honest answer fits both.',
  });
  const relation = String((cmp.pairs as any[])[0]?.relation ?? 'unrelated');
  if (relation === 'same') return { kind: 'same', prior: p, relation, calls };
  if (relation === 'overlapping' || relation === 'conflicting') return { kind: 'changed', prior: p, relation, calls };
  return { kind: 'new', calls };
}
