/**
 * core/skills/scaffold.ts — `make new-skill id=<name>` (docs/SKILLS.md § 8).
 * Generates a working no-op skill and adds the registry line. Getting from
 * here to a passing `make check` should take under 30 minutes — that
 * number, timed for real, is Phase 5's own acceptance test.
 *
 * Usage: node core/skills/scaffold.ts <id>
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

function manifestTemplate(id: string): string {
  return `/**
 * skills/${id}/manifest.ts — docs/SKILLS.md § 2.
 */

import type { SkillManifest } from "../../shared/types.ts";

export const manifest: SkillManifest = {
  id: "${id}",
  version: "1.0.0",
  description: "TODO: one sentence, what this skill does.",

  intents: [
    {
      id: "${id}_default",
      description: "TODO: what this intent handles.",
      examples: [
        "TODO: add 5-8 real phrasings, terse and sloppy included",
      ],
      lanes: ["converse"],
    },
  ],

  capabilities: ["MEMORY_READ"],
};
`;
}

function indexTemplate(id: string): string {
  return `/**
 * skills/${id}/index.ts
 */

import type { Skill } from "../../core/skills/types.ts";
import { manifest } from "./manifest.ts";

export const skill: Skill = {
  manifest,

  async handle(_input, ctx): Promise<{ speech: string }> {
    const speech = "${id} is not implemented yet.";
    ctx.say(speech);
    return { speech };
  },
};
`;
}

function personaTemplate(id: string): string {
  return `# ${id} — voice

TODO: how this skill sounds. See core/persona.md for the baseline every
skill fragment adjusts, and docs/SKILLS.md § 6 for the format.
`;
}

function testTemplate(id: string): string {
  return `import assert from "node:assert/strict";
import { test } from "node:test";
import { skill } from "../../../../skills/${id}/index.ts";

test("happy path: handle() returns speech and calls ctx.say()", async () => {
  const said: string[] = [];
  const result = await skill.handle(
    { utterance: "test", intent: "${id}_default", sessionId: "s1" },
    // Minimal fake context -- expand as the skill grows real behavior.
    {
      router: { complete: async () => "", see: async () => { throw new Error("not used"); } },
      memory: undefined as never, // TODO: a real fake Memory once this skill reads/writes it
      camera: { state: "idle", open: async () => { throw new Error("not used"); } },
      propose: async () => ({ ok: false, reason: "rejected" }),
      say: (text: string) => said.push(text),
      ask: async () => "",
      store: { exec: () => {}, get: () => undefined, all: () => [], run: () => {} },
      sessionId: "s1",
      now: () => 0,
      log: { info: () => {}, warn: () => {}, error: () => {} },
    },
  );

  assert.equal(said.length, 1);
  assert.equal(result.speech, said[0]);
});
`;
}

function main(): void {
  const id = process.argv[2];
  if (!id) {
    console.error("Usage: node core/skills/scaffold.ts <id>");
    process.exit(1);
  }
  if (!/^[a-z][a-z0-9_]*$/.test(id)) {
    console.error(`"${id}" is not a valid skill id -- lowercase, letters/digits/underscore, starting with a letter.`);
    process.exit(1);
  }

  const skillDir = join(REPO_ROOT, "skills", id);
  if (existsSync(skillDir)) {
    console.error(`${skillDir} already exists.`);
    process.exit(1);
  }

  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "manifest.ts"), manifestTemplate(id));
  writeFileSync(join(skillDir, "index.ts"), indexTemplate(id));
  writeFileSync(join(skillDir, "persona.md"), personaTemplate(id));
  mkdirSync(join(skillDir, "prompts"), { recursive: true });
  writeFileSync(join(skillDir, "prompts", ".gitkeep"), "");

  const testDir = join(REPO_ROOT, "core", "skills", "tests", "generated");
  mkdirSync(testDir, { recursive: true });
  writeFileSync(join(testDir, `${id}.test.ts`), testTemplate(id));

  const registeredPath = join(REPO_ROOT, "core", "skills", "registered.ts");
  const registeredSrc = readFileSync(registeredPath, "utf8");
  const newLine = `  "../../skills/${id}/index.ts",\n`;
  const updated = registeredSrc.replace(
    /(export const REGISTERED_SKILL_MODULES: readonly string\[\] = \[\n)/,
    `$1${newLine}`,
  );
  if (updated === registeredSrc) {
    console.error("Could not find the insertion point in core/skills/registered.ts -- add the line by hand:");
    console.error(`  "../../skills/${id}/index.ts",`);
  } else {
    writeFileSync(registeredPath, updated);
  }

  console.log(`Scaffolded skills/${id}/. Next:`);
  console.log(`  1. Fill in manifest.ts's intent(s) and examples.`);
  console.log(`  2. Implement index.ts's handle().`);
  console.log(`  3. Write persona.md.`);
  console.log(`  4. Flesh out core/skills/tests/generated/${id}.test.ts.`);
  console.log(`  5. make check`);
}

main();
