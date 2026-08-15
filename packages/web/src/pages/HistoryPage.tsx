import { useSearchParams } from 'react-router';
import { PageHistoryPage } from './PageHistoryPage.tsx';
import { SiteHistoryPage } from './SiteHistoryPage.tsx';

// Mounted at the single, existing /sites/:siteId/history route - a
// thin dispatcher, not a merge of the two views. Every existing
// historyHref (PageEditorPage.tsx, MenuEditorPage.tsx) already always
// includes ?path=, even when path is an empty string, so this never
// needs its own default: presence of the "path" key alone is what
// distinguishes "a specific page's history" from the top-nav's own
// site-wide destination, which never carries the param at all.
export function HistoryPage() {
  const [searchParams] = useSearchParams();
  return searchParams.get('path') !== null ? <PageHistoryPage /> : <SiteHistoryPage />;
}
