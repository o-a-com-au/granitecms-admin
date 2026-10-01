import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type Anthropic from '@anthropic-ai/sdk';
import { buildServer, type ServerDeps } from '../../src/server.ts';
import { openInMemoryStore } from '../../src/store/in-memory-store.ts';
import { openInMemoryUserStore } from '../../src/store/user-store.ts';
import { openInMemorySiteStore } from '../../src/store/site-store.ts';
import { openInMemorySiteAccessStore } from '../../src/store/site-access-store.ts';
import { openInMemorySiteInviteStore } from '../../src/store/site-invite-store.ts';
import { hashPassword } from '../../src/auth/password.ts';
import type { SessionRecord } from '../../src/auth/session-store-adapter.ts';
import type { AssistantModel, AssistantModelRequest } from '../../src/assistant/model.ts';
import type { AdminUserPlan } from '../../src/auth/users.ts';

const PASSWORD = 'correct-horse-battery';
const TOKEN = 'site-token';

let fakeSite: Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve) => (fakeSite ? fakeSite.close(() => resolve()) : resolve()));
  fakeSite = undefined;
});

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

// A cms-agent-shaped site with two pages; each URL answered on its own,
// and only with the right token.
async function startFakeSite(): Promise<string> {
  fakeSite = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/v1/capabilities') {
      sendJson(res, 200, { agentVersion: '0.9.1', contentSchemaVersion: 7, sqliteDriver: 'node:sqlite' });
      return;
    }
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      sendJson(res, 401, { error: 'invalid-token' });
      return;
    }
    if (req.url?.startsWith('/v1/content')) {
      sendJson(res, 200, [
        { path: 'pages/index.json', name: 'Home', title: 'Home | Ember', type: 'page', published: true, hasDraft: false, url: '/', changedAt: null },
        { path: 'pages/tastings.json', name: 'Tastings', title: 'Tastings', type: 'page', published: true, hasDraft: true, url: '/tastings', changedAt: null },
      ]);
      return;
    }
    sendJson(res, 404, { error: 'not found' });
  });
  await new Promise<void>((resolve) => fakeSite!.listen(0, '127.0.0.1', resolve));
  const address = fakeSite.address();
  if (address === null || typeof address === 'string') {
    throw new Error('expected a listening address');
  }
  return `http://127.0.0.1:${address.port}`;
}

function message(content: Anthropic.ContentBlock[], stopReason: Anthropic.Message['stop_reason']): Anthropic.Message {
  return {
    id: 'msg',
    type: 'message',
    role: 'assistant',
    model: 'fake',
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  } as Anthropic.Message;
}

// Plays back scripted replies, streaming each one's text, and records
// what it was sent.
function fakeModel(replies: Anthropic.Message[]): AssistantModel & { requests: AssistantModelRequest[] } {
  const requests: AssistantModelRequest[] = [];
  return {
    requests,
    async send(request, onText) {
      requests.push(structuredClone(request));
      const reply = replies.shift();
      assert.ok(reply, 'the model was called more times than scripted');
      for (const block of reply.content) {
        if (block.type === 'text') {
          onText(block.text);
        }
      }
      return reply;
    },
  };
}

async function setup(options: { plan?: AdminUserPlan; model?: AssistantModel } = {}) {
  const usersStore = openInMemoryUserStore();
  const { hash, salt } = hashPassword(PASSWORD);
  await usersStore.save({
    id: 'jane',
    username: 'jane',
    passwordHash: hash,
    passwordSalt: salt,
    firstName: 'Jane',
    lastName: 'Editor',
    email: 'jane@example.com',
    role: 'developer',
    status: 'active',
    timezone: 'UTC',
    createdAt: new Date().toISOString(),
    plan: options.plan ?? 'pro',
  });
  const deps: ServerDeps = {
    usersStore,
    sessionRecordStore: openInMemoryStore<SessionRecord>(),
    sessionSecret: randomBytes(48).toString('hex'),
    sitesStore: openInMemorySiteStore(),
    siteAccessStore: openInMemorySiteAccessStore(),
    siteInviteStore: openInMemorySiteInviteStore(),
    oauthProviders: [],
    baseUrl: '',
    mailer: undefined,
    assistantModel: options.model,
  };
  const app = await buildServer(undefined, deps);
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'jane', password: PASSWORD } });
  const setCookie = login.headers['set-cookie'];
  const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)!.split(';')[0] as string;
  const siteUrl = await startFakeSite();
  const created = await app.inject({ method: 'POST', url: '/api/sites', headers: { cookie }, payload: { url: siteUrl, token: TOKEN } });
  const siteId = created.json().id as string;
  return { app, cookie, siteId };
}

