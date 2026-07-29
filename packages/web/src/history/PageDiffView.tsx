import { diffLines } from 'diff';

interface PageDiffViewProps {
  fromLabel: string;
  toLabel: string;
  fromContent: string;
  toContent: string;
}

interface DiffLine {
  key: string;
  status: 'added' | 'removed' | 'unchanged';
  text: string;
}

// H3: a plain line-level diff over the same pretty-printed JSON the
// editor's own textarea already shows - not a field-aware/semantic
// diff (the editor is still raw-JSON only until a future Group I
// brings real per-field editing, so a schema-aware diff would need
// foundations that don't exist yet) and not a merge-request-style
// component library. Good enough to catch structural surprises (a
// section disappearing) and give confidence before reverting, which
// is what this audience actually needs from it.
function toDiffLines(fromContent: string, toContent: string): DiffLine[] {
  const chunks = diffLines(fromContent, toContent);
  const lines: DiffLine[] = [];
  let key = 0;

  for (const chunk of chunks) {
    const status = chunk.added ? 'added' : chunk.removed ? 'removed' : 'unchanged';
    // A chunk's value can span multiple lines (e.g. an entire
    // unchanged block) - split it so each rendered line gets its own
    // data-diff attribute, and drop the trailing empty string left by
    // splitting a value that ends in "\n".
    for (const line of chunk.value.split('\n')) {
      if (line === '' && chunk.value.endsWith('\n')) {
        continue;
      }
      key += 1;
      lines.push({ key: String(key), status, text: line });
    }
  }

  return lines;
}

export function PageDiffView({ fromLabel, toLabel, fromContent, toContent }: PageDiffViewProps) {
  if (fromContent === toContent) {
    return <p>No differences.</p>;
  }

  const lines = toDiffLines(fromContent, toContent);

  return (
    <div>
      <p>
        Comparing <code>{fromLabel}</code> to <code>{toLabel}</code>
      </p>
      <pre>
        {lines.map((line) => (
          <div key={line.key} data-diff={line.status}>
            {line.status === 'added' ? '+ ' : line.status === 'removed' ? '- ' : '  '}
            {line.text}
          </div>
        ))}
      </pre>
    </div>
  );
}
