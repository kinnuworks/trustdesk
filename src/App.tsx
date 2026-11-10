import { useEffect, useMemo, useRef, useState } from 'react';
import type { Carry } from '../lib/carryover.js';
import type { PolicyDoc, Question, QuestionResult } from '../lib/types.js';
import { exportCsv, exportXlsx } from './export.js';
import { AppMark, Icon } from './icons.js';
import { addToLibrary, libraryDoc, loadLibrary, type LibraryEntry } from './library.js';
import { answerLive, loadSample, parseQuestionCsv, replaySample, runLive, type SampleRun } from './run.js';
import { Sections } from './Sections.js';
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
  carry?: Record<string, Carry>;
}

const STATUS_LABEL: Record<string, string> = {
  answered: 'Answered',
  owner: 'Needs owner',
  set_aside: 'Set aside',
  failed: 'Call failed',
};

export default function App() {
  const [tab, setTab] = useState<Tab>('request');
  const [req, setReq] = useState<RequestState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryEntry[]>(loadLibrary());
  const [sample, setSample] = useState<SampleRun | null>(null);
  const appRef = useRef<HTMLDivElement>(null);

  async function startSample(pack = 'halden') {
    setError(null);
    setTab('request');
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
        carry: s.carry,
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

  function goToApp(t: Tab) {
    setTab(t);
    appRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function startLive(questions: Question[], docs: PolicyDoc[], company: string) {
    const runId = `live-${Date.now()}`;
    const withLibrary = library.length ? [...docs, libraryDoc(library)] : docs;
    setReq({ title: `Your questionnaire, ${questions.length} questions`, company, questions, docs: withLibrary, results: {}, runId, mode: 'live', running: true });
    setTab('request');
    await runLive(questions, withLibrary, runId, (r) => setReq((p) => (p ? { ...p, results: { ...p.results, [r.questionId]: r } } : p)));
    setReq((p) => (p ? { ...p, running: false } : p));
  }

  async function retry(q: Question) {
    if (!req) return;
    if (req.mode === 'sample' && sample) {
      const one = await replaySample({ ...sample, questions: [q] }, () => {});
      setReq((p) => (p ? { ...p, results: { ...p.results, [q.id]: one[0] } } : p));
      return;
    }
    const r = await answerLive(q, req.docs, req.runId);
    setReq((p) => (p ? { ...p, results: { ...p.results, [q.id]: r } } : p));
  }

  function ownerAnswer(q: Question, r: QuestionResult, choice: number, note: string) {
    const entry: LibraryEntry = { question: q.text, answer: q.choices[choice], note, team: r.ownerTeam ?? 'Security & IT', at: new Date().toISOString() };
    setLibrary(addToLibrary(entry));
    setReq((p) =>
      p
        ? {
            ...p,
            results: {
              ...p.results,
              [q.id]: { ...r, status: 'answered', answerIndex: choice, answerLabel: q.choices[choice], comment: note || r.comment, exportBlocked: false, fromLibrary: { answeredBy: entry.team, answeredAt: entry.at } },
            },
          }
        : p,
    );
  }

  const rowNo = useMemo(() => new Map(req?.questions.map((q, i) => [q.id, i + 1]) ?? []), [req?.questions]);
  const open = req && openId ? req.questions.find((q) => q.id === openId) ?? null : null;
  const waiting = req ? Object.values(req.results).filter((r) => r.status !== 'answered').length : 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenId(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <nav className="nav" aria-label="Main">
        <div className="nav__bar">
          <a className="nav__brand" href="#top"><AppMark /> TrustDesk</a>
          <div className="nav__links">
            <a href="#how">How it works</a>
            <a href="#results">Results</a>
            <a href="#failures">When it can't answer</a>
            <a href="#faq">FAQ</a>
          </div>
          <button className="btn btn-ink btn-sm" onClick={() => goToApp('own')}>Try your policies</button>
        </div>
      </nav>

      <header className="hero" id="top">
        <div className="container">
          <span className="badge"><span className="badge__tag">Built on Clocked</span><span className="badge__text">Every answer cites the policy sentence behind it</span></span>
          <h1>
            Security questionnaires, answered from <span className="hl">your policies</span>.
          </h1>
          <p className="lead">
            TrustDesk reads each question, quotes the sentence that answers it, and checks that quote twice. Anything your policies don't settle goes to the team that owns it, with the reason attached.
          </p>
          <div className="cta-row">
            <button className="btn btn-candy btn-lg" onClick={() => { goToApp('request'); startSample('halden'); }}>
              <Icon.play /> Watch it answer 40 questions
            </button>
            <button className="btn btn-outline btn-lg" onClick={() => goToApp('own')}>Run it on your policies</button>
          </div>
          <p className="trust">
            <span>No sign-up</span>
            <span>Sample replays a recorded live run</span>
            <span>Live mode calls Clocked for real</span>
          </p>
        </div>

        <div className="container hero__visual bleed" ref={appRef} id="app">
          <div className="stage">
            <div className="window appwin">
              <div className="window__bar">
                <div className="lights" aria-hidden="true"><i /><i /><i /></div>
                <span className="window__title">{req?.title ?? 'TrustDesk'}</span>
              </div>
              <div className="toolbar">
                <div className="segmented" role="tablist">
                  <button role="tab" aria-selected={tab === 'request'} onClick={() => setTab('request')}>Request</button>
                  <button role="tab" aria-selected={tab === 'inbox'} onClick={() => setTab('inbox')}>
                    Inbox {waiting > 0 && <span className="count">{waiting}</span>}
                  </button>
                  <button role="tab" aria-selected={tab === 'own'} onClick={() => setTab('own')}>Your policies</button>
                </div>
                {req?.mode === 'sample' && tab === 'request' && (
                  <div className="chips" aria-label="Sample company">
                    <button className="chip" aria-pressed={req.company === 'Halden Labs'} onClick={() => startSample('halden')}>Halden Labs</button>
                    <button className="chip" aria-pressed={req.company === 'Orrin Freight'} onClick={() => startSample('orrin')}>Orrin Freight</button>
                  </div>
                )}
              </div>
              <div className="appbody">
                {error && <p className="err">{error}</p>}
                {tab === 'request' && req && <RequestView req={req} rowNo={rowNo} onOpen={setOpenId} />}
                {tab === 'inbox' && req && <Inbox req={req} rowNo={rowNo} onOpen={setOpenId} onAnswer={ownerAnswer} />}
                {tab === 'own' && <OwnPolicies onRun={startLive} sample={sample} library={library} />}
              </div>
            </div>
          </div>
        </div>
      </header>

      <Sections />

      {open && req && (
        <>
          <div className="scrim" onClick={() => setOpenId(null)} />
          <Drawer q={open} n={rowNo.get(open.id) ?? 0} r={req.results[open.id]} docs={req.docs} onClose={() => setOpenId(null)} onRetry={() => retry(open)} />
        </>
      )}
    </>
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

function RequestView({ req, rowNo, onOpen }: { req: RequestState; rowNo: Map<string, number>; onOpen: (id: string) => void }) {
  const c = counts(req);
  const total = req.questions.length;
  const credits = Object.values(req.results).reduce((s, r) => s + r.credits, 0);
  const canExport = !req.running && c.failed === 0 && c.pending === 0;
  const state = req.running ? 'Answering' : c.failed ? 'Blocked: calls failed' : c.owner + c.set_aside ? 'Waiting on owners' : 'Ready to send';
  const pct = (n: number) => `${(100 * n) / total}%`;
  return (
    <div className="req">
      <div className="req__head">
        <div>
          <p className="req__meta">
            {req.mode === 'sample'
              ? `${total} questions from Google's open VSAQ questionnaire · ${req.docs.length} policies of ${req.company}, a fictional company · replayed from a recorded live run`
              : `Live run on your policies`}
          </p>
          <div className="req__counts">
            <Stat n={c.answered} label="answered from policy" kind="ok" />
            <Stat n={c.owner} label="need an owner" kind="own" />
            <Stat n={c.set_aside} label="set aside" kind="set" />
            {c.failed > 0 && <Stat n={c.failed} label="calls failed" kind="fail" />}
          </div>
        </div>
        <div className="req__side">
          <span className={`statechip ${state === 'Ready to send' ? 'ok' : state.startsWith('Blocked') ? 'fail' : ''}`}>{state}</span>
          <span className="t-mono req__credits">{total - c.pending}/{total} read · {credits} credits</span>
        </div>
      </div>
      <div className="bar" aria-hidden="true">
        <span className="b ok" style={{ width: pct(c.answered) }} />
        <span className="b own" style={{ width: pct(c.owner) }} />
        <span className="b set" style={{ width: pct(c.set_aside) }} />
        <span className="b fail" style={{ width: pct(c.failed) }} />
      </div>
      {req.carry && <CarryLine carry={req.carry} />}

      <div className="sheet" role="table" aria-label="Questionnaire">
        <div className="sheet__row sheet__head" role="row">
          <span role="columnheader">#</span>
          <span role="columnheader">Question</span>
          <span role="columnheader">Answer</span>
          <span role="columnheader">Source</span>
          <span role="columnheader">Status</span>
        </div>
        {req.questions.map((q) => {
          const r = req.results[q.id];
          return (
            <button key={q.id} role="row" className={`sheet__row ${r ? r.status : 'pending'}`} onClick={() => r && onOpen(q.id)} disabled={!r}>
              <span className="n t-mono">{rowNo.get(q.id)}</span>
              <span className="q">{q.text}</span>
              <span className="a">
                {r?.status === 'answered' ? (
                  <>
                    <b>{short(r.answerLabel)}</b>
                    {r.probability != null && <span className="conf t-mono">{Math.round(r.probability * 100)}%</span>}
                  </>
                ) : r ? (
                  <span className="dim">blank</span>
                ) : (
                  <span className="shimmer" />
                )}
              </span>
              <span className="src">
                {r?.evidence && r.status === 'answered' ? (
                  <>
                    <span className="srcq">“{clip(r.evidence.quote, 80)}”</span>
                    <span className="srcd">{r.evidence.docTitle.replace(/^(Halden Labs|Orrin Freight) /, '')}</span>
                  </>
                ) : r && r.status !== 'answered' ? (
                  <span className="why">{r.reasons[0]?.text}</span>
                ) : null}
              </span>
              <span className="st">
                {r ? <span className={`pill ${r.status}`}>{r.fromLibrary ? 'Owner answered' : STATUS_LABEL[r.status]}</span> : <span className="dim">Reading</span>}
                {r && r.status !== 'answered' && r.ownerTeam && <span className="teamname">{r.ownerTeam}</span>}
              </span>
            </button>
          );
        })}
      </div>

      <div className="req__foot">
        <span className="t-small">
          {canExport ? 'Blank rows export empty, with the reason in the status column.' : c.failed ? "The request can't be exported while a call has failed. Open the row and retry it." : 'Export unlocks when every row is read.'}
        </span>
        <div className="req__actions">
          <button className="btn btn-outline btn-sm" disabled={!canExport} onClick={() => exportCsv(req)}><Icon.download /> CSV</button>
          <button className="btn btn-ink btn-sm" disabled={!canExport} onClick={() => exportXlsx(req)}><Icon.download /> Excel</button>
        </div>
      </div>
    </div>
  );
}

function Stat({ n, label, kind }: { n: number; label: string; kind: string }) {
  return (
    <span className="stat">
      <span className={`sdot ${kind}`} />
      <b className="t-mono">{n}</b> {label}
    </span>
  );
}

function CarryLine({ carry }: { carry: Record<string, Carry> }) {
  const list = Object.values(carry);
  const n = (k: string) => list.filter((c) => c.kind === k).length;
  return (
    <p className="carry">
      <Icon.retry />
      <span>
        Against last year's completed sheet: <b>{n('same')}</b> questions ask the same thing, <b>{n('changed')}</b> changed in a way that matters, <b>{n('new')}</b> are new. Next year only the changed and new ones need a full read.
      </span>
    </p>
  );
}

function Drawer({ q, n, r, docs, onClose, onRetry }: { q: Question; n: number; r?: QuestionResult; docs: PolicyDoc[]; onClose: () => void; onRetry: () => void }) {
  if (!r) return null;
  const doc = r.evidence ? docs.find((d) => d.id === r.evidence!.docId) : null;
  return (
    <aside className="drawer" role="dialog" aria-label={`Question ${n}`}>
      <div className="drawer__top">
        <span className="t-mono dim">Row {n}{r.controlArea ? ` · ${r.controlArea}` : ''}</span>
        <button className="iconbtn" onClick={onClose} aria-label="Close"><Icon.x /></button>
      </div>
      <h3 className="drawer__q">{q.text}</h3>
      <div className="drawer__status">
        <span className={`pill ${r.status}`}>{r.fromLibrary ? 'Owner answered' : STATUS_LABEL[r.status]}</span>
        {r.ownerTeam && <span className="dim">Owner: {r.ownerTeam}</span>}
      </div>
      {r.status === 'answered' && r.answerLabel && <p className="drawer__answer">{r.answerLabel}</p>}
      {r.reasons.length > 0 && (
        <ul className="reasons">
          {r.reasons.map((x, i) => <li key={i}>{x.text}</li>)}
        </ul>
      )}
      {r.status === 'failed' && <button className="btn btn-ink btn-sm" onClick={onRetry}><Icon.retry /> Retry with the same request key</button>}

      {r.probabilities && (
        <Block step="Decide" title="Which option the policies support">
          {q.choices.map((c, i) => {
            const p = r.probabilities![`option_${i + 1}`] ?? 0;
            return <Prob key={i} p={p} label={c} chosen={r.answerIndex === i} />;
          })}
          <Prob p={r.probabilities['not_established'] ?? 0} label="The policies don't settle it" muted />
        </Block>
      )}

      {r.evidence && doc && (
        <Block step="Extract" title="The sentence behind the answer">
          <p className="dim small">{doc.title}</p>
          <pre className="policy">
            {doc.text.slice(Math.max(0, r.evidence.start - 200), r.evidence.start)}
            <mark>{doc.text.slice(r.evidence.start, r.evidence.end)}</mark>
            {doc.text.slice(r.evidence.end, r.evidence.end + 200)}
          </pre>
          {r.secondReading !== undefined && (
            <p className="small">
              Second reader, from this sentence alone: <b>{r.secondReading ? short(r.secondReading) : "doesn't settle it"}</b>
            </p>
          )}
        </Block>
      )}

      {r.comment && (
        <Block step="Fill" title="Comment for the customer">
          <p className={r.reasons.some((x) => x.code === 'not_grounded') ? 'blocked' : ''}>{r.comment}</p>
          {r.grounded != null && <p className="small dim">Verify: {Math.round(r.grounded * 100)}% of this comment is supported by the policies.</p>}
        </Block>
      )}

      {r.conflict && (
        <Block step="Compare" title="Two policies disagree">
          <p className="quote">“{r.conflict.a.quote}”<span>{r.conflict.a.docTitle}</span></p>
          <p className="quote">“{r.conflict.b.quote}”<span>{r.conflict.b.docTitle}</span></p>
        </Block>
      )}

      {r.injection && r.status === 'set_aside' && (
        <Block step="Guard" title="Instruction found in the row">
          <p className="quote">“{r.injection.quote ?? q.text}”<span>{Math.round(r.injection.score * 100)}% likely an instruction</span></p>
        </Block>
      )}

      {r.passages.length > 0 && (
        <Block step="Rerank" title="Policy passages read">
          <ul className="passages">
            {r.passages.slice(0, 5).map((p) => (
              <li key={p.id}><span className={`act ${p.action}`}>{p.action}</span>{p.docTitle.replace(/^(Halden Labs|Orrin Freight) /, '')}: {p.heading}</li>
            ))}
          </ul>
        </Block>
      )}

      <Block step="Raw" title={`${r.calls.length} Clocked calls · ${r.credits} credits`}>
        {r.calls.map((c, i) => (
          <details key={i} className="call">
            <summary>
              <span className="t-mono">/{c.endpoint}</span>
              <span className="dim">{c.error ? `failed: ${c.error}` : `${c.credits ?? '?'} credits${c.replayed ? ' · replayed' : ''}`}</span>
            </summary>
            <p className="dim small t-mono">Idempotency-Key {c.idempotencyKey}</p>
            <pre>{JSON.stringify(c.request, null, 1)}</pre>
            <pre>{JSON.stringify(c.response ?? c.error, null, 1)}</pre>
          </details>
        ))}
      </Block>
    </aside>
  );
}

function Block({ step, title, children }: { step: string; title: string; children: React.ReactNode }) {
  return (
    <section className="block">
      <h4><span className="step t-mono">{step}</span>{title}</h4>
      {children}
    </section>
  );
}

function Prob({ p, label, chosen, muted }: { p: number; label: string; chosen?: boolean; muted?: boolean }) {
  return (
    <div className={`prob ${chosen ? 'chosen' : ''} ${muted ? 'muted' : ''}`}>
      <span className="prob__fill" style={{ width: `${Math.max(1.5, p * 100)}%` }} />
      <span className="prob__p t-mono">{Math.round(p * 100)}%</span>
      <span className="prob__l">{clip(label, 110)}</span>
    </div>
  );
}

function Inbox({ req, rowNo, onOpen, onAnswer }: { req: RequestState; rowNo: Map<string, number>; onOpen: (id: string) => void; onAnswer: (q: Question, r: QuestionResult, choice: number, note: string) => void }) {
  const [hook, setHook] = useState(() => {
    try {
      return localStorage.getItem('trustdesk.webhook') ?? '';
    } catch {
      return '';
    }
  });
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
    try {
      localStorage.setItem('trustdesk.webhook', hook);
    } catch {
      /* not essential */
    }
    const res = await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhookUrl: hook || undefined,
        task: { request: req.title, team: r.ownerTeam, id: String(rowNo.get(q.id)), question: q.text, reason: r.reasons.map((x) => x.text).join(' '), link: location.href },
      }),
    });
    const body = await res.json().catch(() => ({}));
    setSent((s) => ({ ...s, [q.id]: res.ok ? `Posted to ${body.channel}` : body.error ?? 'Could not post' }));
  }

  if (tasks.length === 0) return <div className="empty">Nothing is waiting on an owner. Every question in this request is answered from policy.</div>;
  return (
    <div className="inbox">
      <div className="inbox__intro">
        <p className="t-small">
          Questions the policies don't settle become tasks for the team that Fill picked. An answer saved here goes into the answer library and is used as a source the next time the question comes in.
        </p>
        <label className="field">
          <span>Teams or Slack incoming webhook (optional)</span>
          <input value={hook} onChange={(e) => setHook(e.target.value)} placeholder="https://hooks.slack.com/services/…" />
        </label>
      </div>
      {byTeam.map(([team, list]) => (
        <section key={team} className="teamgroup">
          <h4>{team} <span className="t-mono dim">{list.length}</span></h4>
          {list.map(({ q, r }) => (
            <Task key={q.id} n={rowNo.get(q.id) ?? 0} q={q} r={r!} onOpen={() => onOpen(q.id)} onAnswer={onAnswer} onSend={() => send(q, r!)} sent={sent[q.id]} />
          ))}
        </section>
      ))}
    </div>
  );
}

