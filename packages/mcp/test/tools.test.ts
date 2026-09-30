import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { AdminClient, AdminError } from '../src/admin-client.ts';
import { contentPath, pageText, pageUrl, TOOLS } from '../src/tools.ts';
import { createServer, describeError } from '../src/server.ts';

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}

// A fake admin: answers by "METHOD path" and records every request.
function fakeAdmin(routes: Record<string, (call: Call) => Response>) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString());
    const call: Call = {
      method: init?.method ?? 'GET',
      url: `${url.pathname}${url.search}`,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
    };
    calls.push(call);
    const handler = routes[`${call.method} ${url.pathname}`];
    return handler ? handler(call) : new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  }) as typeof fetch;
  return { client: new AdminClient({ baseUrl: 'https://admin.example/', apiKey: 'gck_test', fetchImpl }), calls };
}

const tool = (name: string) => TOOLS.find((candidate) => candidate.name === name)!;
const PAGE = { schemaVersion: 7, name: 'About', title: 'About', type: 'page', layout: 'theme', published: true, sections: [] };

describe('paths and page text', () => {
  it('turns a URL or content path into the content path, and back into its URL', () => {
    assert.equal(contentPath('/'), 'pages/index.json');
    assert.equal(contentPath('/about/team/'), 'pages/about/team.json');
    assert.equal(contentPath('about?x=1'), 'pages/about.json');
    assert.equal(contentPath('pages/about.json'), 'pages/about.json');
    assert.equal(contentPath('menus/main.json'), 'menus/main.json');
    assert.equal(pageUrl('pages/index.json'), '/');
    assert.equal(pageUrl('pages/about/team.json'), '/about/team');
  });

  it('reduces a rendered page to its title, headings and visible text, without scripts or styles', () => {
    const result = pageText(
      '<html><head><title>About &amp; us</title><style>p{}</style></head><body><h1>Our <em>story</em></h1><p>Small&nbsp;batch.</p><script>alert(1)</script></body></html>',
    );
    assert.deepEqual(result, { title: 'About & us', headings: ['Our story'], text: 'Our story Small batch.', truncated: false });
  });
});

