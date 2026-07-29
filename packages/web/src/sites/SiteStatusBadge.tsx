import type { SiteStatus } from '../api/sites.ts';

function labelFor(status: SiteStatus): string {
  switch (status.state) {
    case 'ok':
      return `OK - agent ${status.agentVersion}, schema v${status.contentSchemaVersion}, ${status.sqliteDriver}`;
    case 'unreachable':
      return 'Unreachable';
    case 'unauthorized':
      return 'Unauthorized - check the token';
    case 'error':
      return `Error: ${status.message}`;
  }
}

export function SiteStatusBadge({ status }: { status: SiteStatus }) {
  return <span data-status={status.state}>{labelFor(status)}</span>;
}
