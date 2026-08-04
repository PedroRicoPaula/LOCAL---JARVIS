/**
 * skills/launcher/index.ts — opens apps and projects, hands-free. Every
 * actual open goes through `ctx.propose({capability: "SHELL_EXEC", ...})`
 * -- this skill never touches `core/executors/apps.ts` directly (it
 * can't; ESLint blocks the import) and never assumes something happened
 * just because it asked. `listProjectDirs` is only ever a directory
 * *listing* (names, not contents) under one fixed root -- CLAUDE.md § 5's
 * "FS_READ is whitelist, not blacklist" applied even before a formal
 * enforcement mechanism exists for it.
 */

import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ApprovalOutcome } from "../../shared/types.ts";
import type { Skill, SkillContext } from "../../core/skills/types.ts";
import { manifest } from "./manifest.ts";

const PROJECTS_ROOT = process.env["JARVIS_PROJECTS_ROOT"] ?? join(homedir(), "Developer", "Programação");

export type ListProjectDirsFn = () => string[];

function realListProjectDirs(): string[] {
  try {
    return readdirSync(PROJECTS_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name);
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

async function extractName(ctx: SkillContext, system: string, utterance: string): Promise<string | null> {
  const raw = await ctx.router.complete("converse", system, utterance, { maxTokens: 20 }).catch(() => "");
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toUpperCase() === "NONE") return null;
  return trimmed;
}

function speechForOutcome(app: string, outcome: ApprovalOutcome): string {
  if (outcome.ok) return `Opened ${app}.`;
  if (outcome.reason === "rejected") return `Okay, not opening ${app}.`;
  if (outcome.reason === "expired") return `The request to open ${app} expired before you answered.`;
  return `I couldn't open ${app} -- ${outcome.detail ?? "something went wrong"}.`;
}

async function proposeOpen(ctx: SkillContext, app: string, path: string | undefined, humanSummary: string): Promise<{ speech: string }> {
  const payload = path ? { action: "open_app" as const, app, path } : { action: "open_app" as const, app };
  const outcome = await ctx.propose({ capability: "SHELL_EXEC", humanSummary, payload });
  const speech = speechForOutcome(app, outcome);
  ctx.say(speech);
  return { speech };
}

async function proposeOpenUrl(ctx: SkillContext, url: string): Promise<{ speech: string }> {
  const outcome = await ctx.propose({
    capability: "SHELL_EXEC",
    humanSummary: `Open ${url}`,
    payload: { action: "open_url" as const, url },
  });
  const speech = speechForOutcome(url, outcome);
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

        case "list_projects": {
          const dirs = deps.listProjectDirs();
          const speech =
            dirs.length === 0
              ? "I couldn't find any projects."
              : `You have ${dirs.length} project${dirs.length === 1 ? "" : "s"}: ${dirs.join(", ")}.`;
          ctx.say(speech);
          return { speech };
        }

        case "open_project": {
          const name = (await extractName(ctx, EXTRACT_PROJECT_SYSTEM, input.utterance)) ?? (await ctx.ask("Which project?"));
          const dirs = deps.listProjectDirs();
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
