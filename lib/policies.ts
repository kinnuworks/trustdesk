import type { Passage, PolicyDoc } from './types.js';

/**
 * Split each policy into passages at its "## " headings. Passages keep their offset inside the
 * original document so a quoted sentence can be highlighted in place.
 */
export function chunkPolicies(docs: PolicyDoc[]): Passage[] {
  const passages: Passage[] = [];
  for (const doc of docs) {
    const re = /^## +(.+)$/gm;
    const marks: { heading: string; start: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(doc.text))) marks.push({ heading: m[1].trim(), start: m.index });
    if (marks.length === 0) marks.push({ heading: doc.title, start: 0 });
    marks.forEach((mark, i) => {
      const end = i + 1 < marks.length ? marks[i + 1].start : doc.text.length;
      const text = doc.text.slice(mark.start, end).trim();
      if (text.replace(/^## .*$/m, '').trim().length < 20) return;
      passages.push({
        id: `${doc.id}#${i + 1}`,
        docId: doc.id,
        docTitle: doc.title,
        heading: mark.heading,
        start: doc.text.indexOf(text, mark.start),
        text,
      });
    });
  }
  return passages;
}

/** Title from the first "# " line, or the file name. */
export function policyFromMarkdown(id: string, text: string): PolicyDoc {
  const t = /^# +(.+)$/m.exec(text);
  return { id, title: t ? t[1].trim() : id, text };
}
