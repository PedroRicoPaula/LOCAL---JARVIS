/**
 * core/skills/store.ts — per-skill namespaced storage (docs/SKILLS.md § 1:
 * "A skill owns its tables, prefixed `skill_<id>_`. It reads shared
 * `events` and `facts` through `ctx.memory`; it never writes to them
 * directly.").
 *
 * Enforcement is a runtime prefix check on every statement a skill runs
 * through its `SkillStore`, not just a naming convention in docs — a skill
 * cannot use its own store to reach `events`, `facts`, or another skill's
 * tables even if it tried.
 *
 * "Schema migration" in this phase means applying `schema.sql` once,
 * idempotently (`CREATE TABLE IF NOT EXISTS`) at load time — real
 * versioned migrations (`ALTER TABLE` on a live table) aren't needed
 * until a skill actually changes its own schema after shipping, which
 * hasn't happened yet (CLAUDE.md § 0.6).
 */

import type { DatabaseSync } from "node:sqlite";
import type { SkillStore } from "./types.ts";

export class TableNamespaceError extends Error {}

function tableName(skillId: string): string {
  return `skill_${skillId}_`;
}

/** Throws if `sql` references any identifier that isn't this skill's own
 * table prefix — a deliberately simple substring check, not a SQL parser.
 * It only needs to catch "wrote to `events` instead of my own table" or
 * "wrote to another skill's table," not defend against an adversarial
 * skill author (skills are first-party code, reviewed like any other
 * change). Two checks: shared core tables outright, and every `skill_`
 * marker must be followed by *this* skill's own id — catches reaching
 * into another skill's tables, not just the four shared ones. */
function assertNamespaced(sql: string, skillId: string): void {
  const lower = sql.toLowerCase();

  const forbidden = ["events", "facts", "observations", "memory_vec"];
  for (const table of forbidden) {
    // word-boundary match so e.g. "skill_brief_events_log" isn't flagged
    const pattern = new RegExp(`\\b${table}\\b`);
    if (pattern.test(lower) && !lower.includes(`skill_${skillId}_${table}`)) {
      throw new TableNamespaceError(
        `skill "${skillId}" tried to touch shared table "${table}" directly through ctx.store — use ctx.memory instead`,
      );
    }
  }

  const ownPrefix = `skill_${skillId}_`;
  const marker = /skill_/g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(lower)) !== null) {
    if (!lower.startsWith(ownPrefix, match.index)) {
      throw new TableNamespaceError(
        `skill "${skillId}" tried to touch another skill's table through ctx.store — every table must be prefixed "${ownPrefix}"`,
      );
    }
  }
}

export function createSkillStore(db: DatabaseSync, skillId: string): SkillStore {
  return {
    exec(sql: string): void {
      assertNamespaced(sql, skillId);
      db.exec(sql);
    },
    get<T = unknown>(sql: string, ...params: unknown[]): T | undefined {
      assertNamespaced(sql, skillId);
      // node:sqlite's bound-parameter type is stricter (and not
      // separately importable) than the store's own deliberately loose
      // `unknown[]` — a skill author's SQL params are trusted the same
      // way any other first-party code's are.
      return db.prepare(sql).get(...(params as never[])) as T | undefined;
    },
    all<T = unknown>(sql: string, ...params: unknown[]): T[] {
      assertNamespaced(sql, skillId);
      return db.prepare(sql).all(...(params as never[])) as T[];
    },
    run(sql: string, ...params: unknown[]): void {
      assertNamespaced(sql, skillId);
      db.prepare(sql).run(...(params as never[]));
    },
  };
}

/** Applies a skill's schema.sql, if it has one. Every statement must
 * create only tables prefixed for this skill. */
export function applySkillSchema(db: DatabaseSync, skillId: string, schemaSql: string): void {
  const trimmed = schemaSql.trim();
  if (trimmed === "") return;
  assertNamespaced(trimmed, skillId);
  db.exec(trimmed);
}
