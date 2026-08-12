const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Auto-generates the publish/commit message from what's being published and
// when, so the user is never prompted to type one by hand. now is a
// parameter, not a fresh Date() read internally, purely so this stays
// testable without faking the system clock (matches formatChangedAt.ts's
// own reasoning).
export function buildPublishMessage(label: string, now: Date = new Date()): string {
  const date = `${now.getDate()} ${SHORT_MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  return `${label} - ${date}`;
}
