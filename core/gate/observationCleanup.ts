/**
 * core/gate/observationCleanup.ts — split out of `gate.ts` 2026-08-17
 * alongside `store.ts`, same reason (CLAUDE.md § 3's ~300-line
 * guideline). Kept separate from `store.ts` rather than folded in: this
 * touches the filesystem, not the database, a different concern.
 */

import { unlink } from "node:fs/promises";
import type { ApprovalRow } from "./store.ts";

/** Rejected/expired `MEMORY_WRITE` `kind: "observation"` proposals leave
 * `skills/look`'s durable `data/observations/*.jpg` copy (ADR-045)
 * unreferenced by any DB row forever -- confirmed live, 2026-08-07
 * (PROGRESS.md's dated entry, `docs/BACKLOG.md`'s Annoyances section):
 * a real photo's approval expired unactioned and the file just sat on
 * disk. Only fires for a `kind: "observation"` payload (a `kind: "fact"`
 * proposal has no file to clean up); best-effort and silent on a
 * missing file (already gone is not an error worth logging). */
export function cleanupObservationFile(row: ApprovalRow): void {
  if (row.capability !== "MEMORY_WRITE") return;
  let payload: unknown;
  try {
    payload = JSON.parse(row.payload);
  } catch {
    return;
  }
  if (typeof payload !== "object" || payload === null) return;
  const p = payload as Record<string, unknown>;
  if (p["kind"] !== "observation" || typeof p["imagePath"] !== "string" || !p["imagePath"]) return;
  const imagePath = p["imagePath"];
  unlink(imagePath).catch((err) => {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      console.error(`gate: failed to delete orphaned observation file ${imagePath}`, err);
    }
  });
}
