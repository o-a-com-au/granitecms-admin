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
import { saveSiteDraft, type ValidationFieldError } from '../sites/site-draft-save.ts';
import { publishSite } from '../sites/site-publish.ts';
import { discardSiteDraft } from '../sites/site-draft-discard.ts';
import { checkSiteStatus } from '../sites/site-status.ts';
import type { CommitAuthor } from '../sites/commit-author.ts';

// The assistant's tools, run here in the admin as the logged-in person
// against the one website they opened it on - the site and its token
// never come from the model or the browser. Ported from the dropped MCP
// server (b2c1c38), calling the site functions directly instead of the
// admin's own routes.

// Tells the person's preview to follow along: show a page, or reload
// one that just changed (which also refreshes the top bar's Save
// Changes / Discard Changes buttons).
export type PreviewEvent = { type: 'show'; path: string; url: string } | { type: 'changed'; path: string; url: string };

export interface ToolContext {
  site: Pick<Site, 'url' | 'token'>;
  fetchImpl?: typeof fetch;
  // Who changes are credited to in the website's history.
  author?: CommitAuthor;
  preview?: (event: PreviewEvent) => void;
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
        "A page's full content as JSON (its sections, their blocks and settings, each section and block with its id), or a menu's when given a menus/ path, plus the etag to pass when changing it. Returns the unsaved draft when there is one, since that's what the person is working on; \"source\" says which.",
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
        // Pass to update_settings or save_page, so a change made since
        // is never overwritten.
        etag: result.etag,
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

// --- Changing pages ---------------------------------------------------
// Every change is a draft: it shows in the preview at once, and nothing
// changes on the live website until publish_page ("Save Changes" in the
// admin), which the assistant only uses when the person asks.

interface PageNode {
  id?: unknown;
  type?: unknown;
  settings?: unknown;
  blocks?: unknown;
}

// A section or block by its id, anywhere in the page.
function findNode(nodes: unknown, id: string): PageNode | null {
  if (!Array.isArray(nodes)) {
    return null;
  }
  for (const node of nodes as PageNode[]) {
    if (typeof node !== 'object' || node === null) {
      continue;
    }
    if (node.id === id) {
      return node;
    }
    const inner = findNode(node.blocks, id);
    if (inner) {
      return inner;
    }
  }
  return null;
}

function describeInvalid(message: string, errors: ValidationFieldError[]): string {
  const details = errors.slice(0, 10).map((error) => `${error.path || '(page)'}: ${error.message}`);
  return [`The website refused the change: ${message}`, ...details].join('\n');
}

async function readForEdit(context: ToolContext, path: string): Promise<{ etag: string; content: Record<string, unknown> }> {
  const result = await fetchSiteEditorContent(context.site, path, { fetchImpl: context.fetchImpl });
  if (result.outcome === 'not-found') {
    throw new ToolError(`There is no page at ${pageUrl(path)}.`);
  }
  if (result.outcome !== 'ok') {
    failed(result);
  }
  return { etag: result.etag, content: JSON.parse(new TextDecoder().decode(result.body)) as Record<string, unknown> };
}

async function saveDraft(context: ToolContext, path: string, content: unknown, etag: string): Promise<string> {
  const result = await saveSiteDraft(context.site, path, JSON.stringify(content), etag, { fetchImpl: context.fetchImpl });
  if (result.outcome === 'conflict') {
    throw new ToolError(`${pageUrl(path)} was changed by someone else since you read it. Read it again and redo your change.`);
  }
  if (result.outcome === 'invalid') {
    throw new ToolError(describeInvalid(result.message, result.errors));
  }
  if (result.outcome !== 'ok') {
    failed(result);
  }
  context.preview?.({ type: 'changed', path, url: pageUrl(path) });
  return result.etag;
}

function requireAuthor(context: ToolContext): CommitAuthor {
  if (!context.author) {
    throw new ToolError('Changes need a signed-in person to credit them to.');
  }
  return context.author;
}

export const EDIT_TOOLS: AssistantTool[] = [
  {
    definition: {
      name: 'show_page',
      description:
        "Shows a page in the person's preview, beside the chat. Use it when you start working on a page, or when they ask to see one.",
      input_schema: { type: 'object', properties: { page: PAGE }, required: ['page'], additionalProperties: false },
    },
    label: (input) => `Opening ${typeof input.page === 'string' ? input.page : 'a page'}`,
    async run(context, input) {
      const url = pageUrl(contentPath(str(input, 'page')));
      context.preview?.({ type: 'show', path: contentPath(str(input, 'page')), url });
      return { showing: url };
    },
  },
  {
    definition: {
      name: 'update_settings',
      description:
        "Changes settings (headings, text, links, images and so on) on sections or blocks of a page, as a draft the person sees in their preview straight away. Each change names a section or block by its id (from read_page) and gives only the settings to change; every other setting is kept. Use this for wording and other content changes; use save_page to add, remove or reorder sections. Pass the etag read_page gave you.",
      input_schema: {
        type: 'object',
        properties: {
          page: PAGE,
          etag: { type: 'string', description: 'The etag from read_page.' },
          changes: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'The section or block id.' },
                settings: { type: 'object', description: 'The settings to change, with their new values.' },
              },
              required: ['id', 'settings'],
              additionalProperties: false,
            },
          },
        },
        required: ['page', 'etag', 'changes'],
        additionalProperties: false,
      },
    },
    label: (input) => `Updating ${typeof input.page === 'string' ? input.page : 'a page'}`,
    async run(context, input) {
      const path = contentPath(str(input, 'page'));
      const etag = str(input, 'etag');
      const changes = Array.isArray(input.changes) ? (input.changes as Array<{ id?: unknown; settings?: unknown }>) : [];
      if (changes.length === 0) {
        throw new ToolError('"changes" needs at least one change.');
      }
      const current = await readForEdit(context, path);
      for (const change of changes) {
        if (typeof change.id !== 'string' || typeof change.settings !== 'object' || change.settings === null || Array.isArray(change.settings)) {
          throw new ToolError('Each change needs an "id" and a "settings" object.');
        }
        const node = findNode(current.content.sections, change.id);
        if (!node) {
          throw new ToolError(`There is no section or block "${change.id}" on ${pageUrl(path)}. Read the page again for the ids.`);
        }
        const existing = typeof node.settings === 'object' && node.settings !== null ? (node.settings as Record<string, unknown>) : {};
        node.settings = { ...existing, ...(change.settings as Record<string, unknown>) };
      }
      // The etag read_page gave, so a change made meanwhile (in the
      // editor, by someone else) is refused rather than overwritten.
      const newEtag = await saveDraft(context, path, current.content, etag);
      return { saved: 'as a draft', url: pageUrl(path), etag: newEtag };
    },
  },
  {
    definition: {
      name: 'save_page',
      description:
        "Saves a page's whole content as a draft the person sees in their preview straight away: for adding, removing or reordering sections and blocks. Send the complete page JSON from read_page with your changes, keeping everything else exactly as it was, and the etag read_page gave you. New sections and blocks need an id unique on the page, a type from get_theme, and settings matching that type's schema.",
      input_schema: {
        type: 'object',
        properties: {
          page: PAGE,
          etag: { type: 'string', description: 'The etag from read_page.' },
          content: { type: 'object', description: 'The complete page JSON.' },
        },
        required: ['page', 'etag', 'content'],
        additionalProperties: false,
      },
    },
    label: (input) => `Updating ${typeof input.page === 'string' ? input.page : 'a page'}`,
    async run(context, input) {
      const path = contentPath(str(input, 'page'));
      if (typeof input.content !== 'object' || input.content === null || Array.isArray(input.content)) {
        throw new ToolError('"content" must be the complete page JSON.');
      }
      const newEtag = await saveDraft(context, path, input.content, str(input, 'etag'));
      return { saved: 'as a draft', url: pageUrl(path), etag: newEtag };
    },
  },
  {
    definition: {
      name: 'create_page',
      description:
        "Creates a new page at a URL as a draft (not on the live website until published), blank or from one of the theme's page templates (get_theme), and shows it in the preview. Fill in its sections with read_page then save_page.",
      input_schema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The new page\'s URL, e.g. "/news/spring-release". Its parent page should already exist.' },
          name: { type: 'string', description: 'The page name, as the admin\'s page list shows it.' },
          title: { type: 'string', description: 'The title for the browser tab and search engines. Defaults to the name.' },
          template: { type: 'string', description: 'Optional: a template id from get_theme to start from.' },
        },
        required: ['url', 'name'],
        additionalProperties: false,
      },
    },
    label: (input) => `Creating ${typeof input.url === 'string' ? input.url : 'a page'}`,
    async run(context, input) {
      const path = contentPath(str(input, 'url'));
      if (!path.startsWith('pages/')) {
        throw new ToolError('A new page needs an address like "/about".');
      }
      const name = str(input, 'name');
      const templateId = optionalStr(input, 'template');
      let base: Record<string, unknown> = { type: 'page', layout: 'theme', sections: [] };
      if (templateId) {
        const templates = await fetchSitePageTemplates(context.site, { fetchImpl: context.fetchImpl });
        if (templates.outcome !== 'ok') {
          failed(templates);
        }
        const template = templates.templates.find((entry) => entry.id === templateId);
        if (!template) {
          throw new ToolError(`There's no template "${templateId}". get_theme lists them.`);
        }
        base = template.content as Record<string, unknown>;
      }
      // The content version the website's CMS writes now.
      const status = await checkSiteStatus(context.site, { fetchImpl: context.fetchImpl });
      if (status.state !== 'ok') {
        throw new ToolError("The website isn't answering right now, so the page can't be created.");
      }
      const content = {
        ...base,
        schemaVersion: status.contentSchemaVersion,
        name,
        title: optionalStr(input, 'title') ?? name,
        published: false,
        type: base.type ?? 'page',
      };
      const result = await saveSiteDraft(context.site, path, JSON.stringify(content), '*', { fetchImpl: context.fetchImpl });
      if (result.outcome === 'conflict') {
        throw new ToolError(`There's already a page at ${pageUrl(path)}.`);
      }
      if (result.outcome === 'invalid') {
        throw new ToolError(describeInvalid(result.message, result.errors));
      }
      if (result.outcome !== 'ok') {
        failed(result);
      }
      context.preview?.({ type: 'changed', path, url: pageUrl(path) });
      return { created: 'as a draft', url: pageUrl(path), etag: result.etag };
    },
  },
  {
    definition: {
      name: 'publish_page',
      description:
        'Saves a page\'s changes to the live website (what the admin\'s "Save Changes" button does). Only when the person has asked you to save, publish or put live the changes to this page.',
      input_schema: { type: 'object', properties: { page: PAGE }, required: ['page'], additionalProperties: false },
    },
    label: (input) => `Saving ${typeof input.page === 'string' ? input.page : 'a page'}`,
    async run(context, input) {
      const path = contentPath(str(input, 'page'));
      const result = await publishSite(context.site, [path], `Publish ${pageUrl(path)}`, requireAuthor(context), { fetchImpl: context.fetchImpl });
      if (result.outcome === 'not-found') {
        throw new ToolError(`${pageUrl(path)} has no changes to save.`);
      }
      if (result.outcome !== 'ok') {
        failed(result);
      }
      context.preview?.({ type: 'changed', path, url: pageUrl(path) });
      return { published: true, url: pageUrl(path) };
    },
  },
  {
    definition: {
      name: 'discard_changes',
      description:
        'Throws away a page\'s unsaved (draft) changes, putting it back to how it is on the live website. A page that was never published is removed entirely. Only when the person asks.',
      input_schema: { type: 'object', properties: { page: PAGE }, required: ['page'], additionalProperties: false },
    },
    label: (input) => `Discarding changes to ${typeof input.page === 'string' ? input.page : 'a page'}`,
    async run(context, input) {
      const path = contentPath(str(input, 'page'));
      const result = await discardSiteDraft(context.site, path, { fetchImpl: context.fetchImpl });
      if (result.outcome !== 'ok') {
        failed(result);
      }
      context.preview?.({ type: 'changed', path, url: pageUrl(path) });
      return { discarded: true, url: pageUrl(path) };
    },
  },
];

export const ASSISTANT_TOOLS: AssistantTool[] = [...READ_TOOLS, ...EDIT_TOOLS];
