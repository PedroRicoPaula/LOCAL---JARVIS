/**
 * core/mcp/googleOAuth.ts — Google's standard OAuth 2.0 authorization-
 * code flow, "Web application" client type with a loopback
 * (`http://localhost`) redirect URI -- confirmed live (2026-08-06)
 * that Google's own docs explicitly exempt localhost redirect URIs
 * from the HTTPS requirement and that the loopback flow stays
 * supported for this client type (unlike native/mobile types, where
 * Google is deprecating it).
 *
 * Two halves, deliberately split:
 * - `exchangeCodeForTokens`/`refreshAccessToken` are pure HTTP exchanges
 *   against Google's token endpoint, `fetchFn`-injectable (CLAUDE.md
 *   § 3) -- these are what's actually unit-tested.
 * - `runInteractiveAuthorization` is the one-time, human-in-the-loop
 *   dance (opens a real browser, listens on a real local port) run
 *   once by `scripts/gmail_authorize.ts`, not by `core/main.ts` --
 *   same "wiring, proven live, not unit-tested" convention as
 *   `core/main.ts` itself. Only the refresh token it produces gets
 *   stored (Keychain); the access token is always re-derived from it.
 */

import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

export interface GoogleOAuthClientConfig {
  clientId: string;
  clientSecret: string;
  fetchFn?: typeof fetch;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms. */
  expiresAt: number;
}

async function postToken(config: GoogleOAuthClientConfig, body: Record<string, string>): Promise<TokenSet> {
  const fetchFn = config.fetchFn ?? fetch;
  const response = await fetchFn(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Google token endpoint returned HTTP ${response.status}: ${detail}`);
  }
  const payload = (await response.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  const tokens: TokenSet = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
  };
  if (payload.refresh_token !== undefined) tokens.refreshToken = payload.refresh_token;
  return tokens;
}

export function exchangeCodeForTokens(
  config: GoogleOAuthClientConfig,
  code: string,
  redirectUri: string,
): Promise<TokenSet> {
  return postToken(config, {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
}

export function refreshAccessToken(config: GoogleOAuthClientConfig, refreshToken: string): Promise<TokenSet> {
  return postToken(config, {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
}

export function buildAuthorizationUrl(config: Pick<GoogleOAuthClientConfig, "clientId">, redirectUri: string, scopes: readonly string[]): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline", // required to get a refresh_token back at all
    prompt: "consent", // forces a fresh refresh_token even on a re-auth
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/** In-memory access-token cache in front of the refresh flow -- Google
 * access tokens are short-lived (~1h); refreshing on every single MCP
 * call would be wasteful and slower than it needs to be. 60s of margin
 * before the real expiry so a token never gets handed out right as it
 * expires mid-request. */
export class GoogleTokenManager {
  private readonly config: GoogleOAuthClientConfig;
  private readonly getRefreshToken: () => Promise<string>;
  private cached: TokenSet | null = null;

  constructor(config: GoogleOAuthClientConfig, getRefreshToken: () => Promise<string>) {
    this.config = config;
    this.getRefreshToken = getRefreshToken;
  }

  async getAccessToken(): Promise<string> {
    if (this.cached && Date.now() < this.cached.expiresAt - 60_000) {
      return this.cached.accessToken;
    }
    const refreshToken = await this.getRefreshToken();
    this.cached = await refreshAccessToken(this.config, refreshToken);
    return this.cached.accessToken;
  }
}

/** The one-time interactive flow: opens the owner's real browser to
 * Google's consent screen, listens on a real local port for the
 * redirect, exchanges the code, and returns the tokens -- run once by
 * `scripts/gmail_authorize.ts`, never by `core/main.ts`. Not unit-
 * tested (a real browser + a real port), same convention as any other
 * pure-wiring entrypoint in this project. */
export async function runInteractiveAuthorization(
  config: GoogleOAuthClientConfig,
  scopes: readonly string[],
  port: number,
): Promise<TokenSet> {
  const redirectUri = `http://localhost:${port}/oauth/callback`;
  const authUrl = buildAuthorizationUrl(config, redirectUri, scopes);

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);
      if (url.pathname !== "/oauth/callback") {
        res.writeHead(404).end();
        return;
      }
      const error = url.searchParams.get("error");
      const authCode = url.searchParams.get("code");
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(error ? `Authorization failed: ${error}. You can close this tab.` : "Authorization complete. You can close this tab and return to the terminal.");
      server.close();
      if (error) reject(new Error(`Google returned an error: ${error}`));
      else if (authCode) resolve(authCode);
      else reject(new Error("Google's redirect had no code and no error -- unexpected"));
    });
    server.listen(port, () => {
      console.log(`Open this URL in your browser to authorize JARVIS:\n\n${authUrl}\n`);
      execFileAsync("open", [authUrl]).catch(() => {
        console.log("(couldn't open your browser automatically -- copy the URL above manually)");
      });
    });
  });

  return exchangeCodeForTokens(config, code, redirectUri);
}
