export interface ContentListEntry {
  path: string;
  title: string;
  type: string;
  published: boolean;
  hasDraft: boolean;
}

export interface ContentListFilters {
  type?: string;
  draftStatus?: 'has-draft' | 'no-draft';
}

type SiteContentErrorReason = 'unreachable' | 'unauthorized' | 'error';

export class SiteContentError extends Error {
  readonly reason: SiteContentErrorReason;

  constructor(reason: SiteContentErrorReason, message: string) {
    super(message);
    this.name = 'SiteContentError';
    this.reason = reason;
  }
}

function isReason(value: unknown): value is SiteContentErrorReason {
  return value === 'unreachable' || value === 'unauthorized' || value === 'error';
}

export async function listSiteContent(siteId: string, filters: ContentListFilters): Promise<ContentListEntry[]> {
  const params = new URLSearchParams();
  if (filters.type) {
    params.set('type', filters.type);
  }
  if (filters.draftStatus) {
    params.set('draftStatus', filters.draftStatus);
  }
  const query = params.toString();

  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/content${query ? `?${query}` : ''}`);

  if (!response.ok) {
    let reason: SiteContentErrorReason = 'error';
    let message = 'Failed to load content';
    try {
      const body = (await response.json()) as { error?: string; reason?: unknown };
      if (body.error) {
        message = body.error;
      }
      if (isReason(body.reason)) {
        reason = body.reason;
      }
    } catch {
      // Use the defaults above - the body wasn't valid JSON.
    }
    throw new SiteContentError(reason, message);
  }

  return (await response.json()) as ContentListEntry[];
}
