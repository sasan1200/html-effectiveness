// Pure helpers for the MCP bridge: token generation and client config snippets.

/** Generate a URL-safe random token. Uses Web Crypto when available. */
export function generateToken(bytes = 24): string {
  const arr = new Uint8Array(bytes);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) {
    c.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  let s = "";
  for (const b of arr) s += b.toString(16).padStart(2, "0");
  return s;
}

export interface BridgeInfo {
  port: number;
  token: string;
}

export function bridgeUrl(port: number): string {
  return `http://127.0.0.1:${port}/mcp`;
}

/** The `claude mcp add` command for Claude Code (HTTP transport). */
export function claudeCodeCommand(info: BridgeInfo): string {
  const auth = info.token ? ` --header "Authorization: Bearer ${info.token}"` : "";
  return `claude mcp add --transport http obsidian-vault ${bridgeUrl(info.port)}${auth}`;
}

/** A claude_desktop_config.json fragment (uses mcp-remote to bridge HTTP→stdio). */
export function claudeDesktopConfig(info: BridgeInfo): string {
  const args = ["-y", "mcp-remote", bridgeUrl(info.port)];
  if (info.token) args.push("--header", `Authorization: Bearer ${info.token}`);
  return JSON.stringify(
    {
      mcpServers: {
        "obsidian-vault": {
          command: "npx",
          args,
        },
      },
    },
    null,
    2,
  );
}
