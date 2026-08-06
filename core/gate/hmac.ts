/**
 * core/gate/hmac.ts — HMAC-SHA256 over `{id, nonce, payload}`, signed by
 * `core`, verified by an executor before acting (SPEC.md § 8).
 *
 * `sign()`/`verify()` take the key as a plain argument — pure, synchronous,
 * directly unit-testable. `getSigningKey()` is the only impure piece: it
 * resolves the real key from Keychain, self-provisioning a random one on
 * first use (nothing external issues this key, unlike the owner-supplied
 * NIM key) since nothing external issues it. Like `core/router/
 * keychain.ts`, this Keychain I/O itself is not unit-tested — same
 * precedent, a real system dependency proven live, not mocked.
 */

import { execFile } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import type { SignedExecution } from "../../shared/types.ts";

const execFileAsync = promisify(execFile);
const KEYCHAIN_SERVICE = "jarvis-gate-hmac-key";

async function readKeychainSecret(service: string, account: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("security", ["find-generic-password", "-a", account, "-s", service, "-w"]);
    const value = stdout.trim();
    return value || null;
  } catch {
    return null;
  }
}

async function writeKeychainSecret(service: string, account: string, value: string): Promise<void> {
  await execFileAsync("security", ["add-generic-password", "-a", account, "-s", service, "-w", value]);
}

let cachedKey: string | null = null;

/** Generates and stores a new random signing key in Keychain the first
 * time this ever runs on a machine; reuses it (Keychain, then in-memory
 * for the rest of the process) every time after. */
export async function getSigningKey(account = process.env["USER"] ?? ""): Promise<string> {
  if (cachedKey) return cachedKey;

  const existing = await readKeychainSecret(KEYCHAIN_SERVICE, account);
  if (existing) {
    cachedKey = existing;
    return existing;
  }

  const generated = randomBytes(32).toString("hex");
  await writeKeychainSecret(KEYCHAIN_SERVICE, account, generated);
  cachedKey = generated;
  return generated;
}

function canonicalPayload(id: string, nonce: string, payload: unknown): string {
  // The object literal's own key order, not the caller's payload shape --
  // deterministic regardless of how the caller built `payload`, which is
  // what verify() needs to reproduce the exact same string.
  return JSON.stringify({ id, nonce, payload });
}

export function sign(key: string, id: string, nonce: string, payload: unknown, issuedAt: number): SignedExecution {
  const signature = createHmac("sha256", key).update(canonicalPayload(id, nonce, payload)).digest("hex");
  return { requestId: id, nonce, payload, issuedAt, signature };
}

export function verify(key: string, execution: SignedExecution): boolean {
  const expected = createHmac("sha256", key)
    .update(canonicalPayload(execution.requestId, execution.nonce, execution.payload))
    .digest("hex");
  return timingSafeEqualStrings(expected, execution.signature);
}

/** Plain `===` on a signature (or nonce) comparison leaks timing
 * information about how many leading bytes matched -- a real (if
 * narrow) side channel for something whose whole job is proving the
 * caller had the right value. Exported for `gate.ts`'s own nonce check
 * (found live, 2026-08-06 security review: it used a plain `!==`) --
 * same reasoning, same fix, no reason for two implementations. */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
