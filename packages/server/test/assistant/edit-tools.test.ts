import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { ASSISTANT_TOOLS, ToolError, type PreviewEvent, type ToolContext } from '../../src/assistant/tools.ts';

// A cms-agent-shaped site holding pages in memory: live content, drafts
// over it, If-Match on draft saves (the live page's etag counts while
// there's no draft; "*" only while there's neither), publish and discard.
interface FakeSite {
  live: Map<string, string>;
  drafts: Map<string, string>;
  published: Array<{ paths: string[]; message: string; author: { name: string; email: string } }>;
}

let server: Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

const etagOf = (body: string) => `"${createHash('sha1').update(body).digest('hex')}"`;

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function startFakeSite(pages: Record<string, unknown>): Promise<{ context: ToolContext; site: FakeSite; events: PreviewEvent[] }> {
  const site: FakeSite = { live: new Map(Object.entries(pages).map(([path, content]) => [path, JSON.stringify(content)])), drafts: new Map(), published: [] };
  server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '';
    const send = (status: number, body: string, etag?: string) => {
      res.writeHead(status, { 'content-type': 'application/json', ...(etag ? { etag } : {}) });
      res.end(body);
    };
    if (url === '/v1/capabilities') {
      send(200, JSON.stringify({ agentVersion: '0.9.1', contentSchemaVersion: 7, sqliteDriver: 'node:sqlite' }));
      return;
    }
    if (url === '/v1/content') {
      send(200, '[]');
      return;
    }
    const draftMatch = /^\/v1\/drafts\/(.+)$/.exec(url);
    const liveMatch = /^\/v1\/content\/(.+)$/.exec(url);
    if (draftMatch && req.method === 'GET') {
      const body = site.drafts.get(draftMatch[1]!);
      send(body ? 200 : 404, body ?? '{"error":"not found"}', body ? etagOf(body) : undefined);
      return;
    }
    if (liveMatch && req.method === 'GET') {
      const body = site.live.get(liveMatch[1]!);
      send(body ? 200 : 404, body ?? '{"error":"not found"}', body ? etagOf(body) : undefined);
      return;
    }
    if (draftMatch && req.method === 'PUT') {
      const path = draftMatch[1]!;
      const current = site.drafts.get(path) ?? site.live.get(path);
      const ifMatch = req.headers['if-match'];
      if (current ? ifMatch !== etagOf(current) : ifMatch !== '*') {
        send(409, '{"error":"conflict","message":"Changed since you read it"}');
        return;
      }
      const body = await readBody(req);
      site.drafts.set(path, body);
      send(200, '{"ok":true}', etagOf(body));
      return;
    }
    if (draftMatch && req.method === 'DELETE') {
      site.drafts.delete(draftMatch[1]!);
      res.writeHead(204);
      res.end();
      return;
    }
    if (url === '/v1/publish' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req)) as FakeSite['published'][number];
      site.published.push(body);
      for (const path of body.paths) {
        site.live.set(path, site.drafts.get(path)!);
        site.drafts.delete(path);
      }
      send(200, '{"ok":true}');
      return;
    }
    send(404, '{"error":"not found"}');
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('expected a listening address');
  }
  const events: PreviewEvent[] = [];
  return {
    site,
    events,
    context: {
      site: { url: `http://127.0.0.1:${address.port}`, token: 't' },
      author: { name: 'Jane Editor (via Assistant)', email: 'jane@example.com' },
      preview: (event) => events.push(event),
    },
  };
}

function tool(name: string) {
  const found = ASSISTANT_TOOLS.find((candidate) => candidate.definition.name === name);
  assert.ok(found, `no tool ${name}`);
  return found;
}

const ABOUT = {
  schemaVersion: 7,
  name: 'About',
  title: 'About us',
  type: 'page',
  layout: 'theme',
  published: true,
  sections: [
    {
      id: 'hero',
      type: 'hero',
      settings: { heading: 'Our story', subheading: 'Since 2019' },
      blocks: [{ id: 'cta', type: 'button', settings: { label: 'Visit', url: '/visit' } }],
    },
  ],
};

