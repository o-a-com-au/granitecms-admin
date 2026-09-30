#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AdminClient } from './admin-client.ts';
import { createServer } from './server.ts';

// granite-mcp: started by an MCP client (Claude Code, Claude Desktop,
// Cursor...), which talks to it over stdin/stdout - so nothing but the
// protocol may ever be written to stdout; messages go to stderr.
//
//   GRANITE_API_KEY    required - a personal key from the admin's
//                      Settings -> AI Agents
//   GRANITE_ADMIN_URL  the admin's address (default: the hosted admin)
const DEFAULT_ADMIN_URL = 'https://granitecmsadmin-production.up.railway.app';

const apiKey = process.env.GRANITE_API_KEY?.trim();
if (!apiKey) {
  console.error('granite-mcp: set GRANITE_API_KEY to a key from the Granite admin (Settings -> AI Agents).');
  process.exit(1);
}

const version = (JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf-8')) as { version: string }).version;
const client = new AdminClient({ baseUrl: process.env.GRANITE_ADMIN_URL?.trim() || DEFAULT_ADMIN_URL, apiKey });
await createServer(client, version).connect(new StdioServerTransport());
console.error(`granite-mcp ${version}: connected to ${client.baseUrl}`);
