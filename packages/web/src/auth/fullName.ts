// Mirrors packages/server/src/auth/full-name.ts's own formatFullName -
// splitting only ever happens server-side (GitHub OAuth, legacy-data
// backfill), so this is the one half that's actually needed here.
export function formatFullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}
