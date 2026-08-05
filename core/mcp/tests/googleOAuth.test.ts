import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  GoogleTokenManager,
  refreshAccessToken,
} from "../googleOAuth.ts";

function fakeFetch(status: number, body: unknown): { fn: typeof fetch; calls: { url: string; init: RequestInit | undefined }[] } {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fn: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response;
  };
  return { fn, calls };
}

test("exchangeCodeForTokens posts the authorization_code grant with the exact params Google expects", async () => {
  const { fn, calls } = fakeFetch(200, { access_token: "at", refresh_token: "rt", expires_in: 3600 });
  const config = { clientId: "cid", clientSecret: "secret", fetchFn: fn };

  const tokens = await exchangeCodeForTokens(config, "the-code", "http://localhost:51789/oauth/callback");

  assert.equal(tokens.accessToken, "at");
  assert.equal(tokens.refreshToken, "rt");
  assert.ok(tokens.expiresAt > Date.now());
  const body = new URLSearchParams(calls[0]?.init?.body as string);
  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("code"), "the-code");
  assert.equal(body.get("redirect_uri"), "http://localhost:51789/oauth/callback");
  assert.equal(body.get("client_id"), "cid");
});

test("refreshAccessToken posts the refresh_token grant", async () => {
  const { fn, calls } = fakeFetch(200, { access_token: "new-at", expires_in: 3600 });
  const config = { clientId: "cid", clientSecret: "secret", fetchFn: fn };

  const tokens = await refreshAccessToken(config, "the-refresh-token");

  assert.equal(tokens.accessToken, "new-at");
  assert.equal(tokens.refreshToken, undefined); // refresh grants don't return a new one
  const body = new URLSearchParams(calls[0]?.init?.body as string);
  assert.equal(body.get("grant_type"), "refresh_token");
  assert.equal(body.get("refresh_token"), "the-refresh-token");
});

test("a non-2xx response from Google's token endpoint throws, not a silent bad token", async () => {
  const { fn } = fakeFetch(400, { error: "invalid_grant" });
  const config = { clientId: "cid", clientSecret: "secret", fetchFn: fn };

  await assert.rejects(() => refreshAccessToken(config, "expired-or-revoked"), /HTTP 400/);
});

test("buildAuthorizationUrl includes offline access and the exact scopes given", () => {
  const url = buildAuthorizationUrl({ clientId: "cid" }, "http://localhost:51789/oauth/callback", ["scope-a", "scope-b"]);
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("client_id"), "cid");
  assert.equal(parsed.searchParams.get("redirect_uri"), "http://localhost:51789/oauth/callback");
  assert.equal(parsed.searchParams.get("scope"), "scope-a scope-b");
  assert.equal(parsed.searchParams.get("access_type"), "offline");
});

test("GoogleTokenManager caches the access token and does not refresh again before it expires", async () => {
  let refreshCalls = 0;
  const { fn } = fakeFetch(200, { access_token: "at-1", expires_in: 3600 });
  const wrappedFetch: typeof fn = async (...args) => {
    refreshCalls += 1;
    return fn(...args);
  };
  const manager = new GoogleTokenManager({ clientId: "cid", clientSecret: "secret", fetchFn: wrappedFetch }, async () => "rt");

  const first = await manager.getAccessToken();
  const second = await manager.getAccessToken();

  assert.equal(first, "at-1");
  assert.equal(second, "at-1");
  assert.equal(refreshCalls, 1);
});

test("GoogleTokenManager refreshes again once the cached token is near expiry", async () => {
  let call = 0;
  const responses = [
    { access_token: "at-1", expires_in: 0 }, // expires immediately
    { access_token: "at-2", expires_in: 3600 },
  ];
  const fn = async () =>
    ({
      ok: true,
      status: 200,
      json: async () => responses[call++],
      text: async () => "",
    }) as Response;
  const manager = new GoogleTokenManager({ clientId: "cid", clientSecret: "secret", fetchFn: fn }, async () => "rt");

  const first = await manager.getAccessToken();
  const second = await manager.getAccessToken();

  assert.equal(first, "at-1");
  assert.equal(second, "at-2");
});
