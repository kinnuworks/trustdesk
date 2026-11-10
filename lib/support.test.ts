import { describe, expect, it } from 'vitest';
import { hash, idempotencyKeyFor, RecordingClient, ReplayClient, requestHash, stableStringify, type ClockedLike } from './client.js';
import { matchPrior } from './carryover.js';
import { chunkPolicies, policyFromMarkdown } from './policies.js';
import { parseQuestionCsv } from '../src/run.js';
import type { Endpoint } from './types.js';

describe('policies', () => {
  const doc = policyFromMarkdown('p', '# Access Policy\n\nIntro line.\n\n## Sessions\nSessions expire after 30 minutes.\n\n## Passwords\nPasswords are at least 12 characters.\n');
  it('takes the title from the first heading', () => expect(doc.title).toBe('Access Policy'));
  it('splits at section headings and keeps offsets into the document', () => {
    const ps = chunkPolicies([doc]);
    expect(ps.map((p) => p.heading)).toEqual(['Sessions', 'Passwords']);
    for (const p of ps) expect(doc.text.slice(p.start, p.start + p.text.length)).toBe(p.text);
  });
  it('treats a document without headings as one passage', () => {
    const ps = chunkPolicies([{ id: 'x', title: 'Note', text: 'All laptops use full-disk encryption at all times.' }]);
    expect(ps).toHaveLength(1);
  });
});

describe('request keys', () => {
  it('hashes objects the same regardless of key order', () => {
    expect(stableStringify({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(stableStringify({ a: [2, { c: 4, d: 3 }], b: 1 }));
    expect(requestHash('decide', { a: 1, b: 2 })).toBe(requestHash('decide', { b: 2, a: 1 }));
  });
  it('gives a different hash for a different endpoint or body', () => {
    expect(requestHash('decide', { a: 1 })).not.toBe(requestHash('extract', { a: 1 }));
    expect(hash('a')).not.toBe(hash('b'));
  });
  it('makes UUID-shaped idempotency keys that repeat for the same run and differ across runs', () => {
    const k = idempotencyKeyFor('fill', { t: 1 }, 'run-1:Q1');
    expect(k).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(idempotencyKeyFor('fill', { t: 1 }, 'run-1:Q1')).toBe(k);
    expect(idempotencyKeyFor('fill', { t: 1 }, 'run-1:Q2')).not.toBe(k);
  });
});

describe('record and replay', () => {
  const live: ClockedLike = {
    async call<T>(_e: Endpoint, body: any, key: string) {
      return { data: { echo: body.x } as T, credits: 3, modelMs: 10, idempotencyKey: key, replayed: false };
    },
  };
  it('replays exactly what was recorded and marks it as replayed', async () => {
    const rec = new RecordingClient(live);
    await rec.call('decide', { x: 7 }, 'k1');
    const replay = new ReplayClient(rec.recordings);
    const r = await replay.call<any>('decide', { x: 7 }, 'k2');
    expect(r.data.echo).toBe(7);
    expect(r.credits).toBe(3);
    expect(r.replayed).toBe(true);
  });
  it('fails loudly on a request that was never recorded', async () => {
    await expect(new ReplayClient([]).call('decide', { x: 1 }, 'k')).rejects.toThrow(/No recorded response/);
  });
});

describe("last year's sheet", () => {
  const prior = [{ question: 'Do sessions expire when idle?', answer: 'Yes' }];
  const fake = (relation: string, action = 'use'): ClockedLike => ({
    async call<T>(endpoint: Endpoint, _b: object, key: string) {
      const data = endpoint === 'rerank' ? { results: [{ index: 0, action }] } : { pairs: [{ relation }] };
      return { data: data as T, credits: 1, modelMs: 1, idempotencyKey: key, replayed: false };
    },
  });
  const q = { id: 'Q5', text: 'Do sessions automatically time out after inactivity?', choices: ['Yes', 'No'] };
  it('reuses last year only when Compare says the questions are the same', async () => {
    expect((await matchPrior(q, prior, fake('same'), 'r')).kind).toBe('same');
    expect((await matchPrior(q, prior, fake('overlapping'), 'r')).kind).toBe('changed');
    expect((await matchPrior(q, prior, fake('unrelated'), 'r')).kind).toBe('new');
  });
  it('treats a question with no close match as new', async () => {
    expect((await matchPrior(q, prior, fake('same', 'skip'), 'r')).kind).toBe('new');
    expect((await matchPrior(q, [], fake('same'), 'r')).kind).toBe('new');
  });
});

describe('question CSV', () => {
  it('reads quoted cells, skips the header and defaults to Yes/No', () => {
    const qs = parseQuestionCsv('question,options\n"Do you encrypt laptops, phones and tablets?","Yes|No|Partly"\nDo you train staff?\n');
    expect(qs).toHaveLength(2);
    expect(qs[0].text).toBe('Do you encrypt laptops, phones and tablets?');
    expect(qs[0].choices).toEqual(['Yes', 'No', 'Partly']);
    expect(qs[1].choices).toEqual(['Yes', 'No']);
  });
});
