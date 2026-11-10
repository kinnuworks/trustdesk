import { Clocked } from 'clocked-sdk';
import type { CallResult, ClockedLike } from './client.js';
import type { Endpoint } from './types.js';

/** The real Clocked API through the official SDK. Server-side only: it reads CLOCKED_API_KEY. */
export class LiveClient implements ClockedLike {
  private sdk: Clocked;
  constructor(apiKey = process.env.CLOCKED_API_KEY) {
    if (!apiKey) throw new Error('CLOCKED_API_KEY is not set');
    this.sdk = new Clocked({ apiKey, maxAttempts: 3, timeout: 60_000 });
  }
  async call<T>(endpoint: Endpoint, body: object, idempotencyKey: string): Promise<CallResult<T>> {
    const res = await this.sdk.request<T>(endpoint, body, { idempotencyKey });
    return {
      data: res.data,
      credits: res.credits,
      modelMs: res.modelMs,
      idempotencyKey: res.idempotencyKey,
      replayed: false,
    };
  }
}
