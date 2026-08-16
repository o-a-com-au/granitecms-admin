// Auto-generates the commit message for a Restore action, matching
// buildRedirectMessage.ts's own "never prompt for one" direction -
// the commit being restored already carries its own original message
// in the git log, so a second, typed message on top of that would
// just be friction for something this routine.
export function buildRestoreMessage(commitDate: string): string {
  const formatted = new Date(commitDate).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `Restore page to version from ${formatted}`;
}
