import { useCallback, useEffect, useState, type ReactNode } from 'react';
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

// Same readLastEditorLocation string requestPreviewSwitch and the
// hasDraft-tracking effect both need "the currently previewed page's
// own content path" out of - factored out once rather than parsed
// twice.
function currentPathFor(siteId: string): string | null {
  const stored = readLastEditorLocation(siteId);
  const queryIndex = stored?.indexOf('?') ?? -1;
  return stored !== null && queryIndex !== -1 ? new URLSearchParams(stored.slice(queryIndex)).get('path') : null;
}

// PageEditorPage.tsx's own two pieces of "a page with an unpublished
// draft" handling, brought to Media/Pages hub (neither had either
// piece before): a persistent Discard/Save action bar shown the whole
// time the currently previewed page has a draft (PageEditorPage's own
// pageActionsNode/usePageActions), and a confirm-before-leaving prompt
// (its useBlocker, gated on source === 'draft'). useBlocker itself
// can't be reused here - switching which page these routes preview is
// a setPreview context update, not a router navigation, so it never
// fires - this hook is the same protection built for that different
// trigger shape.
//
// Draft status is checked with a fresh readSiteEditorContent call
// (its own source header) rather than cached/tracked as a plain flag -
// a real GET with no side effects (confirmed: two plain reads against
// the site's own /v1/drafts then /v1/content, nothing written), so
// there's no staleness risk the moment after a draft is created (e.g.
// right after a drag-and-drop image replace) the way a stale cached
// flag would have. Re-checked whenever the previewed page changes OR
// previewGeneration bumps (PreviewContext.tsx) - the latter covers a
// drop replacing an image on the SAME page, which reloads the iframe
// without changing previewUrl at all.
export function usePreviewNavigationGuard(siteId: string): {
  requestPreviewSwitch: (target: PreviewSwitchTarget) => void;
  promptElement: ReactNode;
  hasDraft: boolean;
  actionsBusy: boolean;
  publishCurrent: () => void;
  discardCurrent: () => void;
} {
  const { setPreview, previewUrl, previewGeneration, bumpPreview } = usePreview();
  const [pending, setPending] = useState<PendingSwitch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);

  useEffect(() => {
    const currentPath = currentPathFor(siteId);
    if (currentPath === null) {
      setHasDraft(false);
      return;
    }
    let cancelled = false;
    readSiteEditorContent(siteId, currentPath)
      .then((result) => {
        if (!cancelled) {
          setHasDraft(result.source === 'draft');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasDraft(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // previewUrl/previewGeneration are the two things that mean "the
    // currently shown page's draft status might have changed" - a real
    // page switch, or a same-page reload (a drop, an out-of-band save).
  }, [siteId, previewUrl, previewGeneration]);

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
      const currentPath = currentPathFor(siteId);

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

  const publishCurrent = useCallback((): void => {
    const currentPath = currentPathFor(siteId);
    if (currentPath === null) {
      return;
    }
    setBusy(true);
    setError(null);
    publishSiteDraft(siteId, currentPath, buildPublishMessage(currentPath))
      .then(() => {
        // No manual setHasDraft(false) here - bumpPreview() already
        // retriggers the tracking effect above (previewGeneration is
        // one of its dependencies), which re-checks the real, now-
        // authoritative source header rather than assuming success
        // means "definitely live now" (a discard, for instance, only
        // reverts to whatever's underneath - live if this page has
        // ever been published, but back to not-found otherwise).
        bumpPreview();
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof SiteEditorError ? err.message : 'Could not publish this page');
        setBusy(false);
      });
  }, [siteId, bumpPreview]);

  const discardCurrent = useCallback((): void => {
    const currentPath = currentPathFor(siteId);
    if (currentPath === null) {
      return;
    }
    setBusy(true);
    setError(null);
    discardSiteDraft(siteId, currentPath)
      .then(() => {
        bumpPreview();
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof SiteEditorError ? err.message : "Could not discard this page's draft");
        setBusy(false);
      });
  }, [siteId, bumpPreview]);

  const handleSave = useCallback((): void => {
    if (!pending) {
      return;
    }
    setBusy(true);
    setError(null);
    publishSiteDraft(siteId, pending.currentPath, buildPublishMessage(pending.currentPath))
      .then(() => {
        // No manual setHasDraft(false) - performSwitch changes
        // previewUrl, which retriggers the tracking effect for
        // whichever page is now shown (the target, not the one just
        // published), so it needs a fresh check of its own regardless.
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

  return { requestPreviewSwitch, promptElement, hasDraft, actionsBusy: busy, publishCurrent, discardCurrent };
}
