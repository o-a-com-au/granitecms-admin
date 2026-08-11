# Design brief: Content Browser

## Product context

This is the admin control panel for a self-hosted, git-backed CMS. One admin installation manages one or more independent client sites, each running its own instance of the underlying CMS engine (content is JSON files, versioned in git; pages are built from theme-defined sections and blocks).

**Audience: content marketers and agency staff managing client sites — not developers.** The interface should feel approachable to a non-technical content editor, not like a developer tool or a git client.

**Visual identity: currently a blank slate.** The app today is unstyled — plain HTML elements and a single hand-written stylesheet, no design system, no established colour/type palette. This is real creative latitude, not a constraint to work around. [If you have brand guidelines, colours, or typography to anchor to, add them here before sending this brief — otherwise treat visual direction as open.]

## Scope of this brief

One screen only: the **Content Browser** — where a user finds and opens a piece of content to edit. This is the first screen getting real design attention, deliberately, ahead of the rest of the app.

## Functional requirements

- **An expandable tree**, not a flat list. Pages and Menus are structurally distinct top-level groups — a menu has no public URL and isn't a page, so it shouldn't be visually flattened in with pages.
- **Every branch behaves identically when expanded**, regardless of how many children it has. No branch should switch to a different interaction mode based on item count — that breaks the user's mental model of how the tree works.
- **A persistent "View all" affordance on every branch**, leading to a flat, filterable list of just that branch's contents (filterable by content type and by draft status: has draft / no draft). Present consistently on every branch, not conditionally — most useful on a branch with many items (e.g. a blog with hundreds of posts), harmless and consistent on a small one.
- **A search function** across all content in the tree.
- **Per-item status, always visible**: a page can be in exactly one of three states —
  - **Live** — published and public
  - **Draft only** — never published, exists only as a pending draft
  - **Live + draft pending** — currently live, with further unpublished edits sitting on top
- **States to design**: empty tree (brand-new site, no content yet), no search results, loading, and an error state (site unreachable, or its access token was rejected).

## Example content, for realistic mockups

A small real site looks roughly like this — use shapes like this rather than designing against an abstract/generic tree:

```
Pages
├── Home                    (Live + draft pending)
└── 404
Menus
├── Main navigation
├── Footer — Company
├── Footer — Product
└── Footer — Resources
```

And for a branch that needs the "View all" treatment: imagine a "Blog" group containing 300+ posts, each independently Live / Draft only / Live + draft pending.

## Explicitly out of scope for this round

- Bulk actions (multi-select, bulk publish/unpublish) — discussed but not decided. Don't design for it.
- Every other admin screen (login, site registry, page editor, page history) — later rounds, once this one is settled.

## Implementation constraints worth knowing

- No component library is chosen yet — plain HTML elements vs. a headless primitives library (e.g. Radix UI) is still an open decision. Design the interaction and visual intent; don't assume a specific toolkit is powering it underneath.
- The tree itself has no hard depth limit in the data, but nesting in practice is shallow (2–3 levels) except for large content collections like a blog, which is exactly why those get the "View all" escape hatch rather than deep in-tree nesting.
