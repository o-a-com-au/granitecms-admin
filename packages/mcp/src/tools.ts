import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { AdminError, encodePath, type AdminClient } from './admin-client.ts';
import { EDITING_GUIDE } from './guide.ts';

// The tools an AI assistant gets. Plain objects with plain JSON Schema
// inputs, not tied to any MCP library, so the same definitions can be
// served locally over stdio now (server.ts) and by the admin itself
// later. Each maps onto an admin route the admin's own web app uses;
// the admin checks the API key's permission, so a tool the key isn't
// allowed to use fails with a clear message rather than being hidden.

type JsonSchema = Record<string, unknown>;

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, JsonSchema>; required?: string[]; additionalProperties: false };
  annotations: { readOnlyHint: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
  run(client: AdminClient, args: Record<string, unknown>): Promise<unknown>;
}

const SITE_ID: JsonSchema = { type: 'string', description: 'The website, as an id from list_sites.' };
const PAGE: JsonSchema = {
  type: 'string',
  description: 'The page, as its URL ("/about") or its content path ("pages/about.json").',
};
const MESSAGE: JsonSchema = { type: 'string', description: 'Optional: a short description for the site history.' };

function str(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AdminError(400, `"${key}" is required.`, 'invalid');
  }
  return value.trim();
}

