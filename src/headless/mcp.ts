// MCP server over stdio: every headless command becomes a tool named pss_<command>.
// Commands that only look (render, contact, lint…) answer text and image; the
// ones that write answer one line and show the image only with preview: true
// (brief.ts). The detail of an asset is pss_inspect.
//
//   npx tsx src/headless/mcp.ts        (or bin/pss-mcp)

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { commands } from './commands';
import { LOOKING, mcpContent } from './brief';

const server = new McpServer({ name: 'pixel-sprite-studio', version: '0.1.0' });

for (const cmd of commands) {
  server.registerTool(
    `pss_${cmd.name}`,
    {
      description: LOOKING.has(cmd.name)
        ? cmd.description
        : `${cmd.description} Answers one line; preview: true adds the image.`,
      inputSchema: LOOKING.has(cmd.name)
        ? cmd.schema.shape
        : { ...cmd.schema.shape, preview: z.boolean().optional().describe('also return the image (default false)') },
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

const transport = new StdioServerTransport();
await server.connect(transport);
