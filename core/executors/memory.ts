/**
 * core/executors/memory.ts — `MEMORY_WRITE`'s executor. Before this, an
 * approved `MEMORY_WRITE` proposal (docs/SKILLS.md § 5's own nutrition
 * example) resolved with a signed execution and nothing ever consumed
 * it -- a real, previously-undetected gap: the write never actually
 * happened even after the owner approved it. Same shape as `apps.ts`:
 * a factory closing over the one real dependency (`Memory`), returning
 * a function matching `Gate`'s `Executor` type.
 */

import type { Memory } from "../memory/memory.ts";

export interface WriteFactPayload {
  key: string;
  value: string;
  confidence?: number;
  sourceEventId?: string;
}

function isWriteFactPayload(payload: unknown): payload is WriteFactPayload {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload as Record<string, unknown>;
  if (typeof p["key"] !== "string" || p["key"].trim() === "") return false;
  if (typeof p["value"] !== "string") return false;
  if (p["confidence"] !== undefined && typeof p["confidence"] !== "number") return false;
  if (p["sourceEventId"] !== undefined && typeof p["sourceEventId"] !== "string") return false;
  return true;
}

export function createWriteFactExecutor(memory: Memory) {
  return async (payload: unknown): Promise<{ ok: boolean; result?: unknown; error?: string }> => {
    if (!isWriteFactPayload(payload)) {
      return { ok: false, error: `malformed fact payload: ${JSON.stringify(payload)}` };
    }
    const input: Parameters<Memory["upsertFact"]>[0] = {
      key: payload.key,
      value: payload.value,
      confidence: payload.confidence ?? 0.9,
    };
    if (payload.sourceEventId !== undefined) input.sourceEventId = payload.sourceEventId;
    const fact = memory.upsertFact(input);
    return { ok: true, result: fact };
  };
}
