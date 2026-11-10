import type { PolicyDoc } from '../lib/types.js';

/** An answer an owner gave in the inbox. Reused as a source the next time the question comes in. */
export interface LibraryEntry {
  question: string;
  answer: string;
  note: string;
  team: string;
  at: string;
}

const KEY = 'trustdesk.library';

export function loadLibrary(): LibraryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function addToLibrary(e: LibraryEntry): LibraryEntry[] {
  const list = [...loadLibrary().filter((x) => x.question !== e.question), e];
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage can be unavailable; the answer still applies to this request */
  }
  return list;
}

/** The library as one more policy document, one section per answered question. */
export function libraryDoc(list: LibraryEntry[]): PolicyDoc {
  const text =
    '# Answer library\n\n' +
    list
      .map((e) => `## ${e.question}\nConfirmed by ${e.team} on ${e.at.slice(0, 10)}: ${e.answer}${e.note ? ` ${e.note}` : ''}\n`)
      .join('\n');
  return { id: 'answer-library', title: 'Answer library', text };
}
