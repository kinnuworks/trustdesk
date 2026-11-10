// Shared types for the questionnaire engine, used by the API, the browser and the scripts.

export interface Question {
  id: string;
  text: string;
  /** The answer options the questionnaire offers, in order. */
  choices: string[];
  section?: string;
}

export interface PolicyDoc {
  id: string;
  title: string;
  text: string;
}

export interface Passage {
  id: string;
  docId: string;
  docTitle: string;
  heading: string;
  /** Offset of this passage inside its policy document. */
  start: number;
  text: string;
}

export type Endpoint = 'decide' | 'extract' | 'fill' | 'grounding' | 'compare' | 'rerank' | 'injection';

/** One Clocked call as the app made it, kept so every cell can show its raw request and response. */
export interface CallRecord {
  endpoint: Endpoint;
  request: unknown;
  response?: unknown;
  error?: string;
  credits: number | null;
  modelMs: number | null;
  idempotencyKey: string;
  replayed: boolean;
}

export type Status =
  | 'answered' // filled automatically, every check agreed
  | 'owner' // needs a person; see reasons
  | 'set_aside' // the row itself looked like an instruction to the tool
  | 'failed'; // a Clocked call failed; nothing was filled

export type ReasonCode =
  | 'injection'
  | 'no_policy'
  | 'not_established'
  | 'low_confidence'
  | 'no_evidence'
  | 'evidence_disagrees'
  | 'not_grounded'
  | 'conflict'
  | 'call_failed';

export interface Reason {
  code: ReasonCode;
  text: string;
}

export interface Evidence {
  quote: string;
  docId: string;
  docTitle: string;
  /** Offsets inside the policy document, for highlighting. */
  start: number;
  end: number;
}

export interface ConflictNote {
  a: { docTitle: string; quote: string };
  b: { docTitle: string; quote: string };
}

export interface QuestionResult {
  questionId: string;
  status: Status;
  reasons: Reason[];
  /** Index into question.choices, or null when nothing was chosen. */
  answerIndex: number | null;
  answerLabel: string | null;
  probability: number | null;
  probabilities: Record<string, number> | null;
  /** The option a second reading picked from the quoted sentence alone. */
  secondReading?: string | null;
  evidence: Evidence | null;
  /** Every supporting sentence Extract returned, first one highlighted. */
  evidenceAll?: string[];
  ownerTeam: string | null;
  controlArea: string | null;
  comment: string | null;
  grounded: number | null;
  /** True when export must leave this answer out. */
  exportBlocked: boolean;
  conflict: ConflictNote | null;
  passages: { id: string; docTitle: string; heading: string; action: string; score: number }[];
  injection: { score: number; verdict: string; quote?: string } | null;
  calls: CallRecord[];
  credits: number;
  ms: number;
  /** Set when the answer came from the answer library instead of the policies. */
  fromLibrary?: { answeredBy: string; answeredAt: string };
}

export const OWNER_TEAMS = [
  'Security & IT',
  'Platform Engineering',
  'Legal & Privacy',
  'People & HR',
] as const;

export const CONTROL_AREAS = [
  'Governance & audits',
  'Access & identity',
  'Network & infrastructure',
  'Logging & monitoring',
  'Incident response',
  'Endpoints & devices',
  'Vendors & contracts',
  'People & training',
  'Physical security',
  'Application security',
] as const;