describe('tools', () => {
  it('every request carries the API key, and read_page returns the etag and whether it is a draft', async () => {
    const { client, calls } = fakeAdmin({
      'GET /api/sites/site-1/content/pages/about.json': () =>
        new Response(JSON.stringify(PAGE), { headers: { etag: '"e1"', 'x-content-source': 'draft' } }),
    });
    const result = (await tool('read_page').run(client, { site_id: 'site-1', page: '/about' })) as Record<string, unknown>;
    assert.equal(calls[0]?.headers.Authorization, 'Bearer gck_test');
    assert.deepEqual({ ...result, content: undefined }, { path: 'pages/about.json', url: '/about', source: 'draft', etag: '"e1"', content: undefined });
  });

  it('save_draft sends the whole page with the etag, fetching the current one only when none is given', async () => {
    const { client, calls } = fakeAdmin({
      'GET /api/sites/site-1/content/pages/about.json': () => new Response(JSON.stringify(PAGE), { headers: { etag: '"current"' } }),
      'PUT /api/sites/site-1/drafts/pages/about.json': () => new Response('', { status: 200, headers: { etag: '"new"' } }),
    });
    await tool('save_draft').run(client, { site_id: 'site-1', page: 'pages/about.json', content: PAGE, etag: '"given"' });
    assert.equal(calls.at(-1)?.headers['If-Match'], '"given"');
    assert.deepEqual(calls.at(-1)?.body, PAGE);

    const saved = (await tool('save_draft').run(client, { site_id: 'site-1', page: '/about', content: PAGE })) as Record<string, unknown>;
    assert.equal(calls.at(-1)?.headers['If-Match'], '"current"');
    assert.equal(saved.etag, '"new"');
  });

  it("create_page makes an unpublished draft at the site's current schema version, from a template when asked, never over an existing page", async () => {
    let exists = false;
    const { client, calls } = fakeAdmin({
      'GET /api/sites': () => new Response(JSON.stringify([{ id: 'site-1', status: { state: 'ok', contentSchemaVersion: 7 } }])),
      'GET /api/sites/site-1/theme/page-templates': () =>
        new Response(JSON.stringify({ templates: [{ id: 'article', title: 'Article', content: { type: 'article', layout: 'theme', sections: [{ id: 's1', type: 'hero', settings: {} }] } }] })),
      'PUT /api/sites/site-1/drafts/pages/news/spring.json': () =>
        exists ? new Response(JSON.stringify({ message: 'Conflict' }), { status: 409 }) : new Response('', { headers: { etag: '"n"' } }),
    });
    await tool('create_page').run(client, { site_id: 'site-1', url: '/news/spring', title: 'Spring', template: 'article' });
    const put = calls.at(-1)!;
    assert.equal(put.headers['If-Match'], '*');
    assert.deepEqual(put.body, {
      type: 'article',
      layout: 'theme',
      sections: [{ id: 's1', type: 'hero', settings: {} }],
      schemaVersion: 7,
      name: 'Spring',
      title: 'Spring',
      published: false,
    });

    exists = true;
    await assert.rejects(tool('create_page').run(client, { site_id: 'site-1', url: '/news/spring', title: 'Spring' }), /already exists at \/news\/spring/);
  });

  it('publish_page publishes the draft with a message; save_menu keeps the menu and replaces only its items', async () => {
    const { client, calls } = fakeAdmin({
      'POST /api/sites/site-1/publish': () => new Response('{"ok":true}'),
      'GET /api/sites/site-1/content/menus/main.json': () =>
        new Response(JSON.stringify({ schemaVersion: 7, name: 'Main', items: [{ label: 'Old', url: '/old' }] }), { headers: { etag: '"m1"' } }),
      'PUT /api/sites/site-1/menus/menus/main.json': () => new Response('', { headers: { etag: '"m2"' } }),
    });
    await tool('publish_page').run(client, { site_id: 'site-1', page: '/about' });
    assert.deepEqual(calls.at(-1)?.body, { path: 'pages/about.json', message: 'Publish /about' });

    await tool('save_menu').run(client, { site_id: 'site-1', handle: 'main', items: [{ label: 'About', url: '/about' }] });
    const put = calls.at(-1)!;
    assert.equal(put.headers['If-Match'], '"m1"');
    assert.deepEqual(put.body, {
      content: { schemaVersion: 7, name: 'Main', items: [{ label: 'About', url: '/about' }] },
      message: 'Update the menus/main.json menu',
    });
  });

  it('turns admin refusals into messages an agent can act on', async () => {
    const { client } = fakeAdmin({
      'PUT /api/sites/site-1/drafts/pages/about.json': () =>
        new Response(JSON.stringify({ message: 'Draft failed validation', errors: [{ path: '/sections/0/settings/heading', message: 'must be string' }] }), { status: 400 }),
      'POST /api/sites/site-1/publish': () => new Response(JSON.stringify({ error: 'This API key can only save drafts', reason: 'insufficient-permission' }), { status: 403 }),
    });
    const invalid = await tool('save_draft').run(client, { site_id: 'site-1', page: '/about', content: PAGE, etag: '"e"' }).catch((error: unknown) => error);
    assert.equal(describeError(invalid), 'Draft failed validation\n- /sections/0/settings/heading: must be string');

    const refused = await tool('publish_page').run(client, { site_id: 'site-1', page: '/about' }).catch((error: unknown) => error);
    assert.ok(refused instanceof AdminError);
    assert.match(describeError(refused), /can only save drafts\n.*new key in Settings -> AI Agents/);
  });
});

describe('MCP server', () => {
  it('lists every tool with its schema and a read-only hint, answers tool calls, and reports failures as tool errors', async () => {
    const { client } = fakeAdmin({
      'GET /api/sites': () => new Response(JSON.stringify([{ id: 'site-1', url: 'https://ember.example' }])),
    });
    const server = createServer(client, '0.0.0-test');
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const mcp = new Client({ name: 'test', version: '1' });
    await Promise.all([server.connect(serverSide), mcp.connect(clientSide)]);

    assert.match(mcp.getInstructions() ?? '', /Call how_to_edit before changing anything/);
    const { tools } = await mcp.listTools();
    assert.deepEqual(tools.map((entry) => entry.name), TOOLS.map((entry) => entry.name));
    assert.equal(tools.find((entry) => entry.name === 'list_sites')?.annotations?.readOnlyHint, true);
    assert.equal(tools.find((entry) => entry.name === 'publish_page')?.annotations?.readOnlyHint, false);

    const sites = await mcp.callTool({ name: 'list_sites', arguments: {} });
    assert.match((sites.content as Array<{ text: string }>)[0]!.text, /ember\.example/);

    const failed = await mcp.callTool({ name: 'read_page', arguments: { site_id: 'site-1', page: '/missing' } });
    assert.equal(failed.isError, true);
    await mcp.close();
  });
});
