// How the MCP tools are named, and the one name the rename left behind.
//
// Pure on purpose: `mcp.ts` connects to stdio at import time, so this is the
// part a test can read without starting a server.

/** Prefix of every tool name. The product is Pixel Gaming Studio. */
export const TOOL_PREFIX = 'pgs';

/** What it was called before the rename, still accepted — see `renameLegacyTool`. */
export const LEGACY_TOOL_PREFIX = 'pss';

/**
 * Accepts the old `pss_<command>` tool names **without listing them**, so an
 * agent that already learned them keeps working and the catalog stays at one
 * entry per command. Registering both names would double 140 tool
 * descriptions, and that catalog is what the MCP charges every agent session
 * for — the cost the audit says to bring down, not up.
 *
 * It rewrites the name in place, on the way in: the SDK chains a pre-existing
 * `transport.onmessage` before dispatching **the same object**, so setting this
 * as the transport's handler before `connect` is enough and nothing races the
 * handshake.
 */
export function renameLegacyTool(message: unknown): void {
  const m = message as { method?: string; params?: { name?: string } };
  if (m?.method !== 'tools/call') return;
  const name = m.params?.name;
  if (typeof name !== 'string' || !name.startsWith(`${LEGACY_TOOL_PREFIX}_`)) return;
  m.params!.name = `${TOOL_PREFIX}_${name.slice(LEGACY_TOOL_PREFIX.length + 1)}`;
}
