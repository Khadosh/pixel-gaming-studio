// The tool names of the MCP server, and the one the rename left behind.
//
// Pixel Sprite Studio became Pixel Gaming Studio, so the tools are `pgs_*`. An
// agent that already learned `pss_*` keeps working, and the catalog does **not**
// carry both names: two entries per command would double what the MCP charges
// every agent session for.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { commands } from './commands';
import { LEGACY_TOOL_PREFIX, TOOL_PREFIX, renameLegacyTool } from './mcpnames';

describe('tool names', () => {
  it('the prefix is the new name and the old one is remembered', () => {
    expect(TOOL_PREFIX).toBe('pgs');
    expect(LEGACY_TOOL_PREFIX).toBe('pss');
  });

  it('rewrites an old tool name in place, and nothing else', () => {
    const call = { method: 'tools/call', params: { name: 'pss_render', arguments: { path: 'a' } } };
    renameLegacyTool(call);
    expect(call.params.name).toBe('pgs_render');
    expect(call.params.arguments).toEqual({ path: 'a' });

    const already = { method: 'tools/call', params: { name: 'pgs_render' } };
    renameLegacyTool(already);
    expect(already.params.name).toBe('pgs_render');

    // A command whose own name starts with "pss" would still be left alone:
    // only the prefix plus "_" counts.
    const other = { method: 'tools/call', params: { name: 'pssrender' } };
    renameLegacyTool(other);
    expect(other.params.name).toBe('pssrender');

    // Anything that is not a call is none of its business.
    const list = { method: 'tools/list', params: { name: 'pss_render' } };
    renameLegacyTool(list);
    expect(list.params.name).toBe('pss_render');
    expect(() => renameLegacyTool(undefined)).not.toThrow();
  });
});

/** One JSON-RPC conversation with the real server over stdio. */
function client(cwd: string) {
  const child: ChildProcessWithoutNullStreams = spawn(join(process.cwd(), 'bin/pgs-mcp'), { cwd });
  const pending = new Map<number, (v: Record<string, unknown>) => void>();
  let buffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffer += chunk;
    let nl = buffer.indexOf('\n');
    while (nl >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) {
        const msg = JSON.parse(line) as { id?: number };
        if (msg.id !== undefined) pending.get(msg.id)?.(msg as Record<string, unknown>);
      }
      nl = buffer.indexOf('\n');
    }
  });
  let id = 0;
  const send = (method: string, params?: unknown) => {
    const mine = ++id;
    const answer = new Promise<Record<string, unknown>>(resolve => pending.set(mine, resolve));
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: mine, method, params })}\n`);
    return answer;
  };
  const notify = (method: string) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`);
  return { child, send, notify, stop: () => child.kill() };
}

describe('the MCP server over stdio', () => {
  let dir: string;
  let mcp: ReturnType<typeof client> | undefined;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgs-mcp-')); });
  afterEach(() => { mcp?.stop(); rmSync(dir, { recursive: true, force: true }); });

  // From another directory: the bug this repo already paid for once was an
  // import resolved against the directory the process started in, and the test
  // that should have caught it ran standing inside the repo.
  it('lists only the new names and still answers to an old one', async () => {
    mcp = client(dir);
    const init = await mcp.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    });
    expect((init.result as { serverInfo: { name: string } }).serverInfo.name).toBe('pixel-gaming-studio');
    mcp.notify('notifications/initialized');

    const listed = await mcp.send('tools/list');
    const names = (listed.result as { tools: { name: string }[] }).tools.map(t => t.name);
    expect(names.length).toBe(commands.length);
    expect(names.every(n => n.startsWith('pgs_'))).toBe(true);
    expect(names).toContain('pgs_new');
    expect(names).not.toContain('pss_new');       // the catalog does not pay twice

    // The old name, which is what an agent that learned it before the rename sends.
    const path = join(dir, 'farol.pss.json');
    const called = await mcp.send('tools/call', {
      name: 'pss_new',
      arguments: { path, width: 4, height: 4, palette: ['#000000'] },
    });
    const content = (called.result as { isError?: boolean; content: { text?: string }[] });
    expect(content.isError).not.toBe(true);
    expect(content.content[0].text).toContain('farol');
    expect(existsSync(path)).toBe(true);

    // A name that is neither is still an error, so the alias is a rename and not a free-for-all.
    const bad = await mcp.send('tools/call', { name: 'pss_no_existe', arguments: {} });
    expect(JSON.stringify(bad)).toMatch(/not found/);
  }, 30000);
});
