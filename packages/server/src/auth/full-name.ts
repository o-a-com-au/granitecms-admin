// Mirrored (formatFullName only - splitting only ever happens
// server-side) in packages/web/src/auth/fullName.ts. No shared
// workspace package exists between the two, so this is duplicated
// deliberately - keep the two formatFullName copies in sync.

// Splits on the first whitespace run - everything before is firstName,
// everything after (trimmed) is lastName ('' if there's no space at
// all). Used for GitHub's OAuth identity (no separate given/family
// name fields exist to read) and for backfilling any pre-existing
// stored `name` from before this field was split.
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) {
    return { firstName: trimmed, lastName: '' };
  }
  return {
    firstName: trimmed.slice(0, spaceIndex),
    lastName: trimmed.slice(spaceIndex + 1).trim(),
  };
}

// The inverse - used everywhere a single display or git-commit-author
// string is needed. Collapses to just firstName when lastName is
// empty, rather than leaving a trailing space.
export function formatFullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}
