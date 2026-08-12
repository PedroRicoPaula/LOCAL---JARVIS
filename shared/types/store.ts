/**
 * shared/types/store.ts -- dashboard live-data panels (SOAK 1),
 * read/write views onto a skill's own `ctx.store` table. Deliberately
 * not a generic "any skill's store" API -- see the original section
 * comment preserved below. Split out of shared/types.ts, 2026-08-12.
 */

// ---------------------------------------------------------------------------
// Dashboard live-data panels (SOAK 1) — read/write views onto a skill's own
// `ctx.store` table, built for the two list-shaped skills that have one
// (`tasks`, `shopping_list`). Deliberately not a generic "any skill's
// store" API: only two skills have this shape today, and guessing a
// generic shape for hypothetical future ones is exactly the kind of
// premature abstraction CLAUDE.md § 0.6 warns against.
// ---------------------------------------------------------------------------

export interface TaskItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

export interface ShoppingItem {
  id: string;
  text: string;
  createdAt: number;
}