describe('assistant editing tools', () => {
  it('changes only the named settings, as a draft, and reloads the preview on that page', async () => {
    const { context, site, events } = await startFakeSite({ 'pages/about.json': ABOUT });
    const read = (await tool('read_page').run(context, { page: '/about' })) as { etag: string; source: string };
    assert.equal(read.source, 'live');

    const result = (await tool('update_settings').run(context, {
      page: '/about',
      etag: read.etag,
      changes: [
        { id: 'hero', settings: { heading: 'Our distillery' } },
        { id: 'cta', settings: { label: 'Book a tasting' } },
      ],
    })) as { etag: string };

    const draft = JSON.parse(site.drafts.get('pages/about.json')!) as typeof ABOUT;
    assert.deepEqual(draft.sections[0]!.settings, { heading: 'Our distillery', subheading: 'Since 2019' });
    assert.deepEqual(draft.sections[0]!.blocks[0]!.settings, { label: 'Book a tasting', url: '/visit' });
    assert.equal(site.live.get('pages/about.json'), JSON.stringify(ABOUT), 'the live page is untouched');
    assert.deepEqual(events, [{ type: 'changed', path: 'pages/about.json', url: '/about' }]);

    // The new etag works for the next change; the old one is refused.
    await tool('update_settings').run(context, { page: '/about', etag: result.etag, changes: [{ id: 'hero', settings: { subheading: 'Since 2018' } }] });
    await assert.rejects(
      tool('update_settings').run(context, { page: '/about', etag: read.etag, changes: [{ id: 'hero', settings: { heading: 'x' } }] }),
      (error: unknown) => error instanceof ToolError && /changed by someone else/.test(error.message),
    );
  });

  it('says which id is unknown rather than guessing', async () => {
    const { context } = await startFakeSite({ 'pages/about.json': ABOUT });
    const read = (await tool('read_page').run(context, { page: '/about' })) as { etag: string };
    await assert.rejects(
      tool('update_settings').run(context, { page: '/about', etag: read.etag, changes: [{ id: 'nope', settings: { heading: 'x' } }] }),
      /There is no section or block "nope"/,
    );
  });

  it('publishes only through publish_page, credited to the person via the Assistant', async () => {
    const { context, site, events } = await startFakeSite({ 'pages/about.json': ABOUT });
    const read = (await tool('read_page').run(context, { page: '/about' })) as { etag: string };
    await tool('update_settings').run(context, { page: '/about', etag: read.etag, changes: [{ id: 'hero', settings: { heading: 'Ours' } }] });

    await tool('publish_page').run(context, { page: '/about' });

    assert.deepEqual(site.published, [
      { paths: ['pages/about.json'], message: 'Publish /about', author: { name: 'Jane Editor (via Assistant)', email: 'jane@example.com' } },
    ]);
    assert.match(site.live.get('pages/about.json')!, /"heading":"Ours"/);
    assert.deepEqual(events.at(-1), { type: 'changed', path: 'pages/about.json', url: '/about' });
  });

  it('creates a new page as a draft with the website\'s content version, and refuses one that exists', async () => {
    const { context, site, events } = await startFakeSite({ 'pages/about.json': ABOUT });
    await tool('create_page').run(context, { url: '/tastings', name: 'Tastings' });
    assert.deepEqual(JSON.parse(site.drafts.get('pages/tastings.json')!), {
      type: 'page',
      layout: 'theme',
      sections: [],
      schemaVersion: 7,
      name: 'Tastings',
      title: 'Tastings',
      published: false,
    });
    assert.deepEqual(events, [{ type: 'changed', path: 'pages/tastings.json', url: '/tastings' }]);
    await assert.rejects(tool('create_page').run(context, { url: '/about', name: 'About' }), /already a page at \/about/);
  });

  it('shows a page in the preview, and discards a draft back to the live page', async () => {
    const { context, site, events } = await startFakeSite({ 'pages/about.json': ABOUT });
    await tool('show_page').run(context, { page: 'pages/about.json' });
    assert.deepEqual(events, [{ type: 'show', path: 'pages/about.json', url: '/about' }]);

    const read = (await tool('read_page').run(context, { page: '/about' })) as { etag: string };
    await tool('update_settings').run(context, { page: '/about', etag: read.etag, changes: [{ id: 'hero', settings: { heading: 'x' } }] });
    await tool('discard_changes').run(context, { page: '/about' });
    assert.equal(site.drafts.has('pages/about.json'), false);
  });
});
