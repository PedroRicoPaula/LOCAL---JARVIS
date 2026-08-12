/**
 * skills/tasks/manifest.ts — docs/SKILLS.md § 2. Real Reminders.app
 * tasks (`REMINDERS`, green -- narrow, immediately visible, trivially
 * reversible, same reasoning as `APP_CONTROL`; see `CLAUDE.md` § 5 and
 * `core/executors/reminders.ts`), not a private table -- swapped
 * 2026-08-12, owner request (iCloud sync across every device instead of
 * a JARVIS-only list).
 *
 * Multi-lane (`converse` + `act`), added 2026-08-07 as a preventive
 * fix, not a live-caught bug: `shopping_list`'s near-identical
 * add/remove/list shape broke exactly this way (ADR-030) -- "delete X
 * from the list" classified as `act`, silently unreachable when
 * declared `converse`-only. Same imperative/command-verb shape here
 * ("add a task", "mark X as done"), same fix applied ahead of the
 * first real failure rather than waiting for one.
 */

import type { SkillManifest } from "../../shared/types.ts";

export const manifest: SkillManifest = {
  id: "tasks",
  version: "1.1.0",
  description: "Real Reminders.app tasks -- add, list, and complete tasks by voice, synced via iCloud.",

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
        // PT-PT paraphrases (ADR-033)
        "adiciona uma tarefa",
        "lembra-me de ligar ao dentista",
        "tenho de acabar o relatório",
        "põe pagar a luz na lista de tarefas",
      ],
      lanes: ["converse", "act"],
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
        // PT-PT paraphrases (ADR-033)
        "quais são as minhas tarefas",
        "o que é que eu tenho para fazer",
        "lê-me a lista de tarefas",
      ],
      lanes: ["converse", "act"],
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
        // PT-PT paraphrases (ADR-033)
        "já acabei o relatório",
        "já fiz isso",
        "marca ligar ao dentista como feito",
      ],
      lanes: ["converse", "act"],
    },
  ],

  capabilities: ["REMINDERS"],
};
