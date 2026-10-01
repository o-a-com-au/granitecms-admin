import type { ReactNode } from 'react';

// The assistant's replies, with the light Markdown Claude writes:
// paragraphs, "- " and "1. " lists, **bold**, *italic* and `code`.
// Built as React elements, never as HTML, so nothing in a reply (or in
// the website content it quotes) can inject markup.

function inline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|`([^`]+)`/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    const key = `${keyPrefix}-${index++}`;
    if (match[1] !== undefined) {
      parts.push(<strong key={key}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      parts.push(<em key={key}>{match[2]}</em>);
    } else {
      parts.push(<code key={key}>{match[3]}</code>);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    parts.push(text.slice(last));
  }
  return parts;
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

export function AssistantText({ text }: { text: string }) {
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
                  {inline(line, `${key}-${lineIndex}`)}
                </span>
              ))}
            </p>
          );
        }
        const items = block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{inline(item, `${key}-${itemIndex}`)}</li>);
        return block.kind === 'ul' ? <ul key={key}>{items}</ul> : <ol key={key}>{items}</ol>;
      })}
    </>
  );
}
