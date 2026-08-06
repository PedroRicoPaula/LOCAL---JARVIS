/**
 * core/skills/fs.ts — `FS_READ`'s real enforcement (CLAUDE.md § 5: "FS_READ
 * is whitelist, not blacklist... never readable, whitelist or not").
 * Found missing entirely in a code review (2026-08-06): the capability was
 * declared in the type system and validated as a known manifest value, but
 * nothing actually restricted a real filesystem call -- `skills/launcher`
 * called `node:fs` directly, same as any other code, and nothing would
 * have stopped a future skill from reading `~/.ssh/id_rsa` or `.env`.
 *
 * Two checks, denylist first, always, regardless of the whitelist:
 *   1. The denylisted patterns from CLAUDE.md § 5 -- checked against the
 *      resolved absolute path, so a symlink or a relative `../` trick
 *      can't route around it.
 *   2. The caller's own allowed roots -- a skill only sees the roots it
 *      was actually configured with (`core/main.ts` wires the real
 *      ones); nothing here grants access to the whole filesystem by
 *      default.
 *
 * Deliberately narrow today (list a directory's names, read one file's
 * text) -- `skills/launcher` is still the only real consumer, and this
 * is meant to make the *next* skill that needs FS_READ inherit real
 * enforcement automatically, not to anticipate every possible shape a
 * filesystem API could have.
 */

import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

export interface DirEntry {
  name: string;
  isDirectory: boolean;
}

export class FsAccessDeniedError extends Error {}

// Matched against the resolved absolute path, case-insensitively.
// `.env`/`*secret*`/`*credential*` match anywhere in the path (a file
// *or* a directory named that way is denied, not just an exact
// filename) -- CLAUDE.md's own wording ("anything matching *secret*/
// *credential*") is a glob-style "anywhere," not "exact match."
const DENYLIST_PATTERNS: readonly RegExp[] = [
  /(^|\/)\.ssh(\/|$)/i,
  /(^|\/)\.aws(\/|$)/i,
  /(^|\/)\.env(\.[^/]*)?(\/|$)/i,
  /secret/i,
  /credential/i,
  /keychain/i,
];

function isDenied(absolutePath: string): boolean {
  return DENYLIST_PATTERNS.some((pattern) => pattern.test(absolutePath));
}

export interface GatedFs {
  /** Directory entry *names and type* only, no other metadata and never
   * file contents -- matching `skills/launcher`'s own existing
   * precedent ("a listing, never contents"). `isDirectory` is included
   * because "just the names" silently lost the ability to tell a
   * project directory from a stray file in it (found live while wiring
   * this up, 2026-08-06) -- that's still just "what's here," not
   * "what's inside it." */
  listDir(path: string): DirEntry[];
  readFile(path: string): string;
}

function checkAccess(path: string, allowedRoots: readonly string[]): string {
  // `resolve()` alone is purely lexical -- it does not follow symlinks,
  // so a symlink *inside* an allowed root pointing *outside* it would
  // pass a resolve()-only containment check while the OS still follows
  // the link on the actual read. `realpathSync` (found needed while
  // writing this file's own tests, 2026-08-06) resolves through any
  // symlinks first, so both the denylist and the allowed-root check run
  // against where the bytes actually come from, not the path's surface
  // text.
  const real = realpathSync(resolve(path));
  if (isDenied(real)) {
    throw new FsAccessDeniedError(`"${path}" is never readable (matches a denylisted pattern), regardless of any whitelist`);
  }
  const withinAnAllowedRoot = allowedRoots.some((root) => {
    const realRoot = realpathSync(resolve(root));
    return real === realRoot || real.startsWith(realRoot + sep);
  });
  if (!withinAnAllowedRoot) {
    throw new FsAccessDeniedError(`"${path}" is outside every FS_READ-allowed root for this skill`);
  }
  return real;
}

/** `allowedRoots` is per-caller, not global -- `core/main.ts` decides
 * what a given wiring actually needs visible (today: the one root
 * `skills/launcher` already used before this file existed,
 * `JARVIS_PROJECTS_ROOT`). An empty array is a valid, honest "nothing
 * allowed," not a special case. */
export function createGatedFs(allowedRoots: readonly string[]): GatedFs {
  return {
    listDir(path: string): DirEntry[] {
      const absolute = checkAccess(path, allowedRoots);
      return readdirSync(absolute, { withFileTypes: true }).map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
      }));
    },
    readFile(path: string): string {
      const absolute = checkAccess(path, allowedRoots);
      return readFileSync(absolute, "utf-8");
    },
  };
}
