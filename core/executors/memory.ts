/**
 * core/executors/memory.ts — `MEMORY_WRITE`'s executor. `Gate` maps one
 * `Executor` per capability, so a fact write and an observation write
 * (Phase 8: `skills/look`, SPEC.md § 7 -- "vision identifies, the owner
 * confirms, only then does anything get written") share this single
 * capability, dispatched by `payload.kind` -- same shape
 * `core/executors/shell.ts` already uses for `SHELL_EXEC`'s several
 * actions. Before this existed at all, an approved `MEMORY_WRITE`
 * proposal resolved with a signed execution and nothing ever consumed
 * it -- a real, previously-undetected gap: the write never actually
 * happened even after the owner approved it.
 */

import type { Memory } from "../memory/memory.ts";

export interface WriteFactPayload {
  kind: "fact";
  key: string;
  value: string;
  confidence?: number;
  sourceEventId?: string;
}

export interface WriteObservationPayload {
  kind: "observation";
  imagePath: string;
  provider: string;
  qualitative: string;
  structured: object | null;
  confidence: number;
}

export type WriteMemoryPayload = WriteFactPayload | WriteObservationPayload;

function isWriteFactPayload(payload: unknown): payload is WriteFactPayload {
  const p = payload as Record<string, unknown>;
  if (typeof p["key"] !== "string" || p["key"].trim() === "") return false;
  if (typeof p["value"] !== "string") return false;
  if (p["confidence"] !== undefined && typeof p["confidence"] !== "number") return false;
  if (p["sourceEventId"] !== undefined && typeof p["sourceEventId"] !== "string") return false;
  return true;
}

function isWriteObservationPayload(payload: unknown): payload is WriteObservationPayload {
  const p = payload as Record<string, unknown>;
  if (typeof p["imagePath"] !== "string" || p["imagePath"].trim() === "") return false;
  if (typeof p["provider"] !== "string" || p["provider"].trim() === "") return false;
  if (typeof p["qualitative"] !== "string") return false;
  if (p["structured"] !== null && typeof p["structured"] !== "object") return false;
  if (typeof p["confidence"] !== "number") return false;
  return true;
}

export function createWriteFactExecutor(memory: Memory) {
  return async (payload: unknown): Promise<{ ok: boolean; result?: unknown; error?: string }> => {
    if (typeof payload !== "object" || payload === null) {
      return { ok: false, error: `malformed MEMORY_WRITE payload: ${JSON.stringify(payload)}` };
    }
    const p = payload as Record<string, unknown>;

    if (p["kind"] === "fact") {
      if (!isWriteFactPayload(p)) {
        return { ok: false, error: `malformed fact payload: ${JSON.stringify(payload)}` };
      }
      const input: Parameters<Memory["upsertFact"]>[0] = {
        key: p.key,
        value: p.value,
        confidence: p.confidence ?? 0.9,
      };
      if (p.sourceEventId !== undefined) input.sourceEventId = p.sourceEventId;
      const fact = memory.upsertFact(input);
      return { ok: true, result: fact };
    }

    if (p["kind"] === "observation") {
      if (!isWriteObservationPayload(p)) {
        return { ok: false, error: `malformed observation payload: ${JSON.stringify(payload)}` };
      }
      const observation = memory.addObservation({
        imagePath: p.imagePath,
        provider: p.provider,
        qualitative: p.qualitative,
        structured: p.structured,
        confidence: p.confidence,
      });
      return { ok: true, result: observation };
    }

    return { ok: false, error: `unknown MEMORY_WRITE kind: ${JSON.stringify(p["kind"])}` };
  };
}