function events(body: string): Array<Record<string, unknown>> {
  return body
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('POST /api/sites/:id/assistant', () => {
  it('answers with streamed text, using a tool on the website along the way', async () => {
    const model = fakeModel([
      message([{ type: 'tool_use', id: 'call-1', name: 'list_pages', input: { search: 'tast' }, caller: { type: 'direct' } } as Anthropic.ContentBlock], 'tool_use'),
      message([{ type: 'text', text: 'You have one page about tastings: Tastings (/tastings).', citations: null } as Anthropic.ContentBlock], 'end_turn'),
    ]);
    const { app, cookie, siteId } = await setup({ model });

    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/assistant`,
      headers: { cookie },
      payload: { messages: [{ role: 'user', text: 'Which pages are about tastings?' }], currentUrl: '/' },
    });

    assert.equal(response.statusCode, 200);
    assert.match(String(response.headers['content-type']), /application\/x-ndjson/);
    assert.deepEqual(events(response.body), [
      { type: 'tool', label: 'Looking through the pages' },
      { type: 'text', text: 'You have one page about tastings: Tastings (/tastings).' },
      { type: 'done' },
    ]);

    // The first call had the person's message with what they're looking
    // at; the second carried the tool's result from the real website.
    const first = model.requests[0]!;
    assert.match(first.system, /You're helping: Jane Editor/);
    assert.deepEqual(first.messages, [{ role: 'user', content: '[Showing in their preview: /. "This page" means it.]\n\nWhich pages are about tastings?' }]);
    const result = (model.requests[1]!.messages[2]!.content as Anthropic.ToolResultBlockParam[])[0]!;
    assert.equal(result.tool_use_id, 'call-1');
    assert.deepEqual(JSON.parse(result.content as string), [
      { url: '/tastings', path: 'pages/tastings.json', name: 'Tastings', title: 'Tastings', type: 'page', published: true, hasDraft: true },
    ]);
  });

  it('sends an earlier conversation along, and reports a tool failure back to the model rather than failing', async () => {
    const model = fakeModel([
      message([{ type: 'tool_use', id: 'call-1', name: 'read_page', input: { page: '/missing' }, caller: { type: 'direct' } } as Anthropic.ContentBlock], 'tool_use'),
      message([{ type: 'text', text: "There's no page at /missing.", citations: null } as Anthropic.ContentBlock], 'end_turn'),
    ]);
    const { app, cookie, siteId } = await setup({ model });

    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/assistant`,
      headers: { cookie },
      payload: {
        messages: [
          { role: 'user', text: 'Hello' },
          { role: 'assistant', text: 'Hi! How can I help?' },
          { role: 'user', text: 'What does /missing say?' },
        ],
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(model.requests[0]!.messages.length, 3);
    const result = (model.requests[1]!.messages[4]!.content as Anthropic.ToolResultBlockParam[])[0]!;
    assert.equal(result.is_error, true);
    assert.equal(events(response.body).at(-1)?.type, 'done');
  });

  it('turns a failed model call into a message the person can act on', async () => {
    const model: AssistantModel = {
      async send() {
        throw new Error('boom');
      },
    };
    const { app, cookie, siteId } = await setup({ model });

    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/assistant`,
      headers: { cookie },
      payload: { messages: [{ role: 'user', text: 'Hello' }] },
    });

    assert.deepEqual(events(response.body), [{ type: 'error', message: 'Something went wrong with the assistant. Try again.' }]);
  });

  it('stops after too many steps for one message', async () => {
    const toolCall = () =>
      message([{ type: 'tool_use', id: 'call', name: 'list_pages', input: {}, caller: { type: 'direct' } } as Anthropic.ContentBlock], 'tool_use');
    const model = fakeModel(Array.from({ length: 12 }, toolCall));
    const { app, cookie, siteId } = await setup({ model });

    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/assistant`,
      headers: { cookie },
      payload: { messages: [{ role: 'user', text: 'Loop forever' }] },
    });

    assert.equal(model.requests.length, 12);
    const texts = events(response.body).filter((event) => event.type === 'text');
    assert.match(String(texts.at(-1)?.text), /more steps than I'm allowed/);
  });

  it('is only for websites owned by a Pro account', async () => {
    const { app, cookie, siteId } = await setup({ plan: 'free', model: fakeModel([]) });
    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/assistant`,
      headers: { cookie },
      payload: { messages: [{ role: 'user', text: 'Hello' }] },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().reason, 'plan');
  });

  it('says so when the admin has no API key set up', async () => {
    const { app, cookie, siteId } = await setup();
    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/assistant`,
      headers: { cookie },
      payload: { messages: [{ role: 'user', text: 'Hello' }] },
    });
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().reason, 'not-configured');
  });

  it('refuses a conversation that does not end with a message from the person, and needs a login', async () => {
    const { app, cookie, siteId } = await setup({ model: fakeModel([]) });
    const invalid = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/assistant`,
      headers: { cookie },
      payload: { messages: [{ role: 'assistant', text: 'Hi' }] },
    });
    assert.equal(invalid.statusCode, 400);

    const anonymous = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/assistant`,
      payload: { messages: [{ role: 'user', text: 'Hello' }] },
    });
    assert.equal(anonymous.statusCode, 401);
  });
});
