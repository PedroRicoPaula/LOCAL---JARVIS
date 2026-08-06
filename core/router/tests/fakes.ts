/**
 * core/router/tests/fakes.ts — no network, no Ollama, no NIM key. Mirrors
 * `senses/ears/fakes.py`'s pattern: every module that talks to the outside
 * world gets a fake here (CLAUDE.md § 3).
 */

import type { ChatChunk, ChatRequest, CostTier, Lane, VisionRequest, VisionResult } from "../../../shared/types.ts";
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
  /** When given, this fake implements `vision()` and resolves with this
   * result. Omitted means no `vision` method at all (structurally, same
   * as a real provider that doesn't support the `see` lane) -- see
   * `undefinedVisionProvider` below for a case that needs that. */
  visionResult?: VisionResult;
  /** Throws this from `vision()` instead of resolving `visionResult`. */
  visionFailWith?: Error;
}

export class FakeProvider implements ModelProvider {
  readonly id: string;
  readonly lanes: readonly Lane[];
  readonly costTier: CostTier;

  readonly receivedRequests: ChatRequest[] = [];
  readonly receivedVisionRequests: VisionRequest[] = [];
  callCount = 0;
  visionCallCount = 0;
  private readonly opts: FakeProviderOptions;

  constructor(opts: FakeProviderOptions) {
    this.opts = opts;
    this.id = opts.id;
    this.lanes = opts.lanes;
    this.costTier = opts.costTier ?? "free-local";
    // Assigned conditionally, not always present as a no-op -- `vision`
    // is optional on `ModelProvider`, and `routeVision` (router.ts)
    // treats a provider with no `vision` method as one more reason to
    // fall through to the next in the chain. A test needs both: a fake
    // that genuinely has no method (property absent) and one that has
    // the method but fails.
    if (opts.visionResult !== undefined || opts.visionFailWith !== undefined) {
      this.vision = async (req: VisionRequest): Promise<VisionResult> => {
        this.visionCallCount += 1;
        this.receivedVisionRequests.push(req);
        if (this.opts.visionFailWith) throw this.opts.visionFailWith;
        return this.opts.visionResult!;
      };
    }
  }

  vision?: (req: VisionRequest) => Promise<VisionResult>;

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
