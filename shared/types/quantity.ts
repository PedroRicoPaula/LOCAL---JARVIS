/**
 * shared/types/quantity.ts -- Estimate vs Measurement (SPEC.md SS7,
 * ADR-011: no model output is ever stored as fact). Split out of
 * shared/types.ts, 2026-08-12.
 */

// ---------------------------------------------------------------------------
// Estimates — see SPEC.md § 7 and ADR-011
// ---------------------------------------------------------------------------

/**
 * A number the system inferred rather than measured.
 *
 * There is deliberately no `value` field. Code that wants a single number from
 * an estimate has to make that choice explicitly and visibly, and review will
 * catch it. Never sum these.
 *
 * NOTE: this type must never appear in the nutrition or workbench paths. There,
 * quantities are always `Measurement` with source `declared`. `Estimate` exists
 * for genuinely uncertain things — a vision identification's confidence, a
 * coach's inferred pattern strength. See ADR-011.
 */
export interface Estimate {
  low: number;
  high: number;
  unit: string;
  confidence: number;
  source: "vision" | "inferred";
}

/**
 * A number the owner declared, or that came from a scale, label or database.
 * Safe to sum. This is the only kind of number that gets stored as fact.
 */
export interface Measurement {
  value: number;
  unit: string;
  /** `declared` = the owner said it out loud and confirmed the read-back. */
  source: "declared" | "scale" | "barcode";
}

export type Quantity = Estimate | Measurement;

export function isMeasured(q: Quantity): q is Measurement {
  return "value" in q;
}
