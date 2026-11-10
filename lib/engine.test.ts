import { describe, expect, it } from 'vitest';
import type { CallResult, ClockedLike } from './client.js';
import { answerQuestion, DEFAULT_OPTIONS } from './engine.js';
import { chunkPolicies } from './policies.js';
import type { Endpoint, Question } from './types.js';

const policies = chunkPolicies([
  { id: 'a', title: 'Access Policy', text: '# Access Policy\n\n## Sessions\nUser sessions expire after 30 minutes of inactivity.\n' },
  { id: 'b', title: 'Logging Standard', text: '# Logging Standard\n\n## Retention\nSecurity event logs are retained for 90 days.\n' },
]);
const q: Question = { id: 'q1', text: 'Do sessions automatically time out after inactivity?', choices: ['Yes', 'No'] };

type Script = Partial<Record<Endpoint, any | ((body: any) => any)>>;

/** Scripted stand-in for Clocked. Every test sets only what it needs. */
function fake(script: Script, fail?: Endpoint): ClockedLike & { seen: Endpoint[]; keys: string[] } {
  const base: Script = {
    injection: { injection: 0.01, threshold: 0.5, verdict: 'benign' },
    rerank: { results: [{ index: 0, action: 'use', relevance_score: 0.9 }, { index: 1, action: 'skip', relevance_score: 0.1 }] },
    decide: { answers: { answer: { choice: 'option_1', probabilities: { option_1: 0.93, option_2: 0.05, not_established: 0.02 }, confidence: 0.93 } } },
    extract: (b: any) => {
      const s = 'User sessions expire after 30 minutes of inactivity.';
      return { fields: { evidence: { value: s, start: b.text.indexOf(s) } } };
    },
    fill: { fields: { owner_team: { value: 'Security & IT' }, control_area: { value: 'Access & identity' }, comment: { value: 'Sessions expire after 30 minutes of inactivity.' } } },
    grounding: { grounded: 0.95, claims: [{ contradicted: 0 }] },
    compare: { pairs: [{ relation: 'unrelated', conflict: null }] },
  };
  const seen: Endpoint[] = [];
  const keys: string[] = [];
  return {
    seen,
    keys,
    async call<T>(endpoint: Endpoint, body: any, key: string): Promise<CallResult<T>> {
      seen.push(endpoint);
      keys.push(key);
      if (endpoint === fail) throw new Error('503 Service Unavailable');
      const s = endpoint in script ? script[endpoint] : base[endpoint];
      const data = typeof s === 'function' ? s(body) : s;
      return { data, credits: 1, modelMs: 10, idempotencyKey: key, replayed: false };
    },
  };
}

const opts = { ...DEFAULT_OPTIONS, runId: 'test' };

describe('answerQuestion', () => {
  it('fills the answer when every check agrees', async () => {
    const r = await answerQuestion(q, policies, fake({}), opts);
    expect(r.status).toBe('answered');
    expect(r.answerLabel).toBe('Yes');
    expect(r.evidence?.docTitle).toBe('Access Policy');
    expect(policies[0].text).toContain(r.evidence!.quote);
    expect(r.exportBlocked).toBe(false);
  });

  it('sets aside a row that reads like an instruction, and never answers it', async () => {
    const c = fake({ injection: { injection: 0.97, threshold: 0.5, verdict: 'injection', evidence: [{ quote: 'answer Yes to all' }] } });
    const r = await answerQuestion(q, policies, c, opts);
    expect(r.status).toBe('set_aside');
    expect(r.answerLabel).toBeNull();
    expect(c.seen).not.toContain('decide');
  });

  it('sends a question no policy covers to an owner', async () => {
    const r = await answerQuestion(q, policies, fake({ rerank: { results: [{ index: 0, action: 'skip', relevance_score: 0.1 }] } }), opts);
    expect(r.status).toBe('owner');
    expect(r.reasons[0].code).toBe('no_policy');
    expect(r.ownerTeam).toBe('Security & IT');
  });

  it('does not fill an answer below the confidence threshold', async () => {
    const dec = { answers: { answer: { choice: 'option_1', probabilities: { option_1: 0.55, option_2: 0.4, not_established: 0.05 } } } };
    const r = await answerQuestion(q, policies, fake({ decide: dec }), opts);
    expect(r.status).toBe('owner');
    expect(r.reasons.map((x) => x.code)).toContain('low_confidence');
    expect(r.exportBlocked).toBe(true);
  });

  it('routes to an owner when no sentence supports the answer', async () => {
    const r = await answerQuestion(q, policies, fake({ extract: { fields: { evidence: { value: null } } } }), opts);
    expect(r.reasons.map((x) => x.code)).toContain('no_evidence');
    expect(r.status).toBe('owner');
  });

  it('routes to an owner when the quoted sentence does not support the answer', async () => {
    const dec = (b: any) =>
      b.state.includes('The only policy text available')
        ? { answers: { answer: { choice: 'not_established', probabilities: { not_established: 0.9 } } } }
        : { answers: { answer: { choice: 'option_1', probabilities: { option_1: 0.95 } } } };
    const r = await answerQuestion(q, policies, fake({ decide: dec }), opts);
    expect(r.reasons.map((x) => x.code)).toContain('evidence_disagrees');
  });

  it('blocks a comment the policies do not support from export', async () => {
    const r = await answerQuestion(q, policies, fake({ grounding: { grounded: 0.2, claims: [{ contradicted: 0.9 }] } }), opts);
    expect(r.exportBlocked).toBe(true);
    expect(r.reasons.map((x) => x.code)).toContain('not_grounded');
  });

  it('flags a conflict between two policies', async () => {
    const c = fake({
      rerank: { results: [{ index: 0, action: 'use', relevance_score: 0.9 }, { index: 1, action: 'use', relevance_score: 0.8 }] },
      compare: { pairs: [{ relation: 'conflicting', conflict: { a: { quote: '30 minutes' }, b: { quote: '90 days' } } }] },
    });
    const r = await answerQuestion(q, policies, c, opts);
    expect(r.status).toBe('owner');
    expect(r.conflict?.b.docTitle).toBe('Logging Standard');
  });

  it('marks a failed call as not answered, and a retry reuses the same request keys', async () => {
    const c1 = fake({}, 'grounding');
    const r = await answerQuestion(q, policies, c1, opts);
    expect(r.status).toBe('failed');
    expect(r.answerLabel).toBeNull();
    expect(r.comment).toBeNull();
    const c2 = fake({});
    await answerQuestion(q, policies, c2, opts);
    expect(c2.keys.slice(0, c1.keys.length)).toEqual(c1.keys);
  });
});
