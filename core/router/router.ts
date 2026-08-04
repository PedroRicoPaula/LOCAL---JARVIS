/**
 * core/router/router.ts — walks a lane's ordered provider chain, falling
 * through on failure, emitting one `RouterTrace` per attempt (SPEC.md § 3:
 * "The router logs which provider served each request. This is how we
 * learn.").
 *
 * Fallback only happens before the first chunk is yielded to the caller.
 * A provider that fails after already streaming some output is a hard
 * failure, not a fallback trigger: switching providers mid-response would
 * mean handing the caller (eventually, TTS) a garbled splice of two
 * different completions. In practice this is not a meaningful limitation —
 * every failure mode actually seen (connection refused, non-200, rate
 * limit, timeout) surfaces before or at the first byte, per each
 * provider's own implementation. A true mid-stream drop is rare enough
 * that failing honestly beats silently corrupting the output; revisit only
 * if real use shows otherwise.
 */

import { randomUUID } from "node:crypto";
import type { ChatChunk, ChatRequest, RouterTrace } from "../../shared/types.ts";
import { ProviderUnavailableError } from "./provider.ts";
import type { Registry } from "./registry.ts";

export type TraceSink = (trace: RouterTrace) => void;

export class NoProvidersRegisteredError extends Error {
  constructor(lane: string) {
    super(`no providers registered for lane "${lane}"`);
    this.name = "NoProvidersRegisteredError";
  }
}

export class AllProvidersFailedError extends Error {
  constructor(lane: string, causes: readonly unknown[]) {
    super(`all providers failed for lane "${lane}": ${causes.map(String).join("; ")}`);
    this.name = "AllProvidersFailedError";
  }
}

export async function* routeChat(
  registry: Registry,
  req: ChatRequest,
  onTrace: TraceSink = () => {},
): AsyncIterable<ChatChunk> {
  const chain = registry.chainFor(req.lane);
  if (chain.length === 0) {
    throw new NoProvidersRegisteredError(req.lane);
  }

  const requestId = randomUUID();
  const causes: unknown[] = [];

  for (let depth = 0; depth < chain.length; depth++) {
    const provider = chain[depth]!;
    const start = performance.now();
    let yieldedAny = false;

    try {
      for await (const chunk of provider.chat(req)) {
        yieldedAny = true;
        yield chunk;
      }
      onTrace({
        requestId,
        lane: req.lane,
        providerId: provider.id,
        costTier: provider.costTier,
        latencyMs: performance.now() - start,
        fallbackDepth: depth,
        ok: true,
      });
      return;
    } catch (cause) {
      const latencyMs = performance.now() - start;
      if (!(cause instanceof ProviderUnavailableError) || yieldedAny) {
        onTrace({
          requestId,
          lane: req.lane,
          providerId: provider.id,
          costTier: provider.costTier,
          latencyMs,
          fallbackDepth: depth,
          ok: false,
          error: String(cause),
        });
        throw cause;
      }
      onTrace({
        requestId,
        lane: req.lane,
        providerId: provider.id,
        costTier: provider.costTier,
        latencyMs,
        fallbackDepth: depth,
        ok: false,
        error: cause.message,
      });
      causes.push(cause);
    }
  }

  throw new AllProvidersFailedError(req.lane, causes);
}
