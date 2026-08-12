/**
 * skills/launcher/index.ts — opens/closes apps and projects, hands-free,
 * no approval needed (`APP_CONTROL` is green-tier, 2026-08-07). Every
 * actual open/close still goes through
 * `ctx.propose({capability: "APP_CONTROL", ...})` -- this skill never
 * touches `core/executors/apps.ts` directly (it can't; ESLint blocks the
 * import) and never assumes something happened just because it asked;
 * green just means the gate runs the real executor immediately instead
 * of waiting on a click, not that nothing checks the result
 * (`Gate.propose()`'s own green-tier executor call still reports a real
 * failure honestly). `listProjectDirs` is only ever a directory
 * *listing* (names, not contents) under one fixed root, through
 * `ctx.fs.listDir` -- CLAUDE.md § 5's "FS_READ is whitelist, not
 * blacklist" now has a real enforcement mechanism behind it
 * (`core/skills/fs.ts`), not just the convention this comment used to
 * describe before it existed.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import type { ApprovalOutcome } from "../../shared/types.ts";
import type { Skill, SkillContext } from "../../core/skills/types.ts";
import { extractOrNull } from "../_shared/extract.ts";
import { manifest } from "./manifest.ts";

// Exported so `core/main.ts` can wire this exact root into
// `buildSkillContext`'s `fsRoots` -- one source of truth for "what this
// skill is actually allowed to see," not a value duplicated between the
// skill and its own capability grant.
export const PROJECTS_ROOT = process.env["JARVIS_PROJECTS_ROOT"] ?? join(homedir(), "Developer", "Programação");

export type ListProjectDirsFn = (ctx: SkillContext) => string[];

function realListProjectDirs(ctx: SkillContext): string[] {
  try {
    return ctx.fs
      .listDir(PROJECTS_ROOT)
      .filter((entry) => entry.isDirectory && !entry.name.startsWith("."))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

const EXTRACT_APP_SYSTEM = `Extract just the application name the owner wants opened. Respond with the
app name only, capitalized the way a macOS app is normally named (e.g.
"Cursor", "Safari", "Calculator"). No quotes, no extra words. If no app is
named, respond with exactly: NONE`;

const EXTRACT_PROJECT_SYSTEM = `Extract just the project name the owner wants opened. Respond with the
project name only, nothing else. If no project is named, respond with
exactly: NONE`;

const EXTRACT_URL_SYSTEM = `Extract a website the owner wants opened, from what they said. Respond
with a full URL only (https://example.com), guessing the standard domain
for well-known sites/companies (e.g. "GitHub" -> https://github.com). No
quotes, no extra words. If nothing resembling a website is stated,
respond with exactly: NONE`;

const EXTRACT_CLOSE_APP_SYSTEM = `Extract just the application name the owner wants closed/quit. Respond with the
app name only, capitalized the way a macOS app is normally named (e.g.
"Cursor", "Safari", "Calculator"). No quotes, no extra words. If no app is
named, respond with exactly: NONE`;

// Trailing punctuation on an app name would reach `open -a "X."` --
// stripped the same way skills/tasks found it needed live.
function extractName(ctx: SkillContext, system: string, utterance: string): Promise<string | null> {
  return extractOrNull(ctx, system, utterance, { maxTokens: 20, stripTrailingPunctuation: true, catchErrors: true });
}

// `APP_CONTROL` is green-tier (auto-runs, `Gate.propose()`'s own
// green-tier executor call) -- an owner can no longer reject or let this
// expire, so "rejected"/"expired" outcomes are structurally unreachable
// here now (they were real, live paths back when this was `SHELL_EXEC`).
// The only way `outcome.ok` is false today is a real executor failure.
function speechForOutcome(app: string, outcome: ApprovalOutcome, verb: "open" | "close"): string {
  if (outcome.ok) return verb === "open" ? `Opened ${app}.` : `Closed ${app}.`;
  return `I couldn't ${verb} ${app} -- ${outcome.detail ?? "something went wrong"}.`;
}

async function proposeOpen(ctx: SkillContext, app: string, path: string | undefined, humanSummary: string): Promise<{ speech: string }> {
  const payload = path ? { action: "open_app" as const, app, path } : { action: "open_app" as const, app };
  const outcome = await ctx.propose({ capability: "APP_CONTROL", humanSummary, payload });
  const speech = speechForOutcome(app, outcome, "open");
  ctx.say(speech);
  return { speech };
}

async function proposeClose(ctx: SkillContext, app: string): Promise<{ speech: string }> {
  const outcome = await ctx.propose({
    capability: "APP_CONTROL",
    humanSummary: `Close ${app}`,
    payload: { action: "close_app" as const, app },
  });
  const speech = speechForOutcome(app, outcome, "close");
  ctx.say(speech);
  return { speech };
}

/** "https://www.instagram.com/somepath" -> "Instagram". Found live,
 * 2026-08-12: the spoken confirmation read the entire raw URL back
 * ("Opened https colon slash slash www dot instagram dot com"), which
 * is both tedious and unlike how a person would say it. The audit log
 * still records the full URL -- only what the owner *hears* changes. */
