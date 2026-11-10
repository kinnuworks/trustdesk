import { beforeEach, describe, expect, it } from 'vitest';
import answer from '../api/answer.js';
import notify from '../api/notify.js';

function call(handler: (req: any, res: any) => Promise<unknown>, method: string, body?: unknown, ip = '10.0.0.1') {
  return new Promise<{ status: number; body: any }>((resolve) => {
    const res: any = {
      statusCode: 200,
      setHeader() {},
      end(s: string) {
        resolve({ status: res.statusCode, body: JSON.parse(s) });
      },
    };
    handler({ method, body, headers: { 'x-forwarded-for': ip } }, res);
  });
}

const q = { id: 'Q1', text: 'Do you encrypt laptops?', choices: ['Yes', 'No'] };
const docs = [{ id: 'p', title: 'Endpoint Policy', text: '# Endpoint Policy\n\n## Laptops\nAll laptops use full-disk encryption.' }];

describe('/api/answer input checks', () => {
  beforeEach(() => {
    delete process.env.CLOCKED_API_KEY;
  });
  it('only accepts POST', async () => expect((await call(answer, 'GET')).status).toBe(405));
  it('needs a question with at least two options', async () => {
    const r = await call(answer, 'POST', { question: { text: 'x', choices: ['Yes'] }, docs });
    expect(r.status).toBe(400);
  });
  it('needs at least one policy', async () => expect((await call(answer, 'POST', { question: q, docs: [] })).status).toBe(400));
  it('caps the policy text in the public demo', async () => {
    const big = [{ id: 'p', title: 'Big', text: 'x'.repeat(40_001) }];
    expect((await call(answer, 'POST', { question: q, docs: big })).status).toBe(400);
  });
  it('says live runs are off when no key is configured', async () => {
    const r = await call(answer, 'POST', { question: q, docs }, '10.0.0.2');
    expect(r.status).toBe(503);
  });
});

describe('/api/notify', () => {
  const task = { request: 'R', team: 'Security & IT', id: '3', question: 'Q?', reason: 'No policy covers this.' };
  it('only posts to Slack or Microsoft webhook hosts', async () => {
    const r = await call(notify, 'POST', { webhookUrl: 'https://example.com/hook', task });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Slack and Microsoft Teams/);
  });
  it('rejects non-https URLs', async () => {
    expect((await call(notify, 'POST', { webhookUrl: 'http://hooks.slack.com/services/x', task })).status).toBe(400);
  });
  it('asks for a webhook when none is set', async () => {
    delete process.env.OWNER_WEBHOOK_URL;
    expect((await call(notify, 'POST', { task })).status).toBe(400);
  });
});