function Task({ n, q, r, onOpen, onAnswer, onSend, sent }: { n: number; q: Question; r: QuestionResult; onOpen: () => void; onAnswer: (q: Question, r: QuestionResult, c: number, n: string) => void; onSend: () => void; sent?: string }) {
  // No one-click suggestion when two policies disagree: a person has to settle which one is right.
  const suggested = r.status === 'owner' && r.answerIndex != null && !r.conflict ? r.answerIndex : null;
  const [editing, setEditing] = useState(suggested == null);
  const [choice, setChoice] = useState<number>(r.answerIndex ?? 0);
  const [note, setNote] = useState('');
  return (
    <div className="task">
      <p className="task__q"><span className="t-mono dim">{n}</span> {q.text}</p>
      <p className="why">{r.reasons.map((x) => x.text).join(' ')}</p>
      {suggested != null && !editing && (
        <div className="suggest">
          <div>
            <p className="small dim">Suggested answer. Check the quote before you confirm.</p>
            <p className="suggest__a">{clip(q.choices[suggested], 120)}</p>
            {r.evidence && <p className="small">“{clip(r.evidence.quote, 140)}” <span className="dim">{r.evidence.docTitle}</span></p>}
          </div>
          <div className="suggest__btns">
            <button className="btn btn-candy btn-sm" onClick={() => onAnswer(q, r, suggested, r.comment ?? '')}>Confirm</button>
            <button className="btn btn-outline btn-sm" onClick={() => setEditing(true)}>Change</button>
          </div>
        </div>
      )}
      {r.status !== 'set_aside' && editing && (
        <div className="task__answer">
          <select value={choice} onChange={(e) => setChoice(Number(e.target.value))} aria-label="Answer">
            {q.choices.map((c, i) => <option key={i} value={i}>{clip(c, 80)}</option>)}
          </select>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Comment for the customer (optional)" aria-label="Comment" />
          <button className="btn btn-ink btn-sm" onClick={() => onAnswer(q, r, choice, note)}>Save answer</button>
        </div>
      )}
      <div className="task__actions">
        <button className="linkbtn" onClick={onOpen}>Show evidence</button>
        <button className="linkbtn" onClick={onSend}><Icon.send /> Send to Teams or Slack</button>
        {sent && <span className="small dim">{sent}</span>}
      </div>
    </div>
  );
}

