import type { ReactNode } from 'react';

// The assistant's replies, with the light Markdown Claude writes:
// paragraphs, "- " and "1. " lists, **bold**, *italic*, `code` and
// [links](/about). Built as React elements, never as HTML, so nothing in
// a reply (or in the website content it quotes) can inject markup.
//
// A link to one of the website's own pages ("/about") is a button that
// opens it in the preview; a list made only of page links is a stack of
// page buttons, like the page list. A link to a place in the admin
// ("admin:settings/announcement-bar") goes there. Links elsewhere open
// in a new tab.

export type OpenPage = (url: string) => void;
export type OpenAdmin = (target: string) => void;

function adminTarget(href: string): string | null {
  return href.startsWith('admin:') ? href.slice('admin:'.length) : null;
}

// The website's own page addresses: one leading slash, not two (which
// would be another site).
function isPageUrl(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//');
}

function isOutsideUrl(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

const INLINE = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

function inline(text: string, keyPrefix: string, openPage: OpenPage | undefined, openAdmin: OpenAdmin | undefined): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0;
    if (start > last) {
      parts.push(text.slice(last, start));
    }
    const key = `${keyPrefix}-${index++}`;
    if (match[1] !== undefined) {
      parts.push(<strong key={key}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      parts.push(<em key={key}>{match[2]}</em>);
    } else if (match[3] !== undefined) {
      parts.push(<code key={key}>{match[3]}</code>);
    } else {
      const label = match[4] ?? '';
      const href = match[5] ?? '';
      const target = adminTarget(href);
      if (target !== null && openAdmin) {
        parts.push(
          <button key={key} type="button" className="assistant-link" onClick={() => openAdmin(target)}>
            {label}
          </button>,
        );
      } else if (isPageUrl(href) && openPage) {
        parts.push(
          <button key={key} type="button" className="assistant-link" title={href} onClick={() => openPage(href)}>
            {label}
          </button>,
        );
      } else if (isOutsideUrl(href)) {
        parts.push(
          <a key={key} href={href} target="_blank" rel="noopener noreferrer">
            {label}
          </a>,
        );
      } else {
        parts.push(label);
      }
    }
    last = start + match[0].length;
  }
  if (last < text.length) {
    parts.push(text.slice(last));
  }
  return parts;
}

// A list item that is nothing but one page link: "[Home](/)".
function soleLink(item: string): { label: string; href: string } | null {
  const match = /^\s*\[([^\]]+)\]\(([^)\s]+)\)\s*$/.exec(item);
  return match && isPageUrl(match[2] ?? '') ? { label: match[1] ?? '', href: match[2] ?? '' } : null;
}

type Block = { kind: 'p'; lines: string[] } | { kind: 'ul' | 'ol'; items: string[] };

function blocks(text: string): Block[] {
  const result: Block[] = [];
  for (const line of text.split('\n')) {
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const current = result.at(-1);
    if (bullet || numbered) {
      const kind = bullet ? 'ul' : 'ol';
      const item = (bullet ?? numbered)![1] ?? '';
      if (current && current.kind === kind) {
        current.items.push(item);
      } else {
        result.push({ kind, items: [item] });
      }
    } else if (line.trim() === '') {
      result.push({ kind: 'p', lines: [] });
    } else if (current && current.kind === 'p') {
      current.lines.push(line.replace(/^#+\s*/, ''));
    } else {
      result.push({ kind: 'p', lines: [line.replace(/^#+\s*/, '')] });
    }
  }
  return result.filter((block) => (block.kind === 'p' ? block.lines.length > 0 : block.items.length > 0));
}

export function AssistantText({ text, openPage, openAdmin }: { text: string; openPage?: OpenPage; openAdmin?: OpenAdmin }) {
  return (
    <>
      {blocks(text).map((block, blockIndex) => {
        const key = `b${blockIndex}`;
        if (block.kind === 'p') {
          return (
            <p key={key}>
              {block.lines.map((line, lineIndex) => (
                <span key={`${key}-${lineIndex}`}>
                  {lineIndex > 0 && <br />}
                  {inline(line, `${key}-${lineIndex}`, openPage, openAdmin)}
                </span>
              ))}
            </p>
          );
        }
        const links = block.items.map(soleLink);
        if (openPage && links.every((link) => link !== null)) {
          return (
            <div key={key} className="assistant-page-links">
              {links.map((link, linkIndex) => (
                <button
                  key={`${key}-${linkIndex}`}
                  type="button"
                  className="assistant-page-link"
                  title={link!.href}
                  onClick={() => openPage(link!.href)}
                >
                  {link!.label}
                </button>
              ))}
            </div>
          );
        }
        const items = block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{inline(item, `${key}-${itemIndex}`, openPage, openAdmin)}</li>);
        return block.kind === 'ul' ? <ul key={key}>{items}</ul> : <ol key={key}>{items}</ol>;
      })}
    </>
  );
}
