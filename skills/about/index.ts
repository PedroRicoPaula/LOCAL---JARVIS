/**
 * skills/about/index.ts — a fixed, hand-maintained summary, not a model
 * call. Same reasoning `skills/weather`'s own template uses: fast, no
 * added latency (CLAUDE.md § 7), no risk of a model inventing a
 * capability that doesn't exist. Update BOTH `CAPABILITIES_SPEECH`
 * strings by hand whenever a real (non-placeholder) skill is added or
 * removed -- they must describe the same set.
 *
 * **Bilingual since 2026-08-17.** ADR-033 made the spoken deliverable
 * bilingual, but a hand-written string can't follow the owner's language
 * the way `core/persona.md` makes a model-generated reply do. Found live:
 * asking "o que consegues fazer?" in Portuguese returned the entire
 * capability list in English. The PT-PT text is European Portuguese
 * ("aplicações" not "aplicativos", "câmara" not "câmera", addressed as
 * `tu`) per `core/persona.md`'s own language section.
 */

import type { Skill } from "../../core/skills/types.ts";
import { detectLanguage } from "../_shared/language.ts";
import { manifest } from "./manifest.ts";

/** The capabilities that are always real, in the order they're spoken.
 * MCP-backed ones are appended separately -- see `handle`. */
const ALWAYS_EN =
  "I can check the weather for a city you've told me, manage a task list and a shopping list, " +
  "open and close apps, projects, and websites, control music playback, report your system's CPU, memory, and disk usage, " +
  "give you a morning brief, use the camera to describe or answer questions about what it sees, " +
  "and read or write the clipboard";

const ALWAYS_PT =
  "Consigo ver o tempo numa cidade que me tenhas dito, gerir uma lista de tarefas e uma lista de compras, " +
  "abrir e fechar aplicações, projetos e sites, controlar a música, dizer-te como está o CPU, a memória e o disco, " +
  "dar-te um resumo de manhã, usar a câmara para descrever ou responder a perguntas sobre o que vê, " +
  "e ler ou escrever na área de transferência";

/** Only claimed when the matching MCP server is actually registered right
 * now. Found live 2026-08-17: the Gmail OAuth refresh token had expired
 * (`invalid_grant`), so `core` booted with the server unregistered -- and
 * this skill went on telling the owner it could "check your Gmail". A
 * capability claim is exactly as serious as a factual claim (CLAUDE.md
 * § 6: "a confidently wrong father is worse than no father"), and this
 * skill exists precisely so that question gets an honest answer. */
const MCP_CAPABILITIES: readonly { server: string; en: string; pt: string }[] = [
  { server: "gmail", en: "check your Gmail", pt: "ver o teu Gmail" },
  { server: "github", en: "list your GitHub repositories", pt: "listar os teus repositórios do GitHub" },
];

export const skill: Skill = {
  manifest,

  async handle(input, ctx): Promise<{ speech: string }> {
    const pt = detectLanguage(input.utterance) === "pt";
    const available = MCP_CAPABILITIES.filter((c) => ctx.mcp.hasServer(c.server)).map((c) => (pt ? c.pt : c.en));

    const base = pt ? ALWAYS_PT : ALWAYS_EN;
    // Spoken as one list, so the extra items read naturally rather than
    // as a bolted-on sentence: "..., and read the clipboard, and check
    // your Gmail." -> "..., read the clipboard, and check your Gmail."
    const speech =
      available.length === 0
        ? `${base}.`
        : `${base.replace(/,\s+(and|e)\s+/, ", ")}, ${pt ? "e" : "and"} ${available.join(pt ? ", e " : ", and ")}.`;

    ctx.say(speech);
    return { speech };
  },
};
