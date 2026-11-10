import type { Question } from './types.js';

export interface VsaqRow {
  n: number;
  question: string;
  choices: string[];
  source: string;
}

export function questionsFromVsaq(rows: VsaqRow[]): Question[] {
  return rows.map((r) => ({ id: `Q${r.n}`, text: r.question, choices: r.choices, section: r.source }));
}

/** Label is a choice index, or "owner" when a person should answer. */
export type Label = number | 'owner';
