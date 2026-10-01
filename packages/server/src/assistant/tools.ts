import type Anthropic from '@anthropic-ai/sdk';
import type { Site } from '../sites/site.ts';
import { fetchSiteContent } from '../sites/site-content.ts';
import { fetchSiteEditorContent } from '../sites/site-editor-content.ts';
import { fetchSiteThemeSchemas } from '../sites/site-theme-schemas.ts';
import { fetchSitePageTemplates } from '../sites/site-page-templates.ts';
import { fetchSitePreview } from '../sites/site-preview.ts';
import { fetchSiteLinks } from '../sites/site-links.ts';
import { fetchSiteSettings } from '../sites/site-settings.ts';
import { listSiteRedirects } from '../sites/site-redirects.ts';
import { listSiteMedia } from '../sites/site-media.ts';

// The assistant's tools, run here in the admin as the logged-in person
// against the one website they opened it on - the site and its token
// never come from the model or the browser. Ported from the dropped MCP
// server (b2c1c38), calling the site functions directly instead of the
// admin's own routes. Read-only for now (step 2 of the plan); editing
// tools come next.

export interface ToolContext {
  site: Pick<Site, 'url' | 'token'>;
  fetchImpl?: typeof fetch;
}

// A problem the model should read and react to (a page that doesn't
// exist, an unreachable website), sent back as the tool's result.
export class ToolError extends Error {}

export interface AssistantTool {
  definition: Anthropic.Tool;
  // What the panel shows while it runs, e.g. "Reading /about".
  label(input: Record<string, unknown>): string;
  run(context: ToolContext, input: Record<string, unknown>): Promise<unknown>;
}

const PAGE = { type: 'string', description: 'The page, as its URL ("/about") or its content path ("pages/about.json").' } as const;

function str(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ToolError(`"${key}" is required.`);
  }
  return value.trim();
}

