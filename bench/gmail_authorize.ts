/**
 * bench/gmail_authorize.ts — one-time interactive setup for the Gmail
 * MCP integration (docs/BACKLOG.md's "Gmail via Google's own official
 * MCP server" item, built 2026-08-06). Run this once, by hand, after
 * creating a Google OAuth "Web application" client (see the printed
 * instructions if the Keychain entries aren't there yet). Never run by
 * `core/main.ts` -- same "human-in-the-loop setup, not automated"
 * convention as `security add-generic-password` for every other key
 * this project uses.
 *
 * Usage: node --experimental-strip-types bench/gmail_authorize.ts
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runInteractiveAuthorization } from "../core/mcp/googleOAuth.ts";

const execFileAsync = promisify(execFile);

const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"];
const REDIRECT_PORT = 51789;

async function readKeychain(service: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("security", ["find-generic-password", "-a", process.env["USER"] ?? "", "-s", service, "-w"]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function writeKeychain(service: string, value: string): Promise<void> {
  await execFileAsync("security", ["add-generic-password", "-a", process.env["USER"] ?? "", "-s", service, "-w", value, "-U"]);
}

async function main(): Promise<number> {
  const clientId = await readKeychain("jarvis-google-oauth-client-id");
  const clientSecret = await readKeychain("jarvis-google-oauth-client-secret");

  if (!clientId || !clientSecret) {
    console.log(`
Missing Google OAuth credentials in Keychain. Before running this script:

1. Go to https://console.cloud.google.com/apis/credentials
2. Create an OAuth client, application type "Web application"
3. Add this Authorized redirect URI exactly:
     http://localhost:${REDIRECT_PORT}/oauth/callback
4. Enable the Gmail API for the project (APIs & Services -> Library)
5. Store the client ID and secret it gives you:

   security add-generic-password -a "$USER" -s jarvis-google-oauth-client-id -w 'YOUR_CLIENT_ID'
   security add-generic-password -a "$USER" -s jarvis-google-oauth-client-secret -w 'YOUR_CLIENT_SECRET'

Then run this script again.
`);
    return 1;
  }

  console.log("Starting Gmail authorization...\n");
  const tokens = await runInteractiveAuthorization({ clientId, clientSecret }, GMAIL_SCOPES, REDIRECT_PORT);

  if (!tokens.refreshToken) {
    console.log("Google didn't return a refresh token -- if you've authorized this app before, revoke access at https://myaccount.google.com/permissions and try again (Google only issues a refresh token on the first consent, or when prompt=consent forces a fresh one).");
    return 1;
  }

  await writeKeychain("jarvis-google-oauth-refresh-token", tokens.refreshToken);
  console.log("\nDone. Refresh token stored in Keychain as \"jarvis-google-oauth-refresh-token\".");
  console.log("The gmail skill will pick it up next time core starts.");
  return 0;
}

main().then((code) => process.exit(code));
