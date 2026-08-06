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
      lanes: ["see"],
      requiresCamera: true,
    },
  ],

  capabilities: ["CAMERA", "MEMORY_WRITE"],
};
