// What how_to_edit returns: the editor's side of a site's AGENTS.md, for
// an assistant changing a live website's content (never its theme).
export const EDITING_GUIDE = `# Editing a Granite CMS website

## How a page is built
A page is JSON: { schemaVersion, name, title, type, layout, published, sections }. Each entry in "sections" is { id, type, settings, blocks? }, and each block inside is { id, type, settings, blocks? }.
- "type" must be one of the theme's section or block types (get_theme), exactly.
- "settings" must match that type's JSON Schema from get_theme: only the properties it lists, of the right types and allowed values. Unknown fields are rejected.
- Every section and block needs an "id" unique within the page (any short string, e.g. "sec-hero-2").
- Only add blocks to a section whose schema allows them ("allowedBlocks", if present, lists which).

## Field formats in a schema
- "format": "richtext" - HTML using <p>, <h2>-<h5>, <strong>, <em>, <ul>/<ol>/<li> and <a href>.
- "format": "url" (or "uri") - a link. Link to the website's own pages by path ("/about", "/about#team"), never a full address to the same site: moving a page updates links written as paths.
- "format": "image" - an object { "url": "/media/...", "focalX": 0.5, "focalY": 0.5 }, never a bare string. Get "url" from list_media or upload_media.
- "format": "video" - an object { "url": "/media/...mp4", "poster": "/media/...jpg" }.
- An "enum" allows only the listed values.

## The safe way to change a page
1. read_page - you get the page JSON (its draft, if it has unpublished changes) and an etag.
2. Change only what you need to; keep everything else exactly as it was.
3. save_draft with the whole page and that etag. If it's refused as changed since you read it, read_page again and redo the change - never retry blindly.
4. preview_page to check the result reads correctly.
5. publish_page when it's right, if your key may publish and the person you're working for wants it live. Otherwise leave it as a draft for them to review and publish in the admin.

## Things that go live immediately
Site settings, menus and redirects have no draft step: save_site_settings, save_menu and add_redirect change the live website at once. Read the current values first and change only what was asked.

## Good practice
- Say what you changed, page by page, when you finish.
- Don't publish something the person hasn't asked to be published.
- Write in the website's own language and spelling.
- Everything you publish is recorded in the website's history as done by an AI agent on behalf of the key's owner, and can be undone there.`;
