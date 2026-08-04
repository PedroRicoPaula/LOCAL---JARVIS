import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { applySkillSchema, createSkillStore, TableNamespaceError } from "../store.ts";

function freshDb(): DatabaseSync {
  return new DatabaseSync(":memory:");
}

test("a skill can create and use its own namespaced table", () => {
  const db = freshDb();
  const store = createSkillStore(db, "brief");

  store.exec("CREATE TABLE skill_brief_notes (id TEXT PRIMARY KEY, text TEXT)");
  store.run("INSERT INTO skill_brief_notes (id, text) VALUES (?, ?)", "1", "hello");

  // node:sqlite rows have a null prototype -- compare fields, not deepEqual
  // against a plain object literal (see PROGRESS.md's Phase 4 log).
  assert.equal((store.get("SELECT text FROM skill_brief_notes WHERE id = ?", "1") as { text: string } | undefined)?.text, "hello");
  const all = store.all<{ text: string }>("SELECT text FROM skill_brief_notes");
  assert.equal(all.length, 1);
  assert.equal(all[0]?.text, "hello");
});

test("a skill cannot reach the shared events table through its store", () => {
  const db = freshDb();
  db.exec("CREATE TABLE events (id TEXT PRIMARY KEY)");
  const store = createSkillStore(db, "brief");

  assert.throws(() => store.exec("INSERT INTO events (id) VALUES ('x')"), TableNamespaceError);
});

test("a skill cannot reach the shared facts table through its store", () => {
  const db = freshDb();
  db.exec("CREATE TABLE facts (id TEXT PRIMARY KEY)");
  const store = createSkillStore(db, "brief");

  assert.throws(() => store.run("DELETE FROM facts WHERE id = ?", "1"), TableNamespaceError);
});

test("a skill cannot reach another skill's table through its store", () => {
  const db = freshDb();
  db.exec("CREATE TABLE skill_nutrition_meals (id TEXT PRIMARY KEY)");
  const store = createSkillStore(db, "brief");

  assert.throws(() => store.exec("SELECT * FROM skill_nutrition_meals"), TableNamespaceError);
});

test("applySkillSchema creates the skill's own tables idempotently", () => {
  const db = freshDb();
  const schema = "CREATE TABLE IF NOT EXISTS skill_brief_notes (id TEXT PRIMARY KEY);";

  applySkillSchema(db, "brief", schema);
  applySkillSchema(db, "brief", schema); // second call must not throw

  const store = createSkillStore(db, "brief");
  assert.deepEqual(store.all("SELECT * FROM skill_brief_notes"), []);
});

test("applySkillSchema rejects a schema that touches a shared table", () => {
  const db = freshDb();
  assert.throws(() => applySkillSchema(db, "brief", "CREATE TABLE facts (id TEXT PRIMARY KEY);"), TableNamespaceError);
});

test("applySkillSchema does nothing for an empty schema", () => {
  const db = freshDb();
  assert.doesNotThrow(() => applySkillSchema(db, "brief", ""));
  assert.doesNotThrow(() => applySkillSchema(db, "brief", "   \n  "));
});
