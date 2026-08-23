export interface ContentListEntry {
  path: string;
  name: string;
  title: string;
  type: string;
  published: boolean;
  hasDraft: boolean;
  url: string | null;
  changedAt: string | null;
}

export interface ContentListFilters {
  type?: string;
  draftStatus?: 'has-draft' | 'no-draft';
}

type SiteContentErrorReason = 'unreachable' | 'unauthorized' | 'site-not-found' | 'error';

export class SiteContentError extends Error {
  readonly reason: SiteContentErrorReason;

  constructor(reason: SiteContentErrorReason, message: string) {
    super(message);
    this.name = 'SiteContentError';
    this.reason = reason;
  }
}

function isReason(value: unknown): value is SiteContentErrorReason {
  return value === 'unreachable' || value === 'unauthorized' || value === 'site-not-found' || value === 'error';
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
      const body = (await response.json()) as { error?: string; message?: string; reason?: unknown };
      // message first, same reasoning as site-editor.ts's own
      // reasonFromResponse: "error" is just the generic status phrase
      // or, for a thrown domain error like SiteNotFoundError, the
      // class name itself (e.g. "SiteNotFoundError") - never anything
      // fit to show a user.
      message = body.message ?? body.error ?? message;
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
