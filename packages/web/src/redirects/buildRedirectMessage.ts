// Auto-generates the commit message for every redirect write, matching
// publishMessage.ts's own "never prompt for one" direction - a
// redirect's own optional "note" field already covers the
// admin-facing annotation use case, so a second, typed git message on
// top of that would just be friction for something this routine.
export function buildCreateRedirectMessage(from: string, to: string): string {
  return `Add redirect from ${from} to ${to}`;
}

export function buildUpdateRedirectMessage(from: string, to: string): string {
  return `Update redirect from ${from} to ${to}`;
}

export function buildDeleteRedirectMessage(from: string): string {
  return `Remove redirect from ${from}`;
}
