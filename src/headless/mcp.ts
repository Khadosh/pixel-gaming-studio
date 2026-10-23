// MCP server over stdio: every headless command becomes a tool named pgs_<command>.
// Commands that only look (render, contact, lint…) answer text and image; the
// ones that write answer one line and show the image only with preview: true
// (brief.ts). The detail of an asset is pgs_inspect.
//
// What `tools/list` publishes is not the SDK's dump of the zod schemas but
// `publishedTools` (mcpcatalog.ts): the same structure with one-sentence
// descriptions and only the short field descriptions, because every agent
// session pays for the whole catalog. What it leaves out is `pgs_doc`.
// Validation is untouched: `tools/call` still parses with the zod schema.
//
// The scene map steps (map_grove, map_wall…) are registered but listed only in
// maps mode, `bin/pgs-mcp --maps` or PGS_MCP_MAPS=1: see MAP_CORE in mcpcatalog.ts.
//
// The old `pss_<command>` names are still accepted and deliberately not listed:
// see `renameLegacyTool` in mcpnames.ts.
//
//   npx tsx src/headless/mcp.ts [--maps]        (or bin/pgs-mcp [--maps])

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { commands } from './commands';
import { LOOKING, mcpContent } from './brief';
import { TOOL_PREFIX, renameLegacyTool } from './mcpnames';
import { instructions, listedCommands, mapsMode, publishedTools } from './mcpcatalog';

const maps = mapsMode(process.argv.slice(2), process.env);
const listed = listedCommands(commands, maps);
const server = new McpServer(
  { name: 'pixel-gaming-studio', version: '0.1.0' },
  { instructions: instructions(commands.length - listed.length) },
);

for (const cmd of commands) {
  server.registerTool(
    `${TOOL_PREFIX}_${cmd.name}`,
    {
      description: cmd.description,
      inputSchema: LOOKING.has(cmd.name)
        ? cmd.schema.shape
        : { ...cmd.schema.shape, preview: z.boolean().optional() },
    },
    async (args: unknown) => {
      try {
        const { preview, ...rest } = (args ?? {}) as { preview?: boolean } & Record<string, unknown>;
        const result = await cmd.run(rest as never);
        return { content: mcpContent(cmd.name, result, preview === true) };
      } catch (err) {
        return { content: [{ type: 'text', text: `error: ${(err as Error).message}` }], isError: true };
      }
    },
  );
}

// The catalog is computed once: the commands do not change while the server runs.
const catalog = publishedTools(listed);
server.server.removeRequestHandler('tools/list');
server.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: catalog }));

const transport = new StdioServerTransport();
transport.onmessage = renameLegacyTool;
await server.connect(transport);
