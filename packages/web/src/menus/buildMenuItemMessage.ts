// Auto-generates the commit message for every menu-item write, matching
// buildRedirectMessage.ts's own "never prompt for one" direction - this
// is routine enough that a typed git message on top would just be
// friction.
export function buildAddMenuItemMessage(menuName: string, label: string): string {
  return `Add "${label}" to ${menuName}`;
}

export function buildUpdateMenuItemMessage(menuName: string, label: string): string {
  return `Update "${label}" in ${menuName}`;
}

export function buildRemoveMenuItemMessage(menuName: string, label: string): string {
  return `Remove "${label}" from ${menuName}`;
}

export function buildReorderMenuItemsMessage(menuName: string): string {
  return `Reorder items in ${menuName}`;
}