function optionalStr(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

// A page's content path from its URL or path: "/" is pages/index.json,
// "/about/team" is pages/about/team.json. Menus pass through as paths.
export function contentPath(input: string): string {
  const trimmed = input.trim();
  if (/^(pages|menus)\/[a-z0-9][a-z0-9/_-]*\.json$/i.test(trimmed) && !trimmed.includes('//')) {
    return trimmed;
  }
  const url = trimmed.replace(/[?#].*$/, '').replace(/\/+$/, '');
  if (url === '' || url === '/') {
    return 'pages/index.json';
  }
  if (url.split('/').some((part) => part === '..' || part === '.')) {
    throw new ToolError(`"${input}" is not a page address.`);
  }
  return `pages/${url.replace(/^\/+/, '')}.json`;
}

export function pageUrl(path: string): string {
  const stem = path.replace(/^pages\//, '').replace(/\.json$/, '');
  return stem === 'index' ? '/' : `/${stem}`;
}

// A rendered page reduced to its title, headings and visible text: the
// whole HTML is far too large to hand the model.
export function pageText(html: string, limit = 12_000): { title: string | null; headings: string[]; text: string; truncated: boolean } {
  const decode = (value: string) =>
    value
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&rsquo;|&lsquo;/g, "'");
  const clean = html.replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, ' ');
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(clean)?.[1];
  const headings = [...clean.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map((match) => decode((match[1] ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(clean)?.[1] ?? clean;
  const text = decode(body.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  return { title: title ? decode(title).trim() : null, headings, text: text.slice(0, limit), truncated: text.length > limit };
}

// Every failed site call reads the same way to the model.
function failed(result: { outcome: string; message?: string }): never {
  throw new ToolError(result.message ?? `The website answered "${result.outcome}".`);
}

function noInput(): Anthropic.Tool['input_schema'] {
  return { type: 'object', properties: {}, additionalProperties: false };
}

export const READ_TOOLS: AssistantTool[] = [
  {
    definition: {
      name: 'list_pages',
      description:
        'Every page on the website: its URL, content path, name, title, type, whether it is published, and whether it has unpublished changes. Optionally filtered by words matched against the URL, name and title.',
      input_schema: {
        type: 'object',
        properties: { search: { type: 'string', description: 'Optional words to match.' } },
        additionalProperties: false,
      },
    },
    label: () => 'Looking through the pages',
    async run(context, input) {
      const result = await fetchSiteContent(context.site, { prefix: 'pages/' }, { fetchImpl: context.fetchImpl });
      if (result.outcome !== 'ok') {
        failed(result);
      }
      const search = optionalStr(input, 'search')?.toLowerCase();
      return result.entries
        .filter((entry) => entry.path.startsWith('pages/'))
        .filter((entry) => !search || [entry.url, entry.name, entry.title].some((value) => (value ?? '').toLowerCase().includes(search)))
        .map(({ path, url, name, title, type, published, hasDraft }) => ({ url, path, name, title, type, published, hasDraft }));
    },
  },
  {
    definition: {
      name: 'read_page',
      description:
        "A page's full content as JSON (its sections, their blocks and settings), or a menu's when given a menus/ path. Returns the unpublished draft when there is one, since that's what the person is working on; \"source\" says which.",
      input_schema: { type: 'object', properties: { page: PAGE }, required: ['page'], additionalProperties: false },
    },
    label: (input) => `Reading ${typeof input.page === 'string' ? input.page : 'a page'}`,
    async run(context, input) {
      const path = contentPath(str(input, 'page'));
      const result = await fetchSiteEditorContent(context.site, path, { fetchImpl: context.fetchImpl });
      if (result.outcome === 'not-found') {
        throw new ToolError(`There is no ${path.startsWith('menus/') ? 'menu' : 'page'} at ${path.startsWith('menus/') ? path : pageUrl(path)}.`);
      }
      if (result.outcome !== 'ok') {
        failed(result);
      }
      return {
        path,
        url: path.startsWith('pages/') ? pageUrl(path) : null,
        source: result.source,
        content: JSON.parse(new TextDecoder().decode(result.body)) as unknown,
      };
    },
  },
  {
    definition: {
      name: 'get_theme',
      description:
        "The section and block types this website's theme defines, each with its JSON Schema (the settings it takes, their types and allowed values), plus the page templates new pages start from.",
      input_schema: noInput(),
    },
    label: () => 'Checking the theme',
    async run(context) {
      const [schemas, templates] = await Promise.all([
        fetchSiteThemeSchemas(context.site, { fetchImpl: context.fetchImpl }),
        fetchSitePageTemplates(context.site, { fetchImpl: context.fetchImpl }),
      ]);
      if (schemas.outcome !== 'ok') {
        failed(schemas);
      }
      return {
        ...schemas.schemas,
        templates: templates.outcome === 'ok' ? templates.templates.map(({ id, title }) => ({ id, title })) : [],
      };
    },
  },
  {
    definition: {
      name: 'preview_page',
      description:
        'Renders a page as it would look published, including unpublished changes, and returns its title, headings and visible text. Use it to see what a page actually says.',
      input_schema: { type: 'object', properties: { page: PAGE }, required: ['page'], additionalProperties: false },
    },
    label: (input) => `Looking at ${typeof input.page === 'string' ? input.page : 'a page'}`,
    async run(context, input) {
      const url = pageUrl(contentPath(str(input, 'page')));
      const result = await fetchSitePreview(context.site, url, { fetchImpl: context.fetchImpl });
      if (result.outcome !== 'ok') {
        failed(result);
      }
      if (result.status === 404) {
        throw new ToolError(`There is no page at ${url}.`);
      }
      return { url, ...pageText(new TextDecoder().decode(result.body)) };
    },
  },
  {
    definition: {
      name: 'find_links',
      description: 'Everything on the website that links to a page: other pages, drafts, menus and site settings.',
      input_schema: { type: 'object', properties: { page: PAGE }, required: ['page'], additionalProperties: false },
    },
    label: (input) => `Finding links to ${typeof input.page === 'string' ? input.page : 'a page'}`,
    async run(context, input) {
      const url = pageUrl(contentPath(str(input, 'page')));
      const result = await fetchSiteLinks(context.site, url, { fetchImpl: context.fetchImpl });
      if (result.outcome !== 'ok') {
        failed(result);
      }
      return result.references;
    },
  },
  {
    definition: {
      name: 'list_menus',
      description: "The website's menus, each with its content path for read_page.",
      input_schema: noInput(),
    },
    label: () => 'Looking at the menus',
    async run(context) {
      const result = await fetchSiteContent(context.site, { prefix: 'menus/' }, { fetchImpl: context.fetchImpl });
      if (result.outcome !== 'ok') {
        failed(result);
      }
      return result.entries.filter((entry) => entry.path.startsWith('menus/')).map(({ path, name }) => ({ path, name }));
    },
  },
  {
    definition: {
      name: 'get_site_settings',
      description:
        'The website-wide settings (social links, announcement bar, fonts and so on): the schema the theme defines, the saved values, and the values templates actually see.',
      input_schema: noInput(),
    },
    label: () => 'Checking the site settings',
    async run(context) {
      const result = await fetchSiteSettings(context.site, { fetchImpl: context.fetchImpl });
      if (result.outcome !== 'ok') {
        failed(result);
      }
      const { schema, settings, resolved } = result.payload;
      return { schema, settings, resolved };
    },
  },
  {
    definition: {
      name: 'list_redirects',
      description: 'Every redirect on the website: which old address sends visitors to which page.',
      input_schema: noInput(),
    },
    label: () => 'Checking the redirects',
    async run(context) {
      const result = await listSiteRedirects(context.site, { fetchImpl: context.fetchImpl });
      if (result.outcome !== 'ok') {
        failed(result);
      }
      return result.entries;
    },
  },
  {
    definition: {
      name: 'list_media',
      description: 'The images and videos uploaded to the website, with the URL a page uses for each.',
      input_schema: noInput(),
    },
    label: () => 'Looking through the media',
    async run(context) {
      const result = await listSiteMedia(context.site, { fetchImpl: context.fetchImpl });
      if (result.outcome !== 'ok') {
        failed(result);
      }
      return result.items.map(({ name, url, size }) => ({ name, url, size }));
    },
  },
];
