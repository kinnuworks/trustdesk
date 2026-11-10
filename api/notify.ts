/**
 * POST /api/notify  { webhookUrl?, task }
 * Posts an owner task to a Microsoft Teams or Slack channel through an incoming webhook.
 * Only Slack and Microsoft webhook hosts are accepted, so this cannot be used to call anything else.
 */
const ALLOWED = [/^hooks\.slack\.com$/, /\.webhook\.office\.com$/, /\.logic\.azure\.com$/, /^prod-\d+\.\w+\.logic\.azure\.com$/];

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const url = String(body?.webhookUrl || process.env.OWNER_WEBHOOK_URL || '');
  const t = body?.task;
  if (!url) return send(res, 400, { error: 'No webhook is set. Add a Teams or Slack incoming webhook URL.' });
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') throw new Error();
    host = u.hostname;
  } catch {
    return send(res, 400, { error: 'That is not a valid https webhook URL.' });
  }
  if (!ALLOWED.some((re) => re.test(host))) return send(res, 400, { error: 'Only Slack and Microsoft Teams webhooks are supported.' });
  if (!t?.question || !t?.team) return send(res, 400, { error: 'Missing task.' });

  const lines = [
    `*Security questionnaire: ${clip(t.request, 80)}*`,
    `Owner: ${clip(t.team, 40)}`,
    `Question ${clip(t.id, 8)}: ${clip(t.question, 400)}`,
    `Why it needs you: ${clip(t.reason, 300)}`,
    t.link ? `Answer it here: ${clip(t.link, 300)}` : '',
  ].filter(Boolean);
  const isSlack = host === 'hooks.slack.com';
  const payload = isSlack ? { text: lines.join('\n') } : { text: lines.join('\n\n').replace(/\*/g, '**') };
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!r.ok) return send(res, 502, { error: `The channel did not accept the message (${r.status}).` });
  return send(res, 200, { ok: true, channel: isSlack ? 'Slack' : 'Microsoft Teams' });
}

function clip(s: unknown, n: number) {
  const v = String(s ?? '');
  return v.length > n ? `${v.slice(0, n - 1)}…` : v;
}

function send(res: any, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}
