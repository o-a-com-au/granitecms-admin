const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = MS_PER_MINUTE * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Recent changes read as relative ("2h ago", "4 days ago"), matching
// docs/design/Pages.png; anything older than a week falls back to a
// short absolute date ("14 Jun") rather than an ever-growing "312
// days ago". now is a parameter, not a fresh Date() read internally,
// purely so this stays testable without faking the system clock.
export function formatChangedAt(changedAt: string | null, now: Date = new Date()): string {
  if (changedAt === null) {
    return 'Unknown';
  }

  const then = new Date(changedAt);
  const diffMs = Math.max(0, now.getTime() - then.getTime());

  if (diffMs < MS_PER_HOUR) {
    const minutes = Math.max(1, Math.floor(diffMs / MS_PER_MINUTE));
    return `${minutes}m ago`;
  }
  if (diffMs < MS_PER_DAY) {
    const hours = Math.floor(diffMs / MS_PER_HOUR);
    return `${hours}h ago`;
  }
  if (diffMs < MS_PER_DAY * 7) {
    const days = Math.floor(diffMs / MS_PER_DAY);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  return `${then.getDate()} ${SHORT_MONTHS[then.getMonth()]}`;
}
