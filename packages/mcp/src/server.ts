import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { AdminError, type AdminClient } from './admin-client.ts';
import { TOOLS } from './tools.ts';

export const SERVER_INSTRUCTIONS =
  'Tools for editing Granite CMS websites through the Granite admin. Call how_to_edit before changing anything. Page edits are saved as drafts and only go live with publish_page; site settings, menus and redirects go live as soon as they are saved.';

// What went wrong, in terms an agent can act on.
export function describeError(error: unknown): string {
  if (!(error instanceof AdminError)) {
    return error instanceof Error ? error.message : String(error);
  }
  const lines = [error.message];
  for (const field of error.errors) {
    lines.push(`- ${field.path || '(the page)'}: ${field.message}`);
  }
  switch (error.reason) {
    case 'invalid-api-key':
      lines.push('Check GRANITE_API_KEY, or create a new key in the Granite admin under Settings -> AI Agents.');
      break;
    case 'insufficient-permission':
      lines.push("This key's owner can give it more permission by creating a new key in Settings -> AI Agents.");
      break;
    case 'plan-required':
      lines.push("AI agent access needs the website owner's account to be on the Pro plan.");
      break;
    case 'not-available-to-api-keys':
      lines.push('Ask the person to do this in the Granite admin instead.');
      break;
    case 'conflict':
      lines.push('It changed since you read it: call read_page again, reapply your change to the new version, and save that.');
      break;
    default:
      break;
  }
  return lines.join('\n');
}

export function createServer(client: AdminClient, version: string): Server {
  const server = new Server({ name: 'granite-cms', version }, { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: { title: tool.title, ...tool.annotations },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = TOOLS.find((candidate) => candidate.name === request.params.name);
    if (!tool) {
      return { content: [{ type: 'text', text: `There is no tool called "${request.params.name}".` }], isError: true };
    }
    try {
      const result = await tool.run(client, (request.params.arguments ?? {}) as Record<string, unknown>);
      const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      return { content: [{ type: 'text', text }] };
    } catch (error) {
      return { content: [{ type: 'text', text: describeError(error) }], isError: true };
    }
  });

  return server;
}
