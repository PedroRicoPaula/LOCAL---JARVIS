/**
 * skills/tasks/manifest.ts — docs/SKILLS.md § 2. Skill-owned storage
 * (`ctx.store`, table `skill_tasks_items`) -- private, low-stakes,
 * frequently-updated data, not the shared `facts`/`events` model
 * `MEMORY_WRITE` is for. No capability needed: writing to a skill's own
 * namespaced table isn't a gated side effect (docs/SKILLS.md § 1).
 */

import type { SkillManifest } from "../../shared/types.ts";

export const manifest: SkillManifest = {
  id: "tasks",
  version: "1.0.0",
  description: "A private daily task list -- add, list, and complete tasks by voice.",

  intents: [
    {
      id: "add_task",
      description: "Add a new task to the list.",
      examples: [
        "add a task",
        "remind me to call the dentist",
        "I need to finish the report",
        "add a task to pay the electricity bill",
        "put renew my passport on my task list",
        "todo: book the flights",
      ],
      lanes: ["converse"],
    },
    {
      id: "list_tasks",
      description: "Read back the current open tasks.",
      examples: [
        "what are my tasks",
        "read my to-do list",
        "what do I need to do",
        "what's on my task list",
        "any open tasks",
      ],
      lanes: ["converse"],
    },
    {
      id: "complete_task",
      description: "Mark an existing task as done.",
      examples: [
        "mark call the dentist as done",
        "I finished the report",
        "complete the task about the electricity bill",
        "I already did that",
        "check off renew my passport",
      ],
      lanes: ["converse"],
    },
  ],

  capabilities: [],
};