function optionalStr(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function site(args: Record<string, unknown>): string {
  return `/api/sites/${encodeURIComponent(str(args, 'site_id'))}`;
}

// A page's content path from either its URL or its path: "/" is
// pages/index.json, "/about/team" is pages/about/team.json.
export function contentPath(input: string): string {
  const trimmed = input.trim();
  if (/^(pages|menus)\/.+\.json$/.test(trimmed)) {
    return trimmed;
  }
  const url = trimmed.replace(/[?#].*$/, '').replace(/\/+$/, '');
  if (url === '' || url === '/') {
    return 'pages/index.json';
  }
  return `pages/${url.replace(/^\/+/, '')}.json`;
}

// The URL a page is served at, from its content path.
export function pageUrl(path: string): string {
  const stem = path.replace(/^pages\//, '').replace(/\.json$/, '');
  return stem === 'index' ? '/' : `/${stem}`;
}

// A rendered page reduced to what an agent can use: its title, headings
// and visible text - not the whole HTML, which is far too large.
export function pageText(html: string, limit = 12_000): { title: string | null; headings: string[]; text: string; truncated: boolean } {
  const decode = (value: string) =>
    value
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
      .replace(/&mdash;|&ndash;/g, '-');
  const clean = html.replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, ' ');
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(clean)?.[1];
  const headings = [...clean.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map((match) => decode((match[1] ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(clean)?.[1] ?? clean;
  const text = decode(body.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  return {
    title: title ? decode(title).trim() : null,
    headings,
    text: text.slice(0, limit),
    truncated: text.length > limit,
  };
}

async function readPage(client: AdminClient, siteBase: string, path: string) {
  const response = await client.request('GET', `${siteBase}/content/${encodePath(path)}`);
  return {
    path,
    url: path.startsWith('pages/') ? pageUrl(path) : null,
    // "draft" when unpublished changes exist; that's what an edit builds on.
    source: response.headers.get('x-content-source'),
    etag: response.headers.get('etag'),
    content: JSON.parse(response.text) as unknown,
  };
}

async function currentEtag(client: AdminClient, siteBase: string, path: string): Promise<string> {
  try {
    return (await readPage(client, siteBase, path)).etag ?? '*';
  } catch (error) {
    if (error instanceof AdminError && error.status === 404) {
      return '*';
    }
    throw error;
  }
}

export const TOOLS: ToolDefinition[] = [
  {
    name: 'how_to_edit',
    title: 'How to edit a Granite website',
    description:
      'Read this first. The rules for editing a Granite CMS website: how pages, sections and blocks are structured, how to read, change and publish them safely, and what to avoid.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run() {
      return EDITING_GUIDE;
    },
  },
  {
    name: 'list_sites',
    title: 'List websites',
    description: 'The websites this API key can work on, with each one\'s id (used by every other tool), address and status.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run(client) {
      return client.json('GET', '/api/sites');
    },
  },
  {
    name: 'list_pages',
    title: 'List pages',
    description:
      'Every page on a website: its URL, content path, name, title, type, whether it is published, and whether it has unpublished changes. Optionally filtered by a search term matched against the URL, name and title.',
    inputSchema: {
      type: 'object',
      properties: { site_id: SITE_ID, search: { type: 'string', description: 'Optional words to match.' } },
      required: ['site_id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(client, args) {
      const entries = await client.json<Array<Record<string, unknown>>>('GET', `${site(args)}/content`);
      const search = optionalStr(args, 'search')?.toLowerCase();
      return entries
        .filter((entry) => typeof entry.path === 'string' && entry.path.startsWith('pages/'))
        .filter((entry) => !search || ['url', 'name', 'title'].some((key) => String(entry[key] ?? '').toLowerCase().includes(search)))
        .map(({ path, url, name, title, type, published, hasDraft }) => ({ url, path, name, title, type, published, hasDraft }));
    },
  },
  {
    name: 'read_page',
    title: 'Read a page',
    description:
      'A page\'s full content as JSON - its sections, their blocks and settings - plus the etag to pass to save_draft. Returns the unpublished draft when there is one, since that is what an edit should build on.',
    inputSchema: { type: 'object', properties: { site_id: SITE_ID, page: PAGE }, required: ['site_id', 'page'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run(client, args) {
      return readPage(client, site(args), contentPath(str(args, 'page')));
    },
  },
  {
    name: 'get_theme',
    title: 'Get the theme\'s section and block types',
    description:
      'The section and block types this website\'s theme defines, each with its JSON Schema (the settings it takes, their types and allowed values), plus the page templates available to create_page. Content must use only these types and match these schemas.',
    inputSchema: { type: 'object', properties: { site_id: SITE_ID }, required: ['site_id'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run(client, args) {
      const [schemas, templates] = await Promise.all([
        client.json<Record<string, unknown>>('GET', `${site(args)}/theme/schemas`),
        client.json<{ templates: Array<{ id: string; title: string }> }>('GET', `${site(args)}/theme/page-templates`),
      ]);
      return { ...schemas, templates: templates.templates.map(({ id, title }) => ({ id, title })) };
    },
  },
  {
    name: 'save_draft',
    title: 'Save a page draft',
    description:
      'Saves a page\'s whole content as an unpublished draft - nothing changes on the live website until publish_page. Pass the complete page JSON (read it with read_page, change it, send it all back), and the etag read_page gave you so someone else\'s newer changes are never overwritten. The website validates it and explains any problem field by field.',
    inputSchema: {
      type: 'object',
      properties: {
        site_id: SITE_ID,
        page: PAGE,
        content: { type: 'object', description: 'The complete page JSON.' },
        etag: { type: 'string', description: 'The etag from read_page. Without it the current one is used, which risks overwriting a change made since you read the page.' },
      },
      required: ['site_id', 'page', 'content'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run(client, args) {
      const siteBase = site(args);
      const path = contentPath(str(args, 'page'));
      const etag = optionalStr(args, 'etag') ?? (await currentEtag(client, siteBase, path));
      const response = await client.request('PUT', `${siteBase}/drafts/${encodePath(path)}`, {
        json: args.content,
        headers: { 'If-Match': etag },
      });
      return {
        saved: true,
        path,
        url: pageUrl(path),
        etag: response.headers.get('etag'),
        next: 'Check it with preview_page, then publish_page when it is ready. Nothing is live yet.',
      };
    },
  },
  {
    name: 'create_page',
    title: 'Create a page',
    description:
      'Creates a new, unpublished page at a URL, starting blank or from one of the theme\'s page templates (see get_theme). It is a draft until published with publish_page. Fill in its sections with save_draft.',
    inputSchema: {
      type: 'object',
      properties: {
        site_id: SITE_ID,
        url: { type: 'string', description: 'The new page\'s URL, e.g. "/news/spring-release". Its parent page should already exist.' },
        title: { type: 'string', description: 'The page title, shown in the browser tab and page listings.' },
        type: { type: 'string', description: 'Optional: the kind of page, e.g. "article" (default "page", or the template\'s own).' },
        template: { type: 'string', description: 'Optional: a template id from get_theme to start from.' },
      },
      required: ['site_id', 'url', 'title'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run(client, args) {
      const siteBase = site(args);
      const path = contentPath(str(args, 'url'));
      const title = str(args, 'title');
      const templateId = optionalStr(args, 'template');
      let base: Record<string, unknown> = { type: 'page', layout: 'theme', sections: [] };
      if (templateId) {
        const { templates } = await client.json<{ templates: Array<{ id: string; content: unknown }> }>('GET', `${siteBase}/theme/page-templates`);
        const template = templates.find((entry) => entry.id === templateId);
        if (!template) {
          throw new AdminError(400, `No template "${templateId}". get_theme lists the templates.`, 'invalid');
        }
        base = template.content as Record<string, unknown>;
      }
      // The version the website's CMS writes now, from its own status.
      const sites = await client.json<Array<{ id: string; status?: { contentSchemaVersion?: number } }>>('GET', '/api/sites');
      const schemaVersion = sites.find((entry) => entry.id === str(args, 'site_id'))?.status?.contentSchemaVersion;
      if (typeof schemaVersion !== 'number') {
        throw new AdminError(502, 'The website is not answering right now, so a page can\'t be created.', 'unreachable');
      }
      const content = { ...base, schemaVersion, name: title, title, published: false, type: optionalStr(args, 'type') ?? base.type ?? 'page' };
      try {
        await client.request('PUT', `${siteBase}/drafts/${encodePath(path)}`, { json: content, headers: { 'If-Match': '*' } });
      } catch (error) {
        if (error instanceof AdminError && error.status === 409) {
          throw new AdminError(409, `A page already exists at ${pageUrl(path)}.`, 'conflict');
        }
        throw error;
      }
      return { created: true, path, url: pageUrl(path), published: false, next: 'Add its sections with read_page and save_draft, then publish_page.' };
    },
  },
  {
    name: 'discard_draft',
    title: 'Discard a page draft',
    description:
      'Throws away a page\'s unpublished changes, leaving the live page as it is. For a page that has never been published, this removes it entirely.',
    inputSchema: { type: 'object', properties: { site_id: SITE_ID, page: PAGE }, required: ['site_id', 'page'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true },
    async run(client, args) {
      const path = contentPath(str(args, 'page'));
      await client.request('DELETE', `${site(args)}/drafts/${encodePath(path)}`);
      return { discarded: true, path };
    },
  },
  {
    name: 'preview_page',
    title: 'Preview a page',
    description:
      'Renders a page the way publishing it would - including unpublished changes - and returns its title, headings and visible text, to check a change before publishing.',
    inputSchema: { type: 'object', properties: { site_id: SITE_ID, page: PAGE }, required: ['site_id', 'page'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run(client, args) {
      const url = pageUrl(contentPath(str(args, 'page')));
      const response = await client.request('GET', `${site(args)}/preview${url === '/' ? '/' : url}`);
      return { url, ...pageText(response.text) };
    },
  },
  {
    name: 'publish_page',
    title: 'Publish a page',
    description:
      'Makes a page\'s unpublished changes live on the website, straight away. Needs an API key allowed to publish. Every publish is recorded in the website\'s history, credited to the key\'s owner as done by an AI agent, and can be undone there.',
    inputSchema: { type: 'object', properties: { site_id: SITE_ID, page: PAGE, message: MESSAGE }, required: ['site_id', 'page'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run(client, args) {
      const path = contentPath(str(args, 'page'));
      await client.request('POST', `${site(args)}/publish`, { json: { path, message: optionalStr(args, 'message') ?? `Publish ${pageUrl(path)}` } });
      return { published: true, path, url: pageUrl(path) };
    },
  },
  {
    name: 'find_links',
    title: 'Find links to a page',
    description: 'Everything on the website that links to a page: other pages, drafts, menus and site settings.',
    inputSchema: { type: 'object', properties: { site_id: SITE_ID, page: PAGE }, required: ['site_id', 'page'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run(client, args) {
      const url = pageUrl(contentPath(str(args, 'page')));
      return client.json('GET', `${site(args)}/links?to=${encodeURIComponent(url)}`);
    },
  },
  {
    name: 'get_site_settings',
    title: 'Get site settings',
    description:
      'The website-wide settings (social links, announcement bar, fonts and so on): the schema the theme defines, the saved values, the values templates actually see, and the etag for save_site_settings.',
    inputSchema: { type: 'object', properties: { site_id: SITE_ID }, required: ['site_id'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run(client, args) {
      const response = await client.request('GET', `${site(args)}/settings`);
      return { ...(JSON.parse(response.text) as object), etag: response.headers.get('etag') };
    },
  },
  {
    name: 'save_site_settings',
    title: 'Save site settings',
    description:
      'Saves the website-wide settings. There is no draft step: this changes every page of the live website immediately, so it needs an API key allowed to publish. Pass all the settings (read them with get_site_settings first) and its etag.',
    inputSchema: {
      type: 'object',
      properties: {
        site_id: SITE_ID,
        settings: { type: 'object', description: 'Every setting value, keyed by setting name.' },
        etag: { type: 'string', description: 'The etag from get_site_settings.' },
        message: MESSAGE,
      },
      required: ['site_id', 'settings'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run(client, args) {
      const siteBase = site(args);
      const etag = optionalStr(args, 'etag') ?? (await client.request('GET', `${siteBase}/settings`)).headers.get('etag') ?? '*';
      await client.request('PUT', `${siteBase}/settings`, {
        json: { settings: args.settings, message: optionalStr(args, 'message') ?? 'Update site settings' },
        headers: { 'If-Match': etag },
      });
      return { saved: true, live: true };
    },
  },
  {
    name: 'save_menu',
    title: 'Save a menu',
    description:
      'Replaces a menu\'s items (label and URL each). Menus have no draft step: this changes the live website immediately, so it needs an API key allowed to publish. Read the menu first with read_page("menus/<handle>.json").',
    inputSchema: {
      type: 'object',
      properties: {
        site_id: SITE_ID,
        handle: { type: 'string', description: 'The menu\'s handle, e.g. "main" for menus/main.json.' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: { label: { type: 'string' }, url: { type: 'string' } },
            required: ['label', 'url'],
            additionalProperties: false,
          },
        },
        message: MESSAGE,
      },
      required: ['site_id', 'handle', 'items'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run(client, args) {
      const siteBase = site(args);
      const path = `menus/${str(args, 'handle').replace(/\.json$/, '')}.json`;
      const current = await readPage(client, siteBase, path);
      const envelope = current.content as Record<string, unknown>;
      await client.request('PUT', `${siteBase}/menus/${encodePath(path)}`, {
        json: { content: { ...envelope, items: args.items }, message: optionalStr(args, 'message') ?? `Update the ${path} menu` },
        headers: { 'If-Match': current.etag ?? '*' },
      });
      return { saved: true, live: true, path };
    },
  },
  {
    name: 'list_redirects',
    title: 'List redirects',
    description: 'Every redirect on the website: which old address sends visitors to which page.',
    inputSchema: { type: 'object', properties: { site_id: SITE_ID }, required: ['site_id'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run(client, args) {
      return client.json('GET', `${site(args)}/redirects`);
    },
  },
  {
    name: 'add_redirect',
    title: 'Add a redirect',
    description:
      'Sends visitors from an old address to a page on the website. Takes effect immediately (needs an API key allowed to publish). Only applies where no real page exists at the old address.',
    inputSchema: {
      type: 'object',
      properties: {
        site_id: SITE_ID,
        from: { type: 'string', description: 'The old address, e.g. "/old-offer".' },
        to: { type: 'string', description: 'The page to send visitors to, e.g. "/offers".' },
        note: { type: 'string', description: 'Optional: why the redirect exists.' },
      },
      required: ['site_id', 'from', 'to'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run(client, args) {
      const from = str(args, 'from');
      const to = str(args, 'to');
      await client.request('POST', `${site(args)}/redirects`, {
        json: { from, to, ...(optionalStr(args, 'note') ? { note: optionalStr(args, 'note') } : {}), message: `Redirect ${from} to ${to}` },
      });
      return { added: true, from, to };
    },
  },
  {
    name: 'list_media',
    title: 'List media',
    description: 'The images and videos uploaded to the website, with the URL to use in an image or video setting.',
    inputSchema: { type: 'object', properties: { site_id: SITE_ID }, required: ['site_id'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run(client, args) {
      return client.json('GET', `${site(args)}/media`);
    },
  },
  {
    name: 'upload_media',
    title: 'Upload an image or video',
    description:
      'Uploads a file from this computer to the website\'s media library (JPG, PNG, GIF, WebP, MP4 or WebM, within the site\'s size limit) and returns the URL to use in an image or video setting. It is not shown anywhere until a page uses it.',
    inputSchema: {
      type: 'object',
      properties: { site_id: SITE_ID, file_path: { type: 'string', description: 'The file\'s full path on this computer.' } },
      required: ['site_id', 'file_path'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run(client, args) {
      const filePath = str(args, 'file_path');
      const bytes = await readFile(filePath);
      const form = new FormData();
      form.append('file', new Blob([bytes]), basename(filePath));
      const response = await client.request('POST', `${site(args)}/media`, { body: form });
      return JSON.parse(response.text) as unknown;
    },
  },
];
