/**
 * skills/look/manifest.ts — docs/SKILLS.md § 2. `CAMERA` (green, auto-runs
 * -- opening/capturing/closing itself needs no approval, SPEC.md § 6) and
 * `MEMORY_WRITE` (yellow -- only the resulting observation write is
 * gated, SPEC.md § 7).
 */

import type { SkillManifest } from "../../shared/types.ts";

const CAMERA_CONTROL_LANES = ["converse", "act", "reflex"] as const;

export const manifest: SkillManifest = {
  id: "look",
  version: "1.0.0",
  description: "Camera sessions and vision -- opens/closes the camera on request, describes what it sees, never records without being asked.",

  intents: [
    {
      id: "open_camera",
      description: "Arm the camera so a follow-up 'what is this' works without repeating the request.",
      examples: [
        "turn on the camera",
        "open the camera",
        "arm the camera",
        "turn the camera on",
        "switch the camera on",
        // PT-PT paraphrases (ADR-033)
        "liga a câmara",
        "abre a câmara",
        "ativa a câmara",
      ],
      lanes: [...CAMERA_CONTROL_LANES],
    },
    {
      id: "close_camera",
      description: "Close the camera session. Deletes any captured frames not already remembered.",
      examples: [
        "turn off the camera",
        "close the camera",
        "stop the camera",
        "turn the camera off",
        "switch the camera off",
        // PT-PT paraphrases (ADR-033)
        "desliga a câmara",
        "fecha a câmara",
        "desativa a câmara",
      ],
      lanes: [...CAMERA_CONTROL_LANES],
    },
    {
      id: "describe",
      description: "Capture a frame and describe what's in it -- arms the camera first if it isn't already.",
      examples: [
        "what am I holding",
        "what is this",
        "look at this",
        "what do you see",
        "tell me what this is",
        "look at this and tell me what it is",
        "can you see what this is",
        "what's in front of the camera",
        // PT-PT paraphrases (ADR-033)
        "o que é isto",
        "o que estou a segurar",
        "olha para isto",
        "o que vês",
        "diz-me o que é isto",
      ],
      // Multi-lane, not just `see` -- found live (Phase 8's own
      // verification pass): a bare "what is this" with no other context
      // in the utterance classified as `converse` (the lane classifier
      // reasonably reads it as a possible reference to something already
      // discussed, per its own prompt's "recalling... things already
      // known" converse rule, absent a stronger physical-object cue).
      // `dispatch()` filters skill candidates to the classified lane
      // before ever running the embedding match (core/skills/
      // dispatch.ts), so a see-only declaration made this intent
      // unreachable for that exact phrasing regardless of how well it
      // scored. Same fix, same root cause class as `media.now_playing`
      // (ADR-026/030) -- declaring `converse` here too costs nothing,
      // the embedding match against this intent's own (camera-specific)
      // examples still has to score above CANDIDATE_FLOOR for anything
      // unrelated to actually dispatch here.
      lanes: ["see", "converse"],
      requiresCamera: true,
    },
    {
      id: "start_gestures",
      description: "Turn on live hand tracking -- shows the camera feed on the dashboard and tracks hand movement.",
      examples: [
        "turn on hand tracking",
        "start hand tracking",
        "track my hands",
        "turn on gesture mode",
        "let me control it with my hands",
        "show me the camera feed",
        // PT-PT paraphrases (ADR-033)
        "liga o rastreio de mãos",
        "ativa o modo de gestos",
        "segue as minhas mãos",
        "mostra-me a câmara",
      ],
      lanes: [...CAMERA_CONTROL_LANES],
    },
    {
      id: "stop_gestures",
      description: "Turn off live hand tracking, leaving the camera session itself alone.",
      examples: [
        "turn off hand tracking",
        "stop hand tracking",
        "stop tracking my hands",
        "turn off gesture mode",
        // PT-PT paraphrases (ADR-033)
        "desliga o rastreio de mãos",
        "desativa o modo de gestos",
        "para de seguir as minhas mãos",
      ],
      lanes: [...CAMERA_CONTROL_LANES],
    },
    {
      id: "start_pointer_control",
      description: "Turn on hand-driven cursor control -- the real mouse cursor follows the index finger. Requires hand tracking to already be running. Clicks never fire from voice or gesture alone; only a real, physical key press (Space by default) fires a click, on purpose (DECISIONS.md's ADR).",
      examples: [
        "point with my hand",
        "control the mouse with my hand",
        "let my hand control the mouse",
        "turn on pointer control",
        // PT-PT paraphrases (ADR-033). Deliberately no bare "cursor" in
        // any example here -- found live (bench_skill_routing.ts): it
        // collided with launcher.open_app's own "abre o Cursor" example
        // (the Cursor code editor), the exact same "a word becomes a
        // magnet" failure mode skills/shopping_list/manifest.ts already
        // documents avoiding for "coffee" (and launcher's own comment
        // a few lines up documents for this *same* app name once
        // before). "mouse"/"rato" carry the same meaning with no
        // collision risk.
        "controla o rato com a minha mão",
        "liga o controlo do rato",
        "deixa a minha mão mover o rato",
      ],
      lanes: [...CAMERA_CONTROL_LANES],
    },
    {
      id: "stop_pointer_control",
      description: "Turn off hand-driven cursor control, leaving hand tracking itself running.",
      examples: [
        "stop controlling the mouse",
        "turn off pointer control",
        "let go of the mouse",
        // PT-PT paraphrases (ADR-033) -- same "no bare cursor" reasoning
        // as start_pointer_control's own examples above.
        "desliga o controlo do rato",
        "larga o rato",
      ],
      lanes: [...CAMERA_CONTROL_LANES],
    },
  ],

  capabilities: ["CAMERA", "MEMORY_WRITE", "POINTER_CONTROL"],
};
