/**
 * shared/types/nutrition.ts -- quantities are declared, never estimated
 * (ADR-011). Split out of shared/types.ts, 2026-08-12.
 */

import type { Measurement } from "./quantity.ts";

// ---------------------------------------------------------------------------
// Nutrition — quantities are declared, never estimated. ADR-011.
// ---------------------------------------------------------------------------

export interface FoodItem {
  name: string;
  /** Absent when the owner did not give one. Never filled in by a model. */
  quantity?: Measurement;
  /** Only present when the lookup table had a hit for this food and quantity. */
  nutrition?: {
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    source: "openfoodfacts" | "usda";
  };
  /** Set when vision proposed the name and the owner accepted or corrected it. */
  identifiedBy?: "owner" | "vision-confirmed" | "vision-corrected";
}

export interface MealLog {
  id: string;
  at: number;
  items: FoodItem[];
  /** Frame retained only if the owner approved keeping it. */
  framePath?: string;
  confirmedAt: number;
}
