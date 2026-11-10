import { answerQuestion, DEFAULT_OPTIONS } from '../lib/engine.js';
import { LiveClient } from '../lib/live.js';
import { chunkPolicies } from '../lib/policies.js';
import type { PolicyDoc, Question } from '../lib/types.js';

/**
 * POST /api/answer  { question, docs, runId }  ->  QuestionResult
 * Answers one question live. The key stays on the server. Inputs are capped so a public demo
 * cannot be used to spend the account's credits on anything else.
 */
const MAX_POLICY_CHARS = 40_000;
const MAX_QUESTION_CHARS = 1_500;
const PER_IP_PER_HOUR = 120;
const hits = new Map<string, { n: number; since: number }>();

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? 'local').split(',')[0].trim();
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.since > 3_600_000) hits.set(ip, { n: 1, since: now });
  else if (++h.n > PER_IP_PER_HOUR) return send(res, 429, { error: 'Live runs are limited to 120 questions an hour. Try the sample run instead.' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const question = body?.question as Question;
  const docs = body?.docs as PolicyDoc[];
  if (!question?.text || !Array.isArray(question.choices) || question.choices.length < 2)
    return send(res, 400, { error: 'A question needs text and at least two answer options.' });
  if (question.text.length > MAX_QUESTION_CHARS) return send(res, 400, { error: 'Question is too long.' });
  if (!Array.isArray(docs) || docs.length === 0) return send(res, 400, { error: 'Add at least one policy.' });
  const total = docs.reduce((s, d) => s + String(d.text ?? '').length, 0);
  if (total > MAX_POLICY_CHARS) return send(res, 400, { error: `Policies are limited to ${MAX_POLICY_CHARS.toLocaleString()} characters in the live demo.` });

  let client: LiveClient;
  try {
    client = new LiveClient();
  } catch {
    return send(res, 503, { error: 'Live runs are not configured on this deployment. The sample run still works.' });
  }
  const runId = String(body.runId ?? 'live').slice(0, 64);
  const result = await answerQuestion(question, chunkPolicies(docs), client, { ...DEFAULT_OPTIONS, runId });
  return send(res, 200, result);
}

function send(res: any, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}
