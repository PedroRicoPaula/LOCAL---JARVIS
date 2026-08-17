/**
 * core/executors/reminders.ts — `REMINDERS`'s one registered executor:
 * create, list, and complete real Reminders.app items via JXA
 * (`osascript -l JavaScript`), for `skills/tasks`.
 *
 * **JXA, not AppleScript string-building** — real syntax verified live
 * against the owner's actual Reminders.app before writing this (not
 * guessed): JXA returns real JSON (`JSON.stringify(...)`), avoiding the
 * fragile comma-delimited string parsing AppleScript's own list-to-string
 * coercion would need.
 *
 * **Owner-authored text never goes into the script source.** It's passed
 * as a real `execFile` argv element, after `--`, read inside the script
 * via JXA's top-level `run(argv)` -- confirmed live that a string
 * containing shell-metacharacter-looking content comes through as inert
 * data, never executed (no shell is involved; `execFile`, not `exec`).
 * String-interpolating owner text into the `-e` source itself would be a
 * real command-injection risk.
 *
 * **Explicit timeout, unlike `focusMode.ts`'s still-open equivalent
 * gap:** that file's own docstring documents a real, unresolved case
 * where the exact same Shortcuts.app command that returns instantly in
 * an interactive shell hung 15+ seconds from a plain `execFile` call --
 * attributed to a macOS Automation-permission (TCC) dialog `core` can't
 * see or click on its first attempt to drive an app. A stuck permission
 * dialog now fails this executor honestly after `TIMEOUT_MS` instead of
 * hanging the gate indefinitely.
 *
 * **Re-investigated live, 2026-08-13 (ADR-052's own flagged follow-up):
 * the TCC theory looks less likely than iCloud sync latency.** Real,
 * repeated `runRemindersAction` calls against the owner's actual
 * Reminders.app, no permission dialog ever shown or clicked: `list`
 * against a list with zero incomplete items resolves in ~1.1s (the
 * common case). `add` resolves in ~10s. But touching a *freshly
 * created or modified* item's properties -- `list`'s own `.map()`,
 * `complete`'s read-back -- reliably ran past 15s and failed, then
 * succeeded on a later, more patient retry (tens of seconds, not
 * hundreds) once given real headroom. The write itself lands regardless
 * of whether the read-back after it does -- `complete`'s `r.completed =
 * true` was independently confirmed to have taken effect on an item
 * whose own `complete` call had just failed on timeout. Consistent with
 * CloudKit/iCloud sync blocking property reads on an item that hasn't
 * finished syncing yet, not a stuck permission prompt -- but not fully
 * confirmed either; `TIMEOUT_MS` bumped to give real headroom for the
 * common case without making a stuck call block a `converse`-lane turn
 * for too long. Whether this is enough under real, repeated, everyday
 * interactive use is still the owner's own thing to observe -- this
 * narrows what's actually happening, it doesn't fully close the loop.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ExecFileFn = typeof execFileAsync;

const OSASCRIPT_BIN = "/usr/bin/osascript";
const REMINDERS_LIST = process.env["JARVIS_REMINDERS_LIST"] ?? "Tasks";
// Was 15_000 -- bumped after live re-testing (2026-08-13, this file's own
// docstring) measured real, successful operations landing well past that
// on a freshly touched item. Still bounded, not unlimited: a genuinely
// stuck call still fails honestly, just with more real-world headroom.
// Exported so the test asserting it's actually applied references this,
// not a copied-out magic number that silently drifts if retuned again.
export const TIMEOUT_MS = 30_000;

export interface ReminderItem {
  id: string;
  name: string;
}

export type RemindersPayload =
  | { action: "add"; text: string }
  | { action: "list" }
  | { action: "complete"; id: string };

function isRemindersPayload(payload: unknown): payload is RemindersPayload {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload as Record<string, unknown>;
  if (p["action"] === "add") return typeof p["text"] === "string" && p["text"].trim() !== "";
  if (p["action"] === "list") return true;
  if (p["action"] === "complete") return typeof p["id"] === "string" && p["id"].trim() !== "";
  return false;
}

// argv: [action, listName, ...rest]. Fixed script, no owner data in the
// source -- see this file's own docstring.
const SCRIPT = `
function run(argv) {
  const [action, listName, ...rest] = argv;
  const Reminders = Application("Reminders");
  const list = Reminders.lists.byName(listName);

  if (action === "add") {
    const text = rest[0];
    const r = Reminders.Reminder({ name: text });
    list.reminders.push(r);
    return JSON.stringify({ id: r.id(), name: r.name() });
  }

  if (action === "list") {
    const rs = list.reminders.whose({ completed: false })();
    return JSON.stringify(rs.map((r) => ({ id: r.id(), name: r.name() })));
  }

  if (action === "complete") {
    const id = rest[0];
    const r = Reminders.reminders.byId(id);
    r.completed = true;
    return JSON.stringify({ id: r.id(), name: r.name() });
  }

  throw new Error("unknown action: " + action);
}
`;

async function runJxa(args: readonly string[], execFileFn: ExecFileFn): Promise<string> {
  const { stdout } = await execFileFn(OSASCRIPT_BIN, ["-l", "JavaScript", "-e", SCRIPT, "--", ...args], {
    timeout: TIMEOUT_MS,
  });
  return stdout;
}

function parseJson<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`unexpected osascript output: ${JSON.stringify(raw.slice(0, 200))}`);
  }
}

export async function runRemindersAction(
  payload: unknown,
  execFileFn: ExecFileFn = execFileAsync,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  if (!isRemindersPayload(payload)) {
    return { ok: false, error: `malformed reminders payload: ${JSON.stringify(payload)}` };
  }
  try {
    if (payload.action === "add") {
      const raw = await runJxa(["add", REMINDERS_LIST, payload.text], execFileFn);
      return { ok: true, result: parseJson<ReminderItem>(raw) };
    }
    if (payload.action === "list") {
      const raw = await runJxa(["list", REMINDERS_LIST], execFileFn);
      return { ok: true, result: parseJson<ReminderItem[]>(raw) };
    }
    const raw = await runJxa(["complete", REMINDERS_LIST, payload.id], execFileFn);
    return { ok: true, result: parseJson<ReminderItem>(raw) };
  } catch (cause) {
    return { ok: false, error: describeError(cause) };
  }
}

/** `execFile`'s own rejection `.message` is just "Command failed: <argv
 * echoed back>" -- the actually useful part (why) lives on `.stderr`,
 * a separate property, not folded into `.message` by Node itself.
 * Found live, 2026-08-12: a real failure reported a message with no
 * information in it at all until this was added. */
function describeError(cause: unknown): string {
  if (cause && typeof cause === "object" && "stderr" in cause) {
    const stderr = String((cause as { stderr: unknown }).stderr).trim();
    if (stderr) return stderr;
  }
  return cause instanceof Error ? cause.message : String(cause);
}
