/**
 * core/router/tests/fakes.ts — no network, no Ollama, no NIM key. Mirrors
 * `senses/ears/fakes.py`'s pattern: every module that talks to the outside
 * world gets a fake here (CLAUDE.md § 3).
 */

import type { ChatChunk, ChatRequest, CostTier, Lane } from "../../../shared/types.ts";
import type { ModelProvider, ProviderHealth } from "../provider.ts";
import { ProviderUnavailableError } from "../provider.ts";

export interface FakeProviderOptions {
  id: string;
  lanes: readonly Lane[];
  costTier?: CostTier;
  /** Full text of the reply; delivered as a single done chunk unless
   * `chunks` is given for finer control. */
  text?: string;
  chunks?: readonly ChatChunk[];
  /** Throws this from `chat()` instead of yielding, after `failAfterChunks`
   * chunks (default 0 — fails before yielding anything, the common and
   * cleanly-recoverable case per router.ts's docstring). */
  failWith?: Error;
  failAfterChunks?: number;
  healthOk?: boolean;
}

export class FakeProvider implements ModelProvider {
  readonly id: string;
  readonly lanes: readonly Lane[];
  readonly costTier: CostTier;

  readonly receivedRequests: ChatRequest[] = [];
  callCount = 0;
  private readonly opts: FakeProviderOptions;

  constructor(opts: FakeProviderOptions) {
    this.opts = opts;
    this.id = opts.id;
    this.lanes = opts.lanes;
    this.costTier = opts.costTier ?? "free-local";
  }

  async *chat(req: ChatRequest): AsyncIterable<ChatChunk> {
    this.callCount += 1;
    this.receivedRequests.push(req);

    const chunks = this.opts.chunks ?? (this.opts.text !== undefined ? [{ delta: this.opts.text, done: true }] : []);
    const failAfter = this.opts.failAfterChunks ?? 0;

    let emitted = 0;
    for (const chunk of chunks) {
      if (this.opts.failWith && emitted >= failAfter) {
        throw this.opts.failWith;
      }
      yield chunk;
      emitted += 1;
    }
    if (this.opts.failWith && emitted >= failAfter) {
      throw this.opts.failWith;
    }
  }

  async health(): Promise<ProviderHealth> {
    return { ok: this.opts.healthOk ?? true };
  }
}

export function unavailable(id: string, message = "fake unavailable"): ProviderUnavailableError {
  return new ProviderUnavailableError(id, message);
}
