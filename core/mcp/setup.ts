/**
 * core/mcp/setup.ts — assembles the real `McpRegistry` for `core/main.ts`,
 * same "one place decides what's wired in" role `router/wiring.ts` plays
 * for model providers. Every server here is optional at boot: a missing
 * Keychain entry (the owner hasn't run `bench/gmail_authorize.ts` yet)
 * or a real connection failure both degrade to "that server just isn't
 * registered" rather than crashing `core` -- same pattern `router/
 * wiring.ts` already established for the four optional LLM providers.
 */

import { getKeychainSecret } from "../router/keychain.ts";
import { GoogleTokenManager } from "./googleOAuth.ts";
import { McpRegistry } from "./registry.ts";

const GMAIL_MCP_URL = "https://gmailmcp.googleapis.com/mcp/v1";
// Official remote GitHub MCP server -- free to use with a personal access
// token (real-checked 2026-08-08, not guessed: https://api.githubcopilot.com/mcp/,
// Authorization: Bearer <PAT>, Streamable-HTTP -- the exact transport
// realConnect() already speaks). Only Copilot-premium-tier tools need a
// paid plan; nothing this project uses does.
const GITHUB_MCP_URL = "https://api.githubcopilot.com/mcp/";

async function tryKeychainSecret(service: string): Promise<string | null> {
  try {
    return await getKeychainSecret(service);
  } catch {
    return null;
  }
}

export async function setupMcpRegistry(): Promise<McpRegistry> {
  const registry = new McpRegistry();

  const [clientId, clientSecret, refreshToken] = await Promise.all([
    tryKeychainSecret("jarvis-google-oauth-client-id"),
    tryKeychainSecret("jarvis-google-oauth-client-secret"),
    tryKeychainSecret("jarvis-google-oauth-refresh-token"),
  ]);

  if (clientId && clientSecret && refreshToken) {
    const tokenManager = new GoogleTokenManager({ clientId, clientSecret }, async () => refreshToken);
    try {
      await registry.register({
        id: "gmail",
        url: GMAIL_MCP_URL,
        getAccessToken: () => tokenManager.getAccessToken(),
      });
      console.log("core: gmail MCP server connected");
    } catch (cause) {
      console.error("core: gmail MCP server registration failed, continuing without it", cause);
    }
  } else {
    console.log('core: gmail MCP server not configured (run "node --experimental-strip-types bench/gmail_authorize.ts" to set it up)');
  }

  // GitHub, unlike Gmail, needs no OAuth dance -- a single static PAT via
  // the existing generic Keychain helper is the whole `getAccessToken`.
  const githubPat = await tryKeychainSecret("jarvis-github-pat");
  if (githubPat) {
    try {
      await registry.register({
        id: "github",
        url: GITHUB_MCP_URL,
        getAccessToken: async () => githubPat,
      });
      console.log("core: github MCP server connected");
    } catch (cause) {
      console.error("core: github MCP server registration failed, continuing without it", cause);
    }
  } else {
    console.log("core: github MCP server not configured (set a PAT: security add-generic-password -a $USER -s jarvis-github-pat -w <token>)");
  }

  return registry;
}
