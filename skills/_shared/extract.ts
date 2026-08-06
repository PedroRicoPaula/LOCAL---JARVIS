/**
 * skills/_shared/extract.ts — the "call the model to pull a piece of
 * text out of the utterance, NONE means nothing found" pattern that
 * `launcher`, `tasks`, `shopping_list`, `clipboard`, and `gmail` each
 * independently reimplemented (found in a code review, 2026-08-06 --
 * already drifted: some stripped trailing punctuation, some didn't,
 * with no note anywhere explaining the difference).
 *
 * Skills can share code with each other and with `core/skills/` --
 * only importing `core/executors/**` is off limits (CLAUDE.md § 5b,
 * ESLint-enforced). This file imports nothing from there.
 *
 * `skills/media`'s `extractLevel` (a numeric 0-100 level, not text) is
 * different enough in shape and validation that it stays separate --
 * folding it in here would make the options bag do double duty for two
 * genuinely different jobs.
 */

import type { SkillContext } from "../../core/skills/types.ts";

export interface ExtractOptions {
  /** Passed straight through to `ctx.router.complete`. */
  maxTokens?: number;
  /** Strip trailing `.`/`!`/`?` -- needed when the extracted text gets
   * wrapped in another sentence afterward (e.g. `Added: ${text}.`),
   * where a model-supplied period would double up. Off by default --
   * `clipboard`'s literal copy text and `gmail`'s search query both
   * want the model's output verbatim, punctuation included. */
  stripTrailingPunctuation?: boolean;
  /** If the model call itself throws (not just returns NONE), treat
   * that as "nothing extracted" instead of propagating -- appropriate
   * for skills whose caller falls back to `ctx.ask()` either way. Off
   * by default: a caller that doesn't want a thrown extraction error
   * silently swallowed can catch it itself. */
  catchErrors?: boolean;
}

function clean(raw: string, stripTrailingPunctuation: boolean): string {
  const trimmed = raw.trim();
  return stripTrailingPunctuation ? trimmed.replace(/[.!?]+$/, "") : trimmed;
}

async function complete(ctx: SkillContext, system: string, utterance: string, opts: ExtractOptions): Promise<string> {
  const call = ctx.router.complete("converse", system, utterance, { maxTokens: opts.maxTokens ?? 40 });
  return opts.catchErrors ? call.catch(() => "") : call;
}

/** Returns the extracted text, or `null` if the model said NONE (or,
 * with `catchErrors`, if the call itself failed). */
export async function extractOrNull(
  ctx: SkillContext,
  system: string,
  utterance: string,
  opts: ExtractOptions = {},
): Promise<string | null> {
  const raw = await complete(ctx, system, utterance, opts);
  const text = clean(raw, opts.stripTrailingPunctuation ?? false);
  if (!text || text.toUpperCase() === "NONE") return null;
  return text;
}

/** `shopping_list`'s own shape: the model may return several items, one
 * per line -- same NONE/cleanup rules as `extractOrNull`, applied per
 * line, empty/NONE lines dropped. Returns `[]` for "nothing found",
 * never `null` -- there's no single missing value to ask a follow-up
 * about the way there is for a single extracted string. */
export async function extractLines(
  ctx: SkillContext,
  system: string,
  utterance: string,
  opts: ExtractOptions = {},
): Promise<string[]> {
  const raw = await complete(ctx, system, utterance, opts);
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toUpperCase() === "NONE") return [];
  return trimmed
    .split("\n")
    .map((line) => clean(line, opts.stripTrailingPunctuation ?? false))
    .filter((line) => line.length > 0 && line.toUpperCase() !== "NONE");
}
