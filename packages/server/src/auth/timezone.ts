// The same canonical IANA list AccountPage.tsx's own <select> builds
// client-side from Intl.supportedValuesOf('timeZone') - built into
// Node 18+/every evergreen browser, so client and server always agree
// on the valid set with no new dependency and no list to keep in sync
// by hand.
export const DEFAULT_TIMEZONE = 'UTC';

// 'UTC' is a special case, not a list membership check - at least on
// this Node/ICU build, Intl.supportedValuesOf('timeZone') omits 'UTC'
// entirely despite it being a universally valid zone identifier
// (Intl.DateTimeFormat accepts it fine). Deliberately NOT just
// try/catching `new Intl.DateTimeFormat(undefined, { timeZone: value })`
// instead - that construction is too permissive, silently accepting
// raw UTC offsets like '+10:00' and non-canonical casing like
// 'australia/sydney' rather than rejecting anything that isn't a real
// canonical IANA name.
export function isValidTimezone(value: string): boolean {
  return value === DEFAULT_TIMEZONE || Intl.supportedValuesOf('timeZone').includes(value);
}
