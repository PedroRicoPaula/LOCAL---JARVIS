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

const CAPABILITIES_SPEECH_EN =
  "I can check the weather for a city you've told me, manage a task list and a shopping list, " +
  "open and close apps, projects, and websites, control music playback, report your system's CPU, memory, and disk usage, " +
  "give you a morning brief, use the camera to describe or answer questions about what it sees, " +
  "check your Gmail, and read or write the clipboard.";

const CAPABILITIES_SPEECH_PT =
  "Consigo ver o tempo numa cidade que me tenhas dito, gerir uma lista de tarefas e uma lista de compras, " +
  "abrir e fechar aplicações, projetos e sites, controlar a música, dizer-te como está o CPU, a memória e o disco, " +
  "dar-te um resumo de manhã, usar a câmara para descrever ou responder a perguntas sobre o que vê, " +
  "ver o teu Gmail, e ler ou escrever na área de transferência.";

export const skill: Skill = {
  manifest,

  async handle(input, ctx): Promise<{ speech: string }> {
    const speech = detectLanguage(input.utterance) === "pt" ? CAPABILITIES_SPEECH_PT : CAPABILITIES_SPEECH_EN;
    ctx.say(speech);
    return { speech };
  },
};
