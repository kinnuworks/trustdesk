import { useEffect, useMemo, useRef, useState } from 'react';
import type { PolicyDoc, Question, QuestionResult } from '../lib/types.js';
import { exportCsv, exportXlsx } from './export.js';
import { addToLibrary, libraryDoc, loadLibrary, type LibraryEntry } from './library.js';
import { answerLive, loadSample, parseQuestionCsv, replaySample, runLive, type SampleRun } from './run.js';
import './App.css';

type Tab = 'request' | 'inbox' | 'own';

export interface RequestState {
  title: string;
  company: string;
  questions: Question[];
  docs: PolicyDoc[];
  results: Record<string, QuestionResult>;
  runId: string;
  mode: 'sample' | 'live';
  running: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  answered: 'Answered',
  owner: 'Waiting on owner',
  set_aside: 'Set aside',
  failed: 'Not answered: call failed',
};

export default function App() {
  const [tab, setTab] = useState<Tab>('request');
  const [req, setReq] = useState<RequestState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryEntry[]>(loadLibrary());
  const [sample, setSample] = useState<SampleRun | null>(null);

  async function startSample(pack = 'halden') {
    setError(null);
    try {
      const s = await loadSample(pack);
      setSample(s);
      setReq({
        title: `Vendor security questionnaire for ${s.company}`,
        company: s.company,
        questions: s.questions,
        docs: s.docs,
        results: {},
        runId: s.runId,
        mode: 'sample',
        running: true,
      });
      await replaySample(s, (r) => setReq((p) => (p ? { ...p, results: { ...p.results, [r.questionId]: r } } : p)));
      setReq((p) => (p ? { ...p, running: false } : p));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    startSample();
  }, []);

  async function startLive(questions: Question[], docs: PolicyDoc[], company: string) {
    const runId = `live-${Date.now()}`;
    const withLibrary = library.length ? [...docs, libraryDoc(library)] : docs;
    setReq({ title: `Your questionnaire (${questions.length} questions)`, company, questions, docs: withLibrary, results: {}, runId, mode: 'live', running: true });
    setTab('request');
    await runLive(questions, withLibrary, runId, (r) => setReq((p) => (p ? { ...p, results: { ...p.results, [r.questionId]: r } } : p)));
    setReq((p) => (p ? { ...p, running: false } : p));
  }

  async function retry(q: Question) {
    if (!req) return;
    if (req.mode === 'sample') {
      const s = sample!;
      const one = await replaySample({ ...s, questions: [q] }, () => {});
      setReq((p) => (p ? { ...p, results: { ...p.results, [q.id]: one[0] } } : p));
      return;
    }
    const r = await answerLive(q, req.docs, req.runId);
    setReq((p) => (p ? { ...p, results: { ...p.results, [q.id]: r } } : p));
  }

  function ownerAnswer(q: Question, r: QuestionResult, choice: number, note: string) {
    const entry: LibraryEntry = {
      question: q.text,
      answer: q.choices[choice],
      note,
      team: r.ownerTeam ?? 'Security & IT',
      at: new Date().toISOString(),
    };
    setLibrary(addToLibrary(entry));
    setReq((p) =>
      p
        ? {
            ...p,
            results: {
              ...p.results,
              [q.id]: {
                ...r,
                status: 'answered',
                answerIndex: choice,
                answerLabel: q.choices[choice],
                comment: note || r.comment,
                exportBlocked: false,
                fromLibrary: { answeredBy: entry.team, answeredAt: entry.at },
              },
            },
          }
        : p,
    );
  }

  const open = req && openId ? req.questions.find((q) => q.id === openId) ?? null : null;

  return (
    <div className="page">
      <header className="top">
        <div>
          <h1>TrustDesk</h1>
          <p className="tag">Security questionnaires answered from policy.</p>
        </div>
        <nav>
          <button className={tab === 'request' ? 'on' : ''} onClick={() => setTab('request')}>Request</button>
          <button className={tab === 'inbox' ? 'on' : ''} onClick={() => setTab('inbox')}>
            Owner inbox {req ? `(${Object.values(req.results).filter((r) => r.status !== 'answered').length})` : ''}
          </button>
          <button className={tab === 'own' ? 'on' : ''} onClick={() => setTab('own')}>Try your own policies</button>
        </nav>
      </header>
      {error && <p className="error">{error}</p>}
      {tab === 'request' && req && <RequestView req={req} onOpen={setOpenId} onSample={startSample} />}
      {tab === 'inbox' && req && <Inbox req={req} onOpen={setOpenId} onAnswer={ownerAnswer} />}
      {tab === 'own' && <OwnPolicies onRun={startLive} sample={sample} library={library} />}
      {open && req && (
        <Drawer q={open} r={req.results[open.id]} docs={req.docs} onClose={() => setOpenId(null)} onRetry={() => retry(open)} />
      )}
    </div>
  );
}

