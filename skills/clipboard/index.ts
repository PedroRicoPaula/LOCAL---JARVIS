/**
 * skills/clipboard/index.ts — reads or writes the system clipboard, hands
 * free. Every action goes through `ctx.propose({capability: "SHELL_EXEC",
 * ...})` -- this skill never touches `core/executors/clipboard.ts`
 * directly (ESLint blocks the import) and never assumes something
 * happened just because it asked.
 */

import type { ApprovalOutcome } from "../../shared/types.ts";
import type { Skill, SkillContext } from "../../core/skills/types.ts";
import { extractOrNull } from "../_shared/extract.ts";
import { manifest } from "./manifest.ts";

const EXTRACT_TEXT_SYSTEM = `Extract the literal text the owner wants copied to their clipboard, from
what they said. Respond with that text only, nothing else -- no quotes
added, no explanation. If no specific text is stated, respond with
exactly: NONE`;

// A spoken read-back of the whole clipboard could go on for a very long
// time (a copied paragraph, a block of code) -- CLAUDE.md § 7 treats
// every spoken sentence as something the owner has to wait through, so a
// long clipboard is summarized by length rather than read in full.
const MAX_SPOKEN_CHARS = 400;

function extractText(ctx: SkillContext, utterance: string): Promise<string | null> {
  return extractOrNull(ctx, EXTRACT_TEXT_SYSTEM, utterance, { maxTokens: 200, catchErrors: true });
}

function readSpeechForOutcome(outcome: ApprovalOutcome): string {
  if (!outcome.ok) {
    if (outcome.reason === "rejected") return "Okay, not reading it out.";
    if (outcome.reason === "expired") return "That request expired before you answered.";
    return `I couldn't read the clipboard -- ${outcome.detail ?? "something went wrong"}.`;
  }
  const text = (outcome.result as { text?: string } | undefined)?.text?.trim() ?? "";
  if (!text) return "Your clipboard is empty.";
  if (text.length > MAX_SPOKEN_CHARS) {
    return `Your clipboard has ${text.length} characters, starting with: ${text.slice(0, MAX_SPOKEN_CHARS)}...`;
  }
  return `Your clipboard has: ${text}`;
}

function writeSpeechForOutcome(text: string, outcome: ApprovalOutcome): string {
  if (outcome.ok) return "Copied.";
  if (outcome.reason === "rejected") return `Okay, not copying "${text}".`;
  if (outcome.reason === "expired") return `The request to copy "${text}" expired before you answered.`;
  return `I couldn't copy that -- ${outcome.detail ?? "something went wrong"}.`;
}

function screenshotSpeechForOutcome(outcome: ApprovalOutcome): string {
  // "Sent," not "captured" -- screencapture exits the same way whether
  // the owner completed the selection or pressed Escape to cancel
  // (core/executors/screenshot.ts's own docstring), so this never claims
  // more certainty than it has.
  if (outcome.ok) return "Sent to your clipboard, if you finished selecting an area.";
  if (outcome.reason === "rejected") return "Okay, not taking a screenshot.";
  if (outcome.reason === "expired") return "The screenshot request expired before you answered.";
  return `I couldn't take that screenshot -- ${outcome.detail ?? "something went wrong"}.`;
}

export const skill: Skill = {
  manifest,

  async handle(input, ctx): Promise<{ speech: string }> {
    switch (input.intent) {
      case "read_clipboard": {
        const outcome = await ctx.propose({
          capability: "SHELL_EXEC",
          humanSummary: "Read the clipboard",
          payload: { action: "read_clipboard" as const },
        });
        const speech = readSpeechForOutcome(outcome);
        ctx.say(speech);
        return { speech };
      }

      case "write_clipboard": {
        const text = (await extractText(ctx, input.utterance)) ?? (await ctx.ask("What should I copy?"));
        const trimmed = text.trim();
        if (!trimmed) {
          const speech = "I didn't catch what to copy.";
          ctx.say(speech);
          return { speech };
        }
        const outcome = await ctx.propose({
          capability: "SHELL_EXEC",
          humanSummary: `Copy "${trimmed}" to the clipboard`,
          payload: { action: "write_clipboard" as const, text: trimmed },
        });
        const speech = writeSpeechForOutcome(trimmed, outcome);
        ctx.say(speech);
        return { speech };
      }

      case "capture_screenshot": {
        const outcome = await ctx.propose({
          capability: "SHELL_EXEC",
          humanSummary: "Take an interactive screenshot and copy it to the clipboard",
          payload: { action: "capture_screenshot" as const },
        });
        const speech = screenshotSpeechForOutcome(outcome);
        ctx.say(speech);
        return { speech };
      }

      default: {
        const speech = "I'm not sure what you want me to do with the clipboard.";
        ctx.say(speech);
        return { speech };
      }
    }
  },
};
