/**
 * core/mcp/registry.ts — connects to configured MCP (Model Context
 * Protocol) servers over Streamable HTTP, caches their tool lists, and
 * exposes a single `callTool()` entry point. This is the *only* place
 * an MCP tool actually gets invoked -- always after a real `Gate`
 * approval (`MCP_TOOL_CALL`, `core/executors/mcp.ts`), never called
 * directly by a skill (docs/SKILLS.md § 1: a skill cannot import an
 * executor).
 *
 * `connectFn` is injectable (CLAUDE.md § 3: no network, no models, in
 * tests) -- `realConnect` is the only thing that actually imports the
 * `@modelcontextprotocol/sdk` and opens a real connection.
 *
 * Server-declared `readOnlyHint`/`destructiveHint` annotations are
 * surfaced (for a more informative `humanSummary`) but never trusted to
 * skip approval -- every `MCP_TOOL_CALL` requires one, uniformly, per
 * `shared/types.ts`'s own docstring on that capability.
 */

export interface McpJsonSchema {
  type?: string;
  properties?: Record<string, { type?: string; description?: string }>;
  required?: string[];
}

export interface McpToolInfo {
  name: string;
  description?: string;
  readOnlyHint?: boolean;
  /** A server's own declared argument shape -- a skill uses this to
   * figure out what to actually pass, rather than a hardcoded/guessed
   * argument key. Real tool schemas vary per server; nothing in this
   * project assumes one shape ahead of seeing it. */
  inputSchema?: McpJsonSchema;
}

export interface McpCallResult {
  ok: boolean;
  text?: string;
  error?: string;
}

export interface McpConnection {
  listTools(): Promise<McpToolInfo[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<McpCallResult>;
}

/** The narrow, read-only slice of `McpRegistry` a skill actually sees
 * (`SkillContext.mcp`, `core/skills/mcp.ts`) -- discovery only, never
 * `callTool`. `McpRegistry` satisfies this structurally; skills never
 * import `McpRegistry` itself. */
export interface McpToolLister {
  hasServer(serverId: string): boolean;
  listTools(serverId: string): McpToolInfo[];
}

export interface McpServerConfig {
  id: string;
  url: string;
  /** Called fresh before connecting -- never cached here, so a token
   * refreshed elsewhere (e.g. `googleOAuth.ts`) is always current. */
  getAccessToken: () => Promise<string>;
}

export type ConnectFn = (config: McpServerConfig) => Promise<McpConnection>;

export class McpRegistry {
  private readonly connections = new Map<string, McpConnection>();
  private readonly toolCache = new Map<string, McpToolInfo[]>();
  private readonly connectFn: ConnectFn;

  constructor(connectFn: ConnectFn = realConnect) {
    this.connectFn = connectFn;
  }

  async register(config: McpServerConfig): Promise<void> {
    // `listTools()` runs *before* either map is touched -- found live
    // (2026-08-06): the previous order set `connections` first, so a
    // `listTools()` failure (e.g. the backing API disabled on Google's
    // side) left `hasServer()` reporting true forever with an empty,
    // never-retried tool cache, instead of the registration honestly
    // failing and being caught by the caller (`core/mcp/setup.ts`).
    const connection = await this.connectFn(config);
    const tools = await connection.listTools();
    this.connections.set(config.id, connection);
    this.toolCache.set(config.id, tools);
  }

  hasServer(serverId: string): boolean {
    return this.connections.has(serverId);
  }

  listTools(serverId: string): McpToolInfo[] {
    return this.toolCache.get(serverId) ?? [];
  }

  async callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<McpCallResult> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      return { ok: false, error: `MCP server "${serverId}" is not connected` };
    }
    return connection.callTool(toolName, args);
  }
}

/** The one function in this file that touches the real SDK/network. */
async function realConnect(config: McpServerConfig): Promise<McpConnection> {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");

  const client = new Client({ name: "jarvis", version: "0.1.0" });
  const accessToken = await config.getAccessToken();
  const transport = new StreamableHTTPClientTransport(new URL(config.url), {
    requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  // The SDK's own `Transport.sessionId?: string` (plain optional property)
  // and `StreamableHTTPClientTransport`'s `get sessionId(): string |
  // undefined` (a getter) aren't structurally identical under this
  // project's `exactOptionalPropertyTypes: true` -- a real, narrow
  // mismatch in the library's own types, not a mistake in this call.
  await client.connect(transport as Parameters<typeof client.connect>[0]);

  return {
    async listTools() {
      const { tools } = await client.listTools();
      return tools.map((t) => ({
        name: t.name,
        ...(t.description !== undefined ? { description: t.description } : {}),
        ...(t.annotations?.readOnlyHint !== undefined ? { readOnlyHint: t.annotations.readOnlyHint } : {}),
        inputSchema: t.inputSchema as McpJsonSchema,
      }));
    },
    async callTool(name: string, args: Record<string, unknown>): Promise<McpCallResult> {
      try {
        const result = await client.callTool({ name, arguments: args });
        const content: { type: string; text?: string }[] = "content" in result ? (result.content as { type: string; text?: string }[]) : [];
        const text = content.map((c) => (c.type === "text" ? (c.text ?? "") : `[${c.type} content]`)).join("\n");
        if ("isError" in result && result.isError) {
          return { ok: false, error: text || "MCP tool returned an error" };
        }
        return { ok: true, text };
      } catch (cause) {
        return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
      }
    },
  };
}
