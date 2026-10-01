import type { FastifyInstance } from 'fastify';
import type Anthropic from '@anthropic-ai/sdk';
import type { SiteStore } from '../store/site-store.ts';
import type { SiteAccessStore } from '../store/site-access-store.ts';
import type { UserStore } from '../store/user-store.ts';
import { createRequireAuth } from '../auth/require-auth.ts';
import { createRequireSiteAccess } from '../auth/require-site-access.ts';
import { formatFullName } from '../auth/full-name.ts';
import { planOf } from '../auth/users.ts';
import { SiteNotFoundError } from '../sites/site-not-found-error.ts';
import { describeModelError, type AssistantModel } from '../assistant/model.ts';
import { buildSystemPrompt, withCurrentPage } from '../assistant/prompt.ts';
import { ASSISTANT_TOOLS } from '../assistant/tools.ts';
import { runAssistant, type AssistantEvent } from '../assistant/run-assistant.ts';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

interface AssistantBody {
  messages: ChatMessage[];
  currentUrl: string | null;
}

// Long enough for any real conversation, short enough that one request
// can't send the model (and the bill) an essay.
const MAX_MESSAGES = 60;
const MAX_MESSAGE_CHARS = 20_000;

function parseBody(body: unknown): AssistantBody | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const { messages, currentUrl } = body as Record<string, unknown>;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return null;
  }
  const parsed: ChatMessage[] = [];
  for (const message of messages) {
    if (typeof message !== 'object' || message === null) {
      return null;
    }
    const { role, text } = message as Record<string, unknown>;
    if ((role !== 'user' && role !== 'assistant') || typeof text !== 'string' || text.length > MAX_MESSAGE_CHARS) {
      return null;
    }
    parsed.push({ role, text });
  }
  if (parsed.at(-1)?.role !== 'user' || parsed.at(-1)?.text.trim() === '') {
    return null;
  }
  const url = typeof currentUrl === 'string' && currentUrl.startsWith('/') && currentUrl.length < 2000 ? currentUrl : null;
  return { messages: parsed, currentUrl: url };
}

// The conversation as Claude takes it: the visible text of each turn
// (tool calls from earlier turns aren't kept; it looks again if it needs
// to), merged so roles alternate, with an empty reply (a stopped one)
// left out.
function toModelMessages(body: AssistantBody): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];
  body.messages.forEach((message, index) => {
    const text = index === body.messages.length - 1 ? withCurrentPage(message.text, body.currentUrl) : message.text;
    if (text.trim() === '') {
      return;
    }
    const last = messages.at(-1);
    if (last && last.role === message.role && typeof last.content === 'string') {
      last.content = `${last.content}\n\n${text}`;
    } else {
      messages.push({ role: message.role, content: text });
    }
  });
  while (messages[0]?.role === 'assistant') {
    messages.shift();
  }
  return messages;
}

// POST /api/sites/:id/assistant - one message to the assistant, answered
// as a stream of newline-separated JSON events (AssistantEvent). Runs as
// the logged-in person on the one website in the URL; the site and its
// token never come from the browser or the model. Available on websites
// whose owner is on the Pro plan.
export function createAssistantRoutes(
  usersStore: UserStore,
  sitesStore: SiteStore,
  siteAccessStore: SiteAccessStore,
  model: AssistantModel | undefined,
  fetchImpl?: typeof fetch,
) {
  const requireAuth = createRequireAuth(usersStore);
  const requireSiteAccess = createRequireSiteAccess(sitesStore, siteAccessStore, (request) => (request.params as { id: string }).id);

  return async function assistantRoutes(app: FastifyInstance): Promise<void> {
    app.post<{ Params: { id: string } }>('/:id/assistant', { preHandler: [requireAuth, requireSiteAccess] }, async (request, reply) => {
      const site = await sitesStore.find(request.params.id);
      if (!site) {
        throw new SiteNotFoundError(request.params.id);
      }
      const owner = await usersStore.find(site.ownerId);
      if (!owner || planOf(owner) !== 'pro') {
        reply.code(403);
        return { error: 'The assistant is part of the Pro plan.', reason: 'plan' };
      }
      if (!model) {
        reply.code(503);
        return { error: "The assistant isn't set up on this admin yet.", reason: 'not-configured' };
      }
      const body = parseBody(request.body);
      if (!body) {
        reply.code(400);
        return { error: 'Expected the conversation, ending with a message from you.', reason: 'invalid' };
      }

      const person = request.currentUser!;
      const personName = formatFullName(person.firstName, person.lastName) || person.email;
      const controller = new AbortController();
      request.raw.on('close', () => controller.abort());

      reply.hijack();
      reply.raw.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' });
      const emit = (event: AssistantEvent) => {
        if (!reply.raw.writableEnded) {
          reply.raw.write(`${JSON.stringify(event)}\n`);
        }
      };

      try {
        const usage = await runAssistant({
          model,
          tools: ASSISTANT_TOOLS,
          toolContext: {
            site,
            fetchImpl,
            // Credited to the person, marked as done through the
            // assistant, in the website's history.
            author: { name: `${personName} (via Assistant)`, email: person.email },
            preview: emit,
          },
          system: buildSystemPrompt({
            siteName: new URL(site.url).host,
            siteUrl: site.url,
            personName,
          }),
          messages: toModelMessages(body),
          emit,
          signal: controller.signal,
        });
        request.log.info({ siteId: site.id, userId: person.id, usage }, 'assistant reply');
        emit({ type: 'done' });
      } catch (error) {
        if (!controller.signal.aborted) {
          request.log.error({ err: error, siteId: site.id }, 'assistant failed');
          emit({ type: 'error', message: describeModelError(error) });
        }
      } finally {
        reply.raw.end();
      }
    });
  };
}