function OwnPolicies({ onRun, sample, library }: { onRun: (q: Question[], d: PolicyDoc[], company: string) => void; sample: SampleRun | null; library: LibraryEntry[] }) {
  const [policyText, setPolicyText] = useState('');
  const [csv, setCsv] = useState('');
  const [err, setErr] = useState<string | null>(null);
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
    <div className="ownp">
      <div className="ownp__intro">
        <h3 className="t-title">Run it on your own policies</h3>
        <p className="t-small">
          Live runs call Clocked for real, up to 25 questions. Start each policy with a "# Title" line and split sections with "## " headings. Nothing is stored on the server.
        </p>
      </div>
      <label className="field">
        <span>Policies</span>
        <textarea rows={10} value={policyText} onChange={(e) => setPolicyText(e.target.value)} placeholder={'# Access Control Policy\n\n## Authentication\nAll staff use single sign-on with multi-factor authentication.'} />
      </label>
      <button className="linkbtn" onClick={() => sample && setPolicyText(sample.docs.map((d) => d.text).join('\n\n'))}>Use the Halden Labs sample policies</button>
      <label className="field">
        <span>Questions as CSV: question, then options separated by "|". Leave empty to use the sample questions.</span>
        <textarea rows={4} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'question,options\n"Do you encrypt laptops?","Yes|No"'} />
      </label>
      <input className="file" type="file" accept=".csv,text/csv" onChange={async (e) => setCsv((await e.target.files?.[0]?.text()) ?? '')} />
      {library.length > 0 && <p className="small dim">{library.length} owner answers from the answer library will be used as an extra source.</p>}
      {err && <p className="err">{err}</p>}
      <div>
        <button className="btn btn-candy" onClick={run}>Answer the questionnaire <Icon.arrow /></button>
      </div>
    </div>
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
