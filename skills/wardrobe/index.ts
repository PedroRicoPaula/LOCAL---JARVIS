/**
 * skills/wardrobe/index.ts — a deliberate placeholder. `ROADMAP.md`'s
 * "Backlog — not scheduled" section lists `wardrobe` explicitly, with
 * "Write ideas there. Do not build them."
 *
 * It stays *registered* rather than being quietly dropped so the owner
 * gets a straight "not built yet" instead of general conversation having
 * to guess -- and `skills/about/persona.md` already instructs the
 * capability list never to mention it, so it is never advertised as
 * something JARVIS can do.
 *
 * The reply is bilingual (ADR-033) and, since 2026-08-17, no longer
 * reads an internal skill id out loud: "wardrobe is not implemented yet"
 * is a sentence about the codebase, not an answer to a person who asked
 * what to wear. It also now says what *is* available instead of
 * dead-ending (CLAUDE.md § 6: say plainly what's outside what this voice
 * can do, don't imply it's coming).
 */

import type { Skill } from "../../core/skills/types.ts";
import { detectLanguage } from "../_shared/language.ts";
import { manifest } from "./manifest.ts";

const NOT_BUILT_EN =
  "Choosing outfits isn't something I can do yet -- there's no wardrobe skill built, " +
  "and I can't see your clothes. If you hold something up to the camera I can describe it.";

const NOT_BUILT_PT =
  "Escolher roupa ainda não é coisa que eu saiba fazer -- não há nenhuma skill de guarda-roupa construída, " +
  "e não vejo a tua roupa. Se puseres alguma coisa à frente da câmara, consigo dizer-te o que é.";

export const skill: Skill = {
  manifest,

  async handle(input, ctx): Promise<{ speech: string }> {
    const speech = detectLanguage(input.utterance) === "pt" ? NOT_BUILT_PT : NOT_BUILT_EN;
    ctx.say(speech);
    return { speech };
  },
};