function counts(req: RequestState) {
  const c = { answered: 0, owner: 0, set_aside: 0, failed: 0, pending: 0 };
  for (const q of req.questions) {
    const r = req.results[q.id];
    if (!r) c.pending++;
    else c[r.status]++;
  }
  return c;
}

function RequestView({ req, onOpen, onSample }: { req: RequestState; onOpen: (id: string) => void; onSample: (p: string) => void }) {
  const c = counts(req);
  const total = req.questions.length;
  const done = total - c.pending;
  const credits = Object.values(req.results).reduce((s, r) => s + r.credits, 0);
  const closable = !req.running && c.failed === 0 && c.pending === 0;
  const state = req.running ? 'Answering' : c.failed ? 'Blocked: calls failed' : c.owner + c.set_aside ? 'Waiting on owners' : 'Ready to send';
  return (
    <main>
      <section className="card request">
        <div className="reqhead">
          <div>
            <h2>{req.title}</h2>
            <p className="muted">
              {req.mode === 'sample'
                ? `Sample request: ${total} questions from Google's open VSAQ questionnaire, answered from ${req.docs.length} policies of ${req.company} (a fictional company). Replayed from a recorded live run.`
                : `Live run on your policies.`}
            </p>
          </div>
          <span className={`state ${closable && !c.owner && !c.set_aside ? 'good' : ''}`}>{state}</span>
        </div>
        <div className="bar">
          <span style={{ width: `${(100 * c.answered) / total}%` }} className="b-ans" />
          <span style={{ width: `${(100 * c.owner) / total}%` }} className="b-own" />
          <span style={{ width: `${(100 * c.set_aside) / total}%` }} className="b-set" />
          <span style={{ width: `${(100 * c.failed) / total}%` }} className="b-fail" />
        </div>
        <ul className="legend">
          <li><b>{c.answered}</b> answered from policy</li>
          <li><b>{c.owner}</b> waiting on an owner</li>
          <li><b>{c.set_aside}</b> set aside</li>
          {c.failed > 0 && <li><b>{c.failed}</b> not answered (call failed)</li>}
          <li className="muted">{done} of {total} read · {credits} credits</li>
        </ul>
        <div className="actions">
          <button disabled={!closable} title={closable ? '' : 'Retry failed questions first'} onClick={() => exportCsv(req)}>Export CSV</button>
          <button disabled={!closable} onClick={() => exportXlsx(req)}>Export XLSX</button>
          {req.mode === 'sample' && (
            <>
              <button className="ghost" onClick={() => onSample('halden')}>Replay Halden Labs</button>
              <button className="ghost" onClick={() => onSample('orrin')}>Replay Orrin Freight</button>
            </>
          )}
        </div>
        {!closable && !req.running && c.failed > 0 && <p className="error">The request can't close while questions have failed calls. Open one and retry it.</p>}
      </section>

      <table className="sheet">
        <thead>
          <tr>
            <th>#</th>
            <th>Question</th>
            <th>Answer</th>
            <th>Confidence</th>
            <th>Evidence</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {req.questions.map((q, i) => {
            const r = req.results[q.id];
            return (
              <tr key={q.id} onClick={() => r && onOpen(q.id)} className={r ? `row ${r.status}` : 'row pending'}>
                <td>{i + 1}</td>
                <td className="qtext">{q.text}</td>
                <td>{r ? (r.status === 'answered' ? short(r.answerLabel) : <span className="muted">—</span>) : '…'}</td>
                <td>{r?.probability != null && r.answerLabel ? `${Math.round(r.probability * 100)}%` : ''}</td>
                <td className="ev">{r?.evidence ? `“${clip(r.evidence.quote, 70)}” · ${r.evidence.docTitle}` : ''}</td>
                <td>
                  {r ? (
                    <>
                      <span className={`pill ${r.status}`}>{STATUS_LABEL[r.status]}</span>
                      {r.status !== 'answered' && <div className="why">{r.reasons[0]?.text}{r.ownerTeam ? ` → ${r.ownerTeam}` : ''}</div>}
                      {r.fromLibrary && <div className="why">Answered by {r.fromLibrary.answeredBy}</div>}
                    </>
                  ) : (
                    <span className="muted">Reading…</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}

function Drawer({ q, r, docs, onClose, onRetry }: { q: Question; r?: QuestionResult; docs: PolicyDoc[]; onClose: () => void; onRetry: () => void }) {
  if (!r) return null;
  const doc = r.evidence ? docs.find((d) => d.id === r.evidence!.docId) : null;
  return (
    <aside className="drawer" role="dialog">
      <button className="close" onClick={onClose}>Close</button>
      <p className="muted">{q.id} · {r.controlArea ?? ''}</p>
      <h3>{q.text}</h3>
      <p>
        <span className={`pill ${r.status}`}>{STATUS_LABEL[r.status]}</span> {r.ownerTeam && <span className="muted">Owner: {r.ownerTeam}</span>}
      </p>
      {r.reasons.length > 0 && (
        <ul className="reasons">
          {r.reasons.map((x, i) => (
            <li key={i}>{x.text}</li>
          ))}
        </ul>
      )}
      {r.status === 'failed' && <button onClick={onRetry}>Retry this question</button>}

      {r.probabilities && (
        <>
          <h4>Decide: which option the policies support</h4>
          {q.choices.map((c, i) => {
            const p = r.probabilities![`option_${i + 1}`] ?? 0;
            return (
              <div key={i} className="prob">
                <span className="pbar" style={{ width: `${Math.max(2, p * 100)}%` }} />
                <span>{Math.round(p * 100)}% · {clip(c, 90)}</span>
              </div>
            );
          })}
          <div className="prob">
            <span className="pbar ne" style={{ width: `${Math.max(2, (r.probabilities['not_established'] ?? 0) * 100)}%` }} />
            <span>{Math.round((r.probabilities['not_established'] ?? 0) * 100)}% · The policies don't settle it</span>
          </div>
        </>
      )}

      {r.evidence && doc && (
        <>
          <h4>Extract: the sentence behind the answer</h4>
          <p className="muted">{doc.title}</p>
          <pre className="policy">
            {doc.text.slice(Math.max(0, r.evidence.start - 220), r.evidence.start)}
            <mark>{doc.text.slice(r.evidence.start, r.evidence.end)}</mark>
            {doc.text.slice(r.evidence.end, r.evidence.end + 220)}
          </pre>
        </>
      )}

      {r.comment && (
        <>
          <h4>Fill: comment for the customer</h4>
          <p className={r.exportBlocked && r.reasons.some((x) => x.code === 'not_grounded') ? 'blocked' : ''}>{r.comment}</p>
          {r.grounded != null && <p className="muted">Verify: {Math.round(r.grounded * 100)}% of the comment is supported by the policies.</p>}
        </>
      )}

      {r.conflict && (
        <>
          <h4>Compare: the policies disagree</h4>
          <p>“{r.conflict.a.quote}” · {r.conflict.a.docTitle}</p>
          <p>“{r.conflict.b.quote}” · {r.conflict.b.docTitle}</p>
        </>
      )}

      {r.injection && r.status === 'set_aside' && (
        <>
          <h4>Guard: instruction found in the row</h4>
          <p>“{r.injection.quote}” · {Math.round(r.injection.score * 100)}%</p>
        </>
      )}

      {r.passages.length > 0 && (
        <>
          <h4>Rerank: policy passages read</h4>
          <ul className="passages">
            {r.passages.slice(0, 5).map((p) => (
              <li key={p.id}>
                <b>{p.action}</b> {p.docTitle}: {p.heading}
              </li>
            ))}
          </ul>
        </>
      )}

      <h4>Clocked calls ({r.calls.length}, {r.credits} credits)</h4>
      {r.calls.map((c, i) => (
        <details key={i} className="call">
          <summary>
            {c.endpoint} {c.error ? `· failed: ${c.error}` : `· ${c.credits ?? '?'} credits`} {c.replayed ? '· replayed' : ''}
          </summary>
          <p className="muted">Idempotency-Key {c.idempotencyKey}</p>
          <pre>{JSON.stringify(c.request, null, 1)}</pre>
          <pre>{JSON.stringify(c.response ?? c.error, null, 1)}</pre>
        </details>
      ))}
    </aside>
  );
}

function Inbox({ req, onOpen, onAnswer }: { req: RequestState; onOpen: (id: string) => void; onAnswer: (q: Question, r: QuestionResult, choice: number, note: string) => void }) {
  const [hook, setHook] = useState(() => localStorage.getItem('trustdesk.webhook') ?? '');
  const [sent, setSent] = useState<Record<string, string>>({});
  const tasks = req.questions.map((q) => ({ q, r: req.results[q.id] })).filter((t) => t.r && t.r.status !== 'answered');
  const byTeam = useMemo(() => {
    const m = new Map<string, typeof tasks>();
    for (const t of tasks) {
      const k = t.r!.status === 'set_aside' ? 'Set aside: check with the customer' : t.r!.ownerTeam ?? 'Unassigned';
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    return [...m.entries()];
  }, [tasks]);

  async function send(q: Question, r: QuestionResult) {
    localStorage.setItem('trustdesk.webhook', hook);
    const res = await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhookUrl: hook || undefined,
        task: { request: req.title, team: r.ownerTeam, id: q.id, question: q.text, reason: r.reasons.map((x) => x.text).join(' '), link: location.href },
      }),
    });
    const body = await res.json();
    setSent((s) => ({ ...s, [q.id]: res.ok ? `Posted to ${body.channel}` : body.error }));
  }

  if (tasks.length === 0) return <main><p className="card">Nothing is waiting on an owner. Every question in this request is answered from policy.</p></main>;
  return (
    <main>
      <section className="card">
        <p>
          Each question the policies don't settle becomes a task for the team Fill picked. Answers given here go into the answer library and are used as a source
          the next time the same question comes in.
        </p>
        <label className="hook">
          Teams or Slack incoming webhook (optional)
          <input value={hook} onChange={(e) => setHook(e.target.value)} placeholder="https://hooks.slack.com/services/…" />
        </label>
      </section>
      {byTeam.map(([team, list]) => (
        <section key={team} className="card">
          <h3>{team} · {list.length}</h3>
          {list.map(({ q, r }) => (
            <Task key={q.id} q={q} r={r!} onOpen={() => onOpen(q.id)} onAnswer={onAnswer} onSend={() => send(q, r!)} sent={sent[q.id]} />
          ))}
        </section>
      ))}
    </main>
  );
}

function Task({ q, r, onOpen, onAnswer, onSend, sent }: { q: Question; r: QuestionResult; onOpen: () => void; onAnswer: (q: Question, r: QuestionResult, c: number, n: string) => void; onSend: () => void; sent?: string }) {
  const [choice, setChoice] = useState<number>(r.answerIndex ?? 0);
  const [note, setNote] = useState('');
  return (
    <div className="task">
      <p className="qtext">{q.id}. {q.text}</p>
      <p className="why">{r.reasons.map((x) => x.text).join(' ')}</p>
      {r.status !== 'set_aside' && (
        <div className="answer">
          <select value={choice} onChange={(e) => setChoice(Number(e.target.value))}>
            {q.choices.map((c, i) => (
              <option key={i} value={i}>{clip(c, 80)}</option>
            ))}
          </select>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Comment for the customer (optional)" />
          <button onClick={() => onAnswer(q, r, choice, note)}>Save answer</button>
        </div>
      )}
      <div className="actions">
        <button className="ghost" onClick={onOpen}>Show evidence</button>
        <button className="ghost" onClick={onSend}>Send to Teams/Slack</button>
        {sent && <span className="muted">{sent}</span>}
      </div>
    </div>
  );
}

function OwnPolicies({ onRun, sample, library }: { onRun: (q: Question[], d: PolicyDoc[], company: string) => void; sample: SampleRun | null; library: LibraryEntry[] }) {
  const [policyText, setPolicyText] = useState('');
  const [csv, setCsv] = useState('');
  const [err, setErr] = useState<string | null>(null);
  function loadSamplePolicies() {
    if (sample) setPolicyText(sample.docs.map((d) => d.text).join('\n\n'));
  }
  function run() {
    setErr(null);
    const docs: PolicyDoc[] = policyText
      .split(/\n(?=# )/)
      .map((t) => t.trim())
      .filter((t) => t.length > 40)
      .map((t, i) => ({ id: `policy-${i + 1}`, title: /^# +(.+)$/m.exec(t)?.[1] ?? `Policy ${i + 1}`, text: t.includes('\n## ') ? t : `# Policy ${i + 1}\n\n## Text\n${t}` }));
    if (docs.length === 0) return setErr('Paste at least one policy.');
    let qs = csv.trim() ? parseQuestionCsv(csv) : sample ? sample.questions.filter((q) => !q.id.startsWith('P')) : [];
    if (qs.length === 0) return setErr('Add questions, or leave the box empty to use the sample questions.');
    qs = qs.slice(0, 25);
    onRun(qs, docs, 'your company');
  }
  return (
    <main>
      <section className="card">
        <h2>Run it on your own policies</h2>
        <p className="muted">
          Live runs call Clocked for real and are capped at 25 questions. Paste policies as plain text or Markdown; start each policy with a "# Title" line and split sections with "## " headings.
        </p>
        <label>
          Policies
          <textarea rows={12} value={policyText} onChange={(e) => setPolicyText(e.target.value)} placeholder="# Access Control Policy&#10;&#10;## Authentication&#10;All staff use single sign-on with multi-factor authentication…" />
        </label>
        <button className="ghost" onClick={loadSamplePolicies}>Use the Halden Labs sample policies</button>
        <label>
          Questions as CSV: question, options separated by "|" (leave empty to use the sample questions)
          <textarea rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'question,options\n"Do you encrypt laptops?","Yes|No"'} />
        </label>
        <input type="file" accept=".csv,text/csv" onChange={async (e) => setCsv((await e.target.files?.[0]?.text()) ?? '')} />
        {library.length > 0 && <p className="muted">{library.length} owner answers from the answer library will be used as an extra source.</p>}
        {err && <p className="error">{err}</p>}
        <button onClick={run}>Answer the questionnaire</button>
      </section>
    </main>
  );
}

function short(s: string | null) {
  if (!s) return '';
  const first = s.split(/[,.;]/)[0];
  return first.length <= 40 ? first : clip(s, 40);
}

function clip(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
