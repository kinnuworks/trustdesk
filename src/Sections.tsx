import { useEffect } from 'react';
import { AppMark, Icon } from './icons.js';

const REPO = 'https://github.com/kinnuworks/trustdesk';

const STEPS = [
  { icon: Icon.shield, ep: 'Guard', path: '/injection', title: 'Screen the row', text: 'A row that tries to instruct the tool is set aside and never answered.' },
  { icon: Icon.search, ep: 'Rerank', path: '/rerank', title: 'Find the policy', text: 'If every passage comes back "skip", the question goes to an owner as "No policy covers this."' },
  { icon: Icon.check, ep: 'Decide', path: '/decide', title: 'Pick the answer', text: "Chooses one of the questionnaire's own options or \"not established\". Under 70% goes to an owner." },
  { icon: Icon.quote, ep: 'Extract', path: '/extract', title: 'Quote the evidence', text: 'The exact supporting sentence, highlighted in place. No sentence means a person decides.' },
  { icon: Icon.eyes, ep: 'Decide', path: '/decide', title: 'Read it again', text: 'A second reader picks the option from that sentence alone. If the two disagree, an owner decides.' },
  { icon: Icon.form, ep: 'Fill', path: '/fill', title: 'Fill the record', text: 'Owner team, control area and a short comment. The owner team decides whose inbox a task lands in.' },
  { icon: Icon.verify, ep: 'Verify', path: '/grounding', title: 'Check the comment', text: 'Any claim the policies do not support blocks that comment from export.' },
  { icon: Icon.split, ep: 'Compare', path: '/compare', title: 'Catch conflicts', text: 'When the evidence spans two policies, a conflict shows both quotes and goes to an owner.' },
];

const FAQ = [
  ['Is the sample on the first screen real?', "Yes. It is a recorded live run against Clocked. Your browser runs the same engine again and answers each Clocked call from the recorded response, so the routing rules run in front of you. Click any row and open the raw calls to see every request and response."],
  ['What happens when Clocked is unsure?', 'The cell stays blank and the question becomes a task for the owning team, with the reason in plain words: low confidence, no supporting sentence, two readers disagreeing, an unsupported comment, or two policies that conflict.'],
  ['What if a call fails?', 'The row shows "Call failed" and nothing is filled. Retry sends the same Idempotency-Key, so Clocked runs and bills the work once. The questionnaire cannot be exported while any row is in that state.'],
  ['Why do so many questions go to an owner?', 'TrustDesk would rather ask than guess. In our test set 11 of the 21 owner tasks were questions our labels say the policies settle. When Decide already has an answer, the task shows it with its quote and the owner confirms it with one click. Only one of 53 automatic answers was wrong.'],
  ['Can I run it on my own policies?', 'Yes. Open "Your policies", paste policy text and a CSV of up to 25 questions. The run calls Clocked live through a server route that keeps the key private. Nothing is stored on the server.'],
  ['Where do the questions come from?', "Google's open-source VSAQ questionnaire (Apache 2.0). The two companies, Halden Labs and Orrin Freight, are fictional, and their policies are synthetic."],
];

