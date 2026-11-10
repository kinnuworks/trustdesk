import type { CallRecord, Endpoint } from './types.js';

/** What the engine needs from Clocked: one POST per endpoint. */
export interface CallResult<T = any> {
  data: T;
  credits: number | null;
  modelMs: number | null;
  idempotencyKey: string;
  replayed: boolean;
}

export interface ClockedLike {
  call<T = any>(endpoint: Endpoint, body: object, idempotencyKey: string): Promise<CallResult<T>>;
}

/** Deterministic JSON so the same request always hashes the same way. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(',')}}`;
}

/** FNV-1a, 64-bit, as hex. Works the same in the browser and in Node. */
export function hash(s: string): string {
  let h = 0xcbf29ce484222325n;
  const p = 0x100000001b3n;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * p) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}

export function requestHash(endpoint: Endpoint, body: object): string {
  return hash(`${endpoint}:${stableStringify(body)}`);
}

/**
 * A UUID-shaped idempotency key derived from the request and a run id. Retrying the same request in
 * the same run reuses the key, so Clocked runs and bills it once.
 */
export function idempotencyKeyFor(endpoint: Endpoint, body: object, runId: string): string {
  const a = hash(`${runId}:${endpoint}:${stableStringify(body)}`);
  const b = hash(`${a}:${runId}`);
  const x = (a + b).slice(0, 32);
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-4${x.slice(13, 16)}-a${x.slice(17, 20)}-${x.slice(20, 32)}`;
}

export interface Recording {
  endpoint: Endpoint;
  hash: string;
  request: unknown;
  data: unknown;
  credits: number | null;
  modelMs: number | null;
}

/** Plays back recorded live responses. A request that was never recorded fails loudly. */
export class ReplayClient implements ClockedLike {
  private byHash = new Map<string, Recording>();
  private delayMs: number;
  constructor(recordings: Recording[], delayMs = 0) {
    this.delayMs = delayMs;
    for (const r of recordings) this.byHash.set(r.hash, r);
  }
  async call<T>(endpoint: Endpoint, body: object, idempotencyKey: string): Promise<CallResult<T>> {
    const r = this.byHash.get(requestHash(endpoint, body));
    if (this.delayMs) await new Promise((res) => setTimeout(res, this.delayMs * (0.5 + Math.random())));
    if (!r) throw new Error(`No recorded response for this ${endpoint} request`);
    return { data: r.data as T, credits: r.credits, modelMs: r.modelMs, idempotencyKey, replayed: true };
  }
}

/** Wraps a live client and keeps every response so a run can be replayed later. */
export class RecordingClient implements ClockedLike {
  recordings: Recording[] = [];
  private inner: ClockedLike;
  constructor(inner: ClockedLike) {
    this.inner = inner;
  }
  async call<T>(endpoint: Endpoint, body: object, idempotencyKey: string): Promise<CallResult<T>> {
    const res = await this.inner.call<T>(endpoint, body, idempotencyKey);
    this.recordings.push({
      endpoint,
      hash: requestHash(endpoint, body),
      request: body,
      data: res.data,
      credits: res.credits,
      modelMs: res.modelMs,
    });
    return res;
  }
}

export function toCallRecord(
  endpoint: Endpoint,
  request: unknown,
  res: CallResult | null,
  error: string | null,
  idempotencyKey: string,
): CallRecord {
  return {
    endpoint,
    request,
    response: res?.data,
    error: error ?? undefined,
    credits: res?.credits ?? null,
    modelMs: res?.modelMs ?? null,
    idempotencyKey,
    replayed: res?.replayed ?? false,
  };
}
