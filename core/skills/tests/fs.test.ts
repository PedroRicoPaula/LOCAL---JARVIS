/**
 * core/skills/tests/fs.test.ts — real filesystem, real `mkdtemp`-created
 * scratch directories, no fake -- this is exactly the class of logic a
 * fake filesystem can't meaningfully stand in for (the whole point is
 * proving real paths get resolved/blocked correctly, symlink and `../`
 * tricks included).
 */

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createGatedFs, FsAccessDeniedError, type GatedFs } from "../fs.ts";

let root: string;
let allowed: string;
let outside: string;
let fs: GatedFs;

before(() => {
  root = mkdtempSync(join(tmpdir(), "jarvis-fs-test-"));
  allowed = join(root, "allowed");
  outside = join(root, "outside");
  mkdirSync(join(allowed, "subdir"), { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(allowed, "file.txt"), "hello");
  writeFileSync(join(allowed, ".env"), "SECRET_KEY=abc");
  mkdirSync(join(allowed, ".ssh"), { recursive: true });
  writeFileSync(join(allowed, ".ssh", "id_rsa"), "fake-key");
  writeFileSync(join(outside, "file.txt"), "should never be read");
  fs = createGatedFs([allowed]);
});

after(() => {
  rmSync(root, { recursive: true, force: true });
});

test("listDir: an allowed directory's entries are readable, with real type info", () => {
  const entries = fs.listDir(allowed);
  const byName = new Map(entries.map((e) => [e.name, e.isDirectory]));
  assert.equal(byName.get("file.txt"), false);
  assert.equal(byName.get("subdir"), true);
});

test("readFile: a file inside an allowed root is readable", () => {
  assert.equal(fs.readFile(join(allowed, "file.txt")), "hello");
});

test("readFile: a path outside every allowed root is denied", () => {
  assert.throws(() => fs.readFile(join(outside, "file.txt")), FsAccessDeniedError);
});

test("readFile: a .env file is denied even though it's inside an allowed root", () => {
  assert.throws(() => fs.readFile(join(allowed, ".env")), FsAccessDeniedError);
});

test("readFile: ~/.ssh contents are denied even inside an allowed root", () => {
  assert.throws(() => fs.readFile(join(allowed, ".ssh", "id_rsa")), FsAccessDeniedError);
});

test("listDir: a directory named .ssh is denied to list too, not just read", () => {
  assert.throws(() => fs.listDir(join(allowed, ".ssh")), FsAccessDeniedError);
});

test("a relative ../ escape out of the allowed root is denied", () => {
  assert.throws(() => fs.readFile(join(allowed, "..", "outside", "file.txt")), FsAccessDeniedError);
});

test("an empty allowedRoots list denies everything, honestly", () => {
  const empty = createGatedFs([]);
  assert.throws(() => empty.readFile(join(allowed, "file.txt")), FsAccessDeniedError);
});

test("a symlink inside the allowed root pointing outside it is still denied when read through", () => {
  const linkPath = join(allowed, "escape-link");
  symlinkSync(outside, linkPath);
  // Listing the parent is fine -- "escape-link" is just a name, same as
  // any other entry (skills/launcher's own "names, not contents"
  // precedent). Reading *through* the link is the real risk: resolve()
  // alone is purely lexical and would see this path as textually inside
  // `allowed`, while the OS follows the link to real content outside
  // it. realpathSync (this file's own fix, found while writing this
  // exact test) closes that gap.
  assert.ok(fs.listDir(allowed).some((e) => e.name === "escape-link"));
  assert.throws(() => fs.readFile(join(linkPath, "file.txt")), FsAccessDeniedError);
  assert.throws(() => fs.listDir(linkPath), FsAccessDeniedError);
});
