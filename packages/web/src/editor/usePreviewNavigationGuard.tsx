import { useCallback, useState, type ReactNode } from 'react';
import { usePreview } from '../layout/PreviewContext.tsx';
import { readLastEditorLocation, writeLastEditorLocation } from '../sites/currentSite.ts';
import { discardSiteDraft, publishSiteDraft } from '../api/site-publishing.ts';
import { readSiteEditorContent, SiteEditorError } from '../api/site-editor.ts';
import { buildPublishMessage } from './publishMessage.ts';
import { UnsavedChangesPrompt } from './UnsavedChangesPrompt.tsx';

export interface PreviewSwitchTarget {
  path: string;
  url: string;
}

interface PendingSwitch {
  currentPath: string;
  target: PreviewSwitchTarget;
}

// PageEditorPage.tsx's own "leave a page with an unpublished draft
// behind unnoticed" protection (useBlocker, gated on source === 'draft')
// only covers a real router navigation - switching which page Media/
// Pages hub show is a plain setPreview context update, not a route
// change, so useBlocker can't intercept it. This is the same
// protection, built for that different trigger shape: called instead
// of switching directly, wherever these routes change the previewed
// page.
//
// Checks readSiteEditorContent's own source header fresh on every call
// rather than caching/tracking draft status locally - a real GET with
// no side effects (confirmed: two plain reads against the site's own
// /v1/drafts then /v1/content, nothing written), so there's no
// staleness risk the moment after a draft is created (e.g. right after
// a drag-and-drop image replace) the way a locally cached flag would have.
export function usePreviewNavigationGuard(siteId: string): {
  requestPreviewSwitch: (target: PreviewSwitchTarget) => void;
  promptElement: ReactNode;
} {
  const { setPreview } = usePreview();
  const [pending, setPending] = useState<PendingSwitch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const performSwitch = useCallback(
    (target: PreviewSwitchTarget): void => {
      setPreview({ url: target.url });
      const params = new URLSearchParams({ path: target.path, url: target.url });
      writeLastEditorLocation(siteId, `/sites/${siteId}/editor?${params.toString()}`);
    },
    [siteId, setPreview],
  );

  const requestPreviewSwitch = useCallback(
    (target: PreviewSwitchTarget): void => {
      const stored = readLastEditorLocation(siteId);
      const queryIndex = stored?.indexOf('?') ?? -1;
      const currentPath = stored !== null && queryIndex !== -1 ? new URLSearchParams(stored.slice(queryIndex)).get('path') : null;

      if (currentPath === null || currentPath === target.path) {
        performSwitch(target);
        return;
      }

      readSiteEditorContent(siteId, currentPath)
        .then((result) => {
          if (result.source === 'draft') {
            setPending({ currentPath, target });
          } else {
            performSwitch(target);
          }
        })
        .catch(() => {
          // Fail open - never block navigation over an unrelated read
          // problem (a page that's since been deleted, a network blip).
          performSwitch(target);
        });
    },
    [siteId, performSwitch],
  );

  const handleSave = useCallback((): void => {
    if (!pending) {
      return;
    }
    setBusy(true);
    setError(null);
    publishSiteDraft(siteId, pending.currentPath, buildPublishMessage(pending.currentPath))
      .then(() => {
        performSwitch(pending.target);
        setPending(null);
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof SiteEditorError ? err.message : 'Could not publish this page');
        setBusy(false);
      });
  }, [siteId, pending, performSwitch]);

  const handleDiscard = useCallback((): void => {
    if (!pending) {
      return;
    }
    setBusy(true);
    setError(null);
    discardSiteDraft(siteId, pending.currentPath)
      .then(() => {
        performSwitch(pending.target);
        setPending(null);
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof SiteEditorError ? err.message : "Could not discard this page's draft");
        setBusy(false);
      });
  }, [siteId, pending, performSwitch]);

  const handleCancel = useCallback((): void => {
    setPending(null);
    setError(null);
  }, []);

  const promptElement =
    pending !== null ? (
      <UnsavedChangesPrompt busy={busy} error={error} onSave={handleSave} onDiscard={handleDiscard} onCancel={handleCancel} />
    ) : null;

  return { requestPreviewSwitch, promptElement };
}
