/**
 * core/router/keychain.ts — macOS Keychain access for the `nim` provider's
 * API key. CLAUDE.md § 5: secrets live in Keychain, never in a committed
 * `.env` — this is the Node equivalent of `bench/nim_smoke.sh`'s and
 * `bench/bench_nim_lane.py`'s `security find-generic-password` call.
 *
 * `execFile`, not `exec`: the service name is a fixed literal here, but
 * using the argv-array form throughout means nothing in this file ever
 * needs to think about shell quoting to stay safe.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function getKeychainSecret(service: string, account = process.env["USER"] ?? ""): Promise<string> {
  try {
    const { stdout } = await execFileAsync("security", [
      "find-generic-password",
      "-a",
      account,
      "-s",
      service,
      "-w",
    ]);
    const secret = stdout.trim();
    if (!secret) {
      throw new Error(`Keychain entry "${service}" was found but is empty`);
    }
    return secret;
  } catch (cause) {
    throw new Error(
      `Could not read "${service}" from Keychain for account "${account}". ` +
        `Store it with: security add-generic-password -a "$USER" -s ${service} -w '...'`,
      { cause },
    );
  }
}
