# @o-a/cms-mcp

Connect an AI assistant to your Granite CMS websites. Claude Code, Claude Desktop, Cursor and any other [MCP](https://modelcontextprotocol.io) client can then read your pages, write drafts, preview them and, if you allow it, publish.

It works through your Granite admin with a personal API key, so the assistant can only do what that key allows, on the websites you chose, and everything it publishes is recorded in each website's history as done by an AI agent on your behalf.

## Get an API key

In the Granite admin, open **Settings -> AI Agents** and create a key. Choose which websites it covers and what it may do:

- **Read only** - look at pages, settings, menus and media.
- **Save drafts** - also write drafts for a person to review and publish.
- **Save drafts and publish** - also publish pages, and change site settings, menus and redirects (which go live straight away).

Copy the key when it's shown; it isn't shown again. AI agent access is part of the Pro plan.

## Connect your assistant

**Claude Code**

```
claude mcp add granite --env GRANITE_API_KEY=gck_your_key -- npx -y @o-a/cms-mcp
```

**Claude Desktop, Cursor, and other clients** - add to the client's MCP configuration:

```json
{
  "mcpServers": {
    "granite": {
      "command": "npx",
      "args": ["-y", "@o-a/cms-mcp"],
      "env": { "GRANITE_API_KEY": "gck_your_key" }
    }
  }
}
```

If you run your own admin, also set `GRANITE_ADMIN_URL` to its address.

## What the assistant can do

| Tool | What it does |
|---|---|
| `how_to_edit` | The rules for editing a Granite website - read first |
| `list_sites`, `list_pages`, `read_page` | Find and read pages |
| `get_theme` | The section and block types pages can use, and page templates |
| `create_page`, `save_draft`, `discard_draft` | Create and change pages as unpublished drafts |
| `preview_page` | See a page's text as publishing would render it |
| `publish_page` | Put a page's changes live |
| `find_links` | What links to a page |
| `get_site_settings`, `save_site_settings` | Website-wide settings |
| `save_menu`, `list_redirects`, `add_redirect` | Menus and redirects |
| `list_media`, `upload_media` | Images and video |

Deleting or moving pages, reverting history, and managing the website itself aren't available to an assistant; those stay in the admin. Requires Node 22.6 or later.