export function friendlyUrlName(url: string): string {
  const host = url
    .replace(/^[a-z]+:\/\//i, "")
    .split("/")[0]!
    .replace(/^www\./i, "");
  const label = host.split(".")[0];
  if (!label) return url;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

async function proposeOpenUrl(ctx: SkillContext, url: string): Promise<{ speech: string }> {
  const outcome = await ctx.propose({
    capability: "APP_CONTROL",
    humanSummary: `Open ${url}`,
    payload: { action: "open_url" as const, url },
  });
  const speech = speechForOutcome(friendlyUrlName(url), outcome, "open");
  ctx.say(speech);
  return { speech };
}

export interface LauncherDeps {
  listProjectDirs: ListProjectDirsFn;
}

/** Factory so tests can inject a fake directory listing instead of
 * touching the real filesystem (CLAUDE.md § 3), same pattern as
 * `skills/weather`'s `createWeatherSkill`. */
export function createLauncherSkill(deps: LauncherDeps = { listProjectDirs: realListProjectDirs }): Skill {
  return {
    manifest,

    async handle(input, ctx): Promise<{ speech: string }> {
      switch (input.intent) {
        case "open_app": {
          const app = (await extractName(ctx, EXTRACT_APP_SYSTEM, input.utterance)) ?? (await ctx.ask("Which app?"));
          const trimmed = app.trim();
          if (!trimmed) {
            const speech = "I didn't catch which app.";
            ctx.say(speech);
            return { speech };
          }
          return proposeOpen(ctx, trimmed, undefined, `Open ${trimmed}`);
        }

        case "close_app": {
          const app = (await extractName(ctx, EXTRACT_CLOSE_APP_SYSTEM, input.utterance)) ?? (await ctx.ask("Which app?"));
          const trimmed = app.trim();
          if (!trimmed) {
            const speech = "I didn't catch which app.";
            ctx.say(speech);
            return { speech };
          }
          return proposeClose(ctx, trimmed);
        }

        case "list_projects": {
          const dirs = deps.listProjectDirs(ctx);
          const speech =
            dirs.length === 0
              ? "I couldn't find any projects."
              : `You have ${dirs.length} project${dirs.length === 1 ? "" : "s"}: ${dirs.join(", ")}.`;
          ctx.say(speech);
          return { speech };
        }

        case "open_project": {
          const name = (await extractName(ctx, EXTRACT_PROJECT_SYSTEM, input.utterance)) ?? (await ctx.ask("Which project?"));
          const dirs = deps.listProjectDirs(ctx);
          const q = name.trim().toLowerCase();
          const matches = dirs.filter((d) => d.toLowerCase().includes(q) || q.includes(d.toLowerCase()));

          if (matches.length === 0) {
            const speech = `I couldn't find a project called "${name}".`;
            ctx.say(speech);
            return { speech };
          }
          if (matches.length > 1) {
            const speech = `I found more than one: ${matches.join(", ")}. Which one?`;
            ctx.say(speech);
            return { speech };
          }
          const projectName = matches[0]!;
          const path = join(PROJECTS_ROOT, projectName);
          return proposeOpen(ctx, "Cursor", path, `Open project "${projectName}" in Cursor`);
        }

        case "open_url": {
          const url = (await extractName(ctx, EXTRACT_URL_SYSTEM, input.utterance)) ?? (await ctx.ask("Which website?"));
          const trimmed = url.trim();
          if (!trimmed) {
            const speech = "I didn't catch which website.";
            ctx.say(speech);
            return { speech };
          }
          return proposeOpenUrl(ctx, trimmed);
        }

        default: {
          const speech = "I'm not sure what you want me to open.";
          ctx.say(speech);
          return { speech };
        }
      }
    },
  };
}

export const skill: Skill = createLauncherSkill();
