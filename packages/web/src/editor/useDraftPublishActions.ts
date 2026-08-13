import { useState } from 'react';
import { discardSiteDraft, publishSiteDraft } from '../api/site-publishing.ts';
import { buildPublishMessage } from './publishMessage.ts';

export interface UseDraftPublishActionsResult {
  actionBusy: boolean;
  actionError: string | null;
  // Both resolve to whether the action actually went through - reading
  // actionError straight after an await isn't reliable for this (it's
  // state, so the closure holding it here is stale until the next
  // render), and the blocked-navigation flow (PageEditorPage/
  // MenuEditorPage) needs to know synchronously whether to proceed.
  handlePublish: () => Promise<boolean>;
  handleDiscard: (options?: { skipConfirm?: boolean }) => Promise<boolean>;
}

// Shared by PageEditorPage and MenuEditorPage - publish/discard are the
// same shape (the site call, then reloadLatest on success) regardless of
// what kind of content is being edited. Kept beside useAutosaveDraft, not
// inside it - that hook stays UI-agnostic (Group E/F's own design
// principle). reloadLatest is only ever reached past a successful await,
// so a thrown error can't touch useAutosaveDraft's own state (G5).
//
// label identifies what's being published (a page's name/title, or a
// menu's derived name) - the commit message is auto-generated from it via
// buildPublishMessage, no longer typed by hand (previously a
// window.prompt the user found annoying).
export function useDraftPublishActions(
  siteId: string,
  path: string,
  label: string,
  reloadLatest: () => void,
): UseDraftPublishActionsResult {
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handlePublish(): Promise<boolean> {
    setActionBusy(true);
    setActionError(null);
    try {
      await publishSiteDraft(siteId, path, buildPublishMessage(label));
      reloadLatest();
      return true;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to publish');
      return false;
    } finally {
      setActionBusy(false);
    }
  }

  // skipConfirm - the blocked-navigation flow's own modal (Unsaved
  // ChangesPrompt) IS the confirmation there; a second native one on
  // top would just be an annoying, redundant re-ask of a choice the
  // user already just made explicitly.
  async function handleDiscard(options?: { skipConfirm?: boolean }): Promise<boolean> {
    if (!options?.skipConfirm && !window.confirm('Discard the draft and return to the live version? This cannot be undone.')) {
      return false;
    }

    setActionBusy(true);
    setActionError(null);
    try {
      await discardSiteDraft(siteId, path);
      reloadLatest();
      return true;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to discard the draft');
      return false;
    } finally {
      setActionBusy(false);
    }
  }

  return { actionBusy, actionError, handlePublish, handleDiscard };
}