export function Sections() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }),
      { rootMargin: '0px 0px -8% 0px' },
    );
    els.forEach((el) => io.observe(el));
    // Safety net: if the observer never fires (embedded previews, odd zoom), show everything anyway.
    const reveal = () => els.forEach((el) => { if (el.getBoundingClientRect().top < innerHeight) el.classList.add('in'); });
    addEventListener('scroll', reveal, { passive: true });
    const t = setTimeout(() => els.forEach((el) => el.classList.add('in')), 2500);
    return () => { io.disconnect(); removeEventListener('scroll', reveal); clearTimeout(t); };
  }, []);

  return (
    <>
      <section className="section section--alt after-bleed" id="how">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow"><span className="dot" /> How it works</span>
            <h2>Eight checks per question. <span className="t-muted">Code decides what happens next.</span></h2>
            <p className="lead">Clocked returns decisions with probabilities and quotes with exact offsets. TrustDesk turns each of those into a fixed rule, so an answer is only filled when every check agrees.</p>
          </div>
          <div className="steps">
            {STEPS.map((s, i) => (
              <div className="tile stepcard reveal" key={i} style={{ ['--i' as string]: i % 4 }}>
                <span className="icon-tile"><s.icon /></span>
                <div>
                  <p className="step__ep"><span className="t-mono">{String(i + 1).padStart(2, '0')}</span> {s.ep} <span className="t-mono dim">{s.path}</span></p>
                  <p className="t-title">{s.title}</p>
                  <p>{s.text}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="extras grid grid-2">
            <div className="card reveal">
              <span className="icon-tile"><Icon.inbox /></span>
              <p className="t-title">Answer library</p>
              <p className="t-small">An owner's answer becomes a source. The next questionnaire that asks the same thing is answered from it, with the owner's name as evidence.</p>
            </div>
            <div className="card reveal" style={{ ['--i' as string]: 1 }}>
              <span className="icon-tile"><Icon.retry /></span>
              <p className="t-title">Last year's sheet</p>
              <p className="t-small">Rerank finds the closest question from last year's completed questionnaire and Compare says if it is the same, changed or new. Only "same" can reuse the old answer.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="results">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow"><span className="dot" /> Results</span>
            <h2>Measured on 74 labelled questions. <span className="t-muted">Then we tried to break it.</span></h2>
            <p className="lead">Two fictional companies, one with a strong security program and one with a weak one, against 37 VSAQ questions each, plus 3 planted rows that try to instruct the tool.</p>
          </div>
          <div className="bento">
            <div className="span-3 is-accent reveal">
              <span className="big t-mono">52 / 53</span>
              <p className="t-title">automatic answers matched our labels</p>
              <p className="bento__note">The one miss: a leaver policy with no time limit was still answered "Yes".</p>
            </div>
            <div className="span-3 reveal" style={{ ['--i' as string]: 1 }}>
              <span className="big t-mono">10 / 11</span>
              <p className="t-title">questions that needed a person got one</p>
              <p className="t-small">The cost is 21 owner tasks, 11 of them unneeded by our labels. 6 of those 11 already show the right answer and its quote, so the owner clicks Confirm.</p>
            </div>
            <div className="span-2 reveal">
              <span className="big t-mono">25 / 29</span>
              <p className="t-title">went to an owner when we deleted the quoted sentence</p>
              <p className="t-small">3 found another sentence that supports them. 1 was wrong.</p>
            </div>
            <div className="span-2 reveal" style={{ ['--i' as string]: 1 }}>
              <span className="big t-mono">27 / 30</span>
              <p className="t-title">planted instruction rows set aside by Guard</p>
              <p className="t-small">The 3 it missed changed no answer. 1 false alarm in 152 real questions.</p>
            </div>
            <div className="span-2 reveal" style={{ ['--i' as string]: 2 }}>
              <span className="big t-mono">152</span>
              <p className="t-title">VSAQ questions in one run</p>
              <p className="t-small">136 s and 2,333 credits. 40 rows take about 40 s.</p>
            </div>
          </div>
          <p className="t-small center">Labels are ours and the data is synthetic. Full output is in the repository's eval folder.</p>
        </div>
      </section>

      <section className="section section--alt" id="failures">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow"><span className="dot" /> When it can't answer</span>
            <h2>When it can't answer, the cell stays blank. <span className="t-muted">The reason goes with it.</span></h2>
          </div>
          <div className="grid grid-3">
            <div className="card reveal">
              <span className="pill owner">Needs owner</span>
              <p className="t-title">Uncertain</p>
              <p className="t-small">Confidence under 70%, or the two readers disagree. The task goes to the team Fill picked, and can be posted to a Teams or Slack channel.</p>
            </div>
            <div className="card reveal" style={{ ['--i' as string]: 1 }}>
              <span className="pill set_aside">Set aside</span>
              <p className="t-title">Missing or suspicious</p>
              <p className="t-small">No passage, "not established", or no supporting sentence: a person decides. A row that tries to instruct the tool is never answered.</p>
            </div>
            <div className="card reveal" style={{ ['--i' as string]: 2 }}>
              <span className="pill failed">Call failed</span>
              <p className="t-title">Failed</p>
              <p className="t-small">Nothing is filled. Retry reuses the same Idempotency-Key, and export stays locked until every failed row is resolved.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="faq">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow"><span className="dot" /> Questions</span>
            <h2>Before you trust it.</h2>
          </div>
          <div className="faq">
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--alt final">
        <div className="container center">
          <AppMark size={88} />
          <h2>Answer the next one from policy. <span className="t-muted">Send the rest to its owner.</span></h2>
          <div className="cta-row">
            <a className="btn btn-candy btn-lg" href="#app">Try it on this page</a>
            <a className="btn btn-outline btn-lg" href={REPO} target="_blank" rel="noreferrer"><Icon.github /> Source and evals</a>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container">
          <span className="nav__brand"><AppMark size={22} /> TrustDesk</span>
          <span>Built on Clocked for the Clocked Build Challenge · Questions from Google VSAQ, Apache 2.0 · Halden Labs and Orrin Freight are fictional</span>
          <span>Made by Kinnu</span>
        </div>
      </footer>
    </>
  );
}
