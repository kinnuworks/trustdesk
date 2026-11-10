import { idempotencyKeyFor, toCallRecord, type CallResult, type ClockedLike } from './client.js';
import {
  CONTROL_AREAS,
  OWNER_TEAMS,
  type CallRecord,
  type Endpoint,
  type Passage,
  type Question,
  type QuestionResult,
  type Reason,
} from './types.js';

export interface EngineOptions {
  /** Decide probability needed to fill an answer without a person. */
  threshold: number;
  /** Grounding score needed for the comment to be exported. */
  groundingThreshold: number;
  /** Same run id = same idempotency keys, so a retry never runs or bills twice. */
  runId: string;
  /** Passages sent to Decide, Extract and Fill. */
  topN: number;
}

export const DEFAULT_OPTIONS: Omit<EngineOptions, 'runId'> = {
  threshold: 0.7,
  groundingThreshold: 0.5,
  topN: 3,
};

const NOT_ESTABLISHED = 'not_established';

class CallFailed extends Error {}

/**
 * Answer one questionnaire question from the policy passages.
 *
 * Clocked does the reading; this function only applies fixed rules to what comes back. An answer is
 * filled only when every check agrees. Anything else goes to a person with the reasons attached.
 */
export async function answerQuestion(
  q: Question,
  passages: Passage[],
  client: ClockedLike,
  opts: EngineOptions,
): Promise<QuestionResult> {
  const t0 = Date.now();
  const calls: CallRecord[] = [];
  const reasons: Reason[] = [];
  const r: QuestionResult = {
    questionId: q.id,
    status: 'answered',
    reasons,
    answerIndex: null,
    answerLabel: null,
    probability: null,
    probabilities: null,
    evidence: null,
    ownerTeam: null,
    controlArea: null,
    comment: null,
    grounded: null,
    exportBlocked: false,
    conflict: null,
    passages: [],
    injection: null,
    calls,
    credits: 0,
    ms: 0,
  };

  async function call<T = any>(endpoint: Endpoint, body: object): Promise<T> {
    const key = idempotencyKeyFor(endpoint, body, opts.runId);
    let res: CallResult<T> | null = null;
    try {
      res = await client.call<T>(endpoint, body, key);
      calls.push(toCallRecord(endpoint, body, res, null, key));
      r.credits += res.credits ?? 0;
      return res.data;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      calls.push(toCallRecord(endpoint, body, null, msg, key));
      throw new CallFailed(`${endpoint}: ${msg}`);
    }
  }

  const finish = () => {
    if (r.status !== 'failed' && r.status !== 'set_aside') r.status = reasons.length ? 'owner' : 'answered';
    if (r.status !== 'answered') r.exportBlocked = true;
    r.ms = Date.now() - t0;
    return r;
  };

  try {
    // 1. Guard: questionnaires come from outside. A row that reads like an instruction is set aside.
    const inj = await call('injection', { text: q.text, source: 'content', evidence: true });
    r.injection = { score: inj.injection, verdict: inj.verdict, quote: inj.evidence?.[0]?.quote };
    if (inj.injection >= inj.threshold) {
      r.status = 'set_aside';
      reasons.push({ code: 'injection', text: 'This row contains instructions aimed at the tool. It was set aside and not answered.' });
      await routeOnly(q, call, r);
      return finish();
    }

    // 2. Rerank: which policy passages answer this question at all?
    const rr = await call('rerank', {
      query: q.text,
      documents: passages.map((p) => ({ id: p.id, title: `${p.docTitle}: ${p.heading}`, text: p.text })),
      top_n: Math.min(8, passages.length),
    });
    const ranked = (rr.results as any[]).map((x) => ({ x, p: passages[x.index] }));
    r.passages = ranked.map(({ x, p }) => ({
      id: p.id,
      docTitle: p.docTitle,
      heading: p.heading,
      action: x.action,
      score: x.relevance_score,
    }));
    const useful = ranked.filter(({ x }) => x.action !== 'skip').map(({ p }) => p);
    if (useful.length === 0) {
      reasons.push({ code: 'no_policy', text: 'No policy passage covers this question.' });
      await routeOnly(q, call, r);
      return finish();
    }
    const top = useful.slice(0, opts.topN);

    // 3. Decide: pick one of the questionnaire's own options, or "not established".
    const criteria: Record<string, string> = {};
    q.choices.forEach((c, i) => (criteria[`option_${i + 1}`] = c));
    criteria[NOT_ESTABLISHED] = 'The policy documents do not clearly establish which option is true for this company.';
    const dec = await call('decide', {
      state: `Questionnaire question: ${q.text}\n\nCompany policy text:\n\n${top.map((p) => p.text).join('\n\n')}`,
      instructions:
        "You are answering a customer's security questionnaire for the company that wrote these policy documents. Use only what the documents state.",
      questions: { answer: { type: 'choice', criteria } },
    });
    const ans = dec.answers.answer;
    r.probabilities = ans.probabilities;
    r.probability = ans.probabilities[ans.choice] ?? ans.confidence ?? null;
    if (ans.choice === NOT_ESTABLISHED) {
      reasons.push({ code: 'not_established', text: 'The policies do not settle this question.' });
    } else {
      r.answerIndex = Number(ans.choice.replace('option_', '')) - 1;
      r.answerLabel = q.choices[r.answerIndex] ?? null;
      if ((r.probability ?? 0) < opts.threshold)
        reasons.push({
          code: 'low_confidence',
          text: `Confidence ${Math.round((r.probability ?? 0) * 100)}% is below the ${Math.round(opts.threshold * 100)}% needed to answer without a person.`,
        });
    }

    // 4. Extract: the exact policy sentence behind the answer, with offsets for highlighting.
    let joined = '';
    const spans: { p: Passage; from: number }[] = [];
    for (const p of top) {
      spans.push({ p, from: joined.length });
      joined += p.text + '\n\n';
    }
    if (r.answerLabel) {
      const ex = await call('extract', {
        text: joined,
        fields: {
          evidence: {
            description: `The single sentence from the policy text that directly supports answering "${r.answerLabel}" to the question: ${q.text}`,
          },
        },
      });
      const f = ex.fields.evidence;
      const items: { value: string; start: number }[] = (f?.items ?? [])
        .filter((it: any) => it?.value && typeof it.start === 'number')
        .map((it: any) => ({ value: String(it.value), start: it.start }));
      if (items.length === 0 && f?.value && typeof f.start === 'number' && !Array.isArray(f.value)) items.push({ value: String(f.value), start: f.start });
      if (items.length > 0) {
        const first = items[0];
        const owner = [...spans].reverse().find((s) => first.start >= s.from) ?? spans[0];
        const local = first.start - owner.from;
        r.evidence = {
          quote: first.value,
          docId: owner.p.docId,
          docTitle: owner.p.docTitle,
          start: owner.p.start + local,
          end: owner.p.start + local + first.value.length,
        };
        r.evidenceAll = items.map((it) => it.value);
        // Second reader: pick the option again from the quoted sentence alone. If the two readings
        // disagree, the sentence is not enough to answer, and a person decides.
        const chk = await call('decide', {
          state: `Questionnaire question: ${q.text}\n\nThe only policy text available: "${r.evidence.quote}"`,
          instructions: 'Answer only from that one sentence. Choose not_established if the sentence alone does not settle it.',
          questions: { answer: { type: 'choice', criteria } },
        });
        const second = chk.answers.answer.choice;
        r.secondReading = second === NOT_ESTABLISHED ? null : q.choices[Number(second.replace('option_', '')) - 1] ?? null;
        if (second !== ans.choice)
          reasons.push({
            code: 'evidence_disagrees',
            text:
              second === NOT_ESTABLISHED
                ? 'The quoted policy text on its own does not settle the question.'
                : 'Read on its own, the quoted policy text points to a different option.',
          });
      } else {
        reasons.push({ code: 'no_evidence', text: 'No policy sentence supports the chosen answer.' });
      }
    }

    // 5. Fill: the record for this row. owner_team decides whose queue a question lands in.
    const fill = await call('fill', {
      text: `Question: ${q.text}\nProposed answer: ${r.answerLabel ?? 'not established'}\n\nPolicy text:\n${joined}`,
      fields: {
        owner_team: { type: 'choice', options: [...OWNER_TEAMS], description: 'The team that owns this control and should confirm the answer.' },
        control_area: { type: 'choice', options: [...CONTROL_AREAS], description: 'The control area the question is about.' },
        comment: {
          type: 'generate',
          max_tokens: 90,
          description:
            "One or two plain sentences for the customer's security reviewer, answering the question using only facts in the policy text. No promises the policy does not make.",
        },
      },
    });
    r.ownerTeam = (fill.fields.owner_team?.value as string) ?? null;
    r.controlArea = (fill.fields.control_area?.value as string) ?? null;
    r.comment = (fill.fields.comment?.value as string) ?? null;

    // 6. Verify: every claim in the comment must be supported by the policies, or it cannot be exported.
    if (r.comment) {
      const g = await call('grounding', {
        documents: top.map((p) => ({ id: p.id, text: p.text })),
        question: q.text,
        answer: r.comment,
        evidence: 'flagged',
      });
      r.grounded = g.grounded;
      if (g.grounded < opts.groundingThreshold || (g.claims ?? []).some((c: any) => c.contradicted > 0.5)) {
        r.exportBlocked = true;
        reasons.push({ code: 'not_grounded', text: 'The drafted comment says something the policies do not support. It is blocked from export.' });
      }
    }

    // 7. Compare: when the evidence spans two policies, check they do not contradict each other.
    const firstPerDoc = new Map<string, Passage>();
    for (const p of top) if (!firstPerDoc.has(p.docId)) firstPerDoc.set(p.docId, p);
    if (firstPerDoc.size >= 2) {
      const [a, b] = [...firstPerDoc.values()];
      const cmp = await call('compare', {
        documents: [
          { id: a.id, text: a.text },
          { id: b.id, text: b.text },
        ],
        evidence: 'flagged',
      });
      const pair = (cmp.pairs as any[])[0];
      const found = pair?.conflicts?.[0] ?? pair?.conflict ?? null;
      if (pair?.relation === 'conflicting' || found) {
        const side = (x: any, fallback: Passage) => {
          const p = [a, b].find((d) => d.id === x?.document) ?? fallback;
          return { docTitle: p.docTitle, quote: String(x?.quote ?? '').replace(/^## .*\n/, '').trim() };
        };
        r.conflict = { a: side(found?.a, a), b: side(found?.b, b) };
        reasons.push({ code: 'conflict', text: `${r.conflict.a.docTitle} and ${r.conflict.b.docTitle} disagree on this point.` });
      }
    }
    return finish();
  } catch (e) {
    if (!(e instanceof CallFailed)) throw e;
    r.status = 'failed';
    r.answerIndex = null;
    r.answerLabel = null;
    r.comment = null;
    reasons.push({ code: 'call_failed', text: `Not answered: a Clocked call failed (${e.message}). Retry reuses the same request key.` });
    return finish();
  }
}

/** When nothing can be answered, still work out whose queue the question belongs in. */
async function routeOnly(q: Question, call: (e: Endpoint, b: object) => Promise<any>, r: QuestionResult) {
  const fill = await call('fill', {
    text: `Question: ${q.text}`,
    fields: {
      owner_team: { type: 'choice', options: [...OWNER_TEAMS], description: 'The team that owns this control and should answer the question.' },
      control_area: { type: 'choice', options: [...CONTROL_AREAS], description: 'The control area the question is about.' },
    },
  });
  r.ownerTeam = (fill.fields.owner_team?.value as string) ?? null;
  r.controlArea = (fill.fields.control_area?.value as string) ?? null;
}

/** Run questions with a fixed number in flight (the hackathon plan allows four requests at a time). */
export async function answerAll(
  qs: Question[],
  passages: Passage[],
  client: ClockedLike,
  opts: EngineOptions,
  concurrency = 3,
  onResult?: (r: QuestionResult) => void,
): Promise<QuestionResult[]> {
  const out: QuestionResult[] = new Array(qs.length);
  let next = 0;
  async function worker() {
    while (next < qs.length) {
      const i = next++;
      out[i] = await answerQuestion(qs[i], passages, client, opts);
      onResult?.(out[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, qs.length) }, worker));
  return out;
}
