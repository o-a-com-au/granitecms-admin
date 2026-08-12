import { useState } from 'react';
import { discardSiteDraft, publishSiteDraft } from '../api/site-publishing.ts';
import { buildPublishMessage } from './publishMessage.ts';

export interface UseDraftPublishActionsResult {
  actionBusy: boolean;
  actionError: string | null;
  handlePublish: () => Promise<void>;
  handleDiscard: () => Promise<void>;
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

  async function handlePublish(): Promise<void> {
    setActionBusy(true);
    setActionError(null);
    try {
      await publishSiteDraft(siteId, path, buildPublishMessage(label));
      reloadLatest();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to publish');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleDiscard(): Promise<void> {
    if (!window.confirm('Discard the draft and return to the live version? This cannot be undone.')) {
      return;
    }

    setActionBusy(true);
    setActionError(null);
    try {
      await discardSiteDraft(siteId, path);
      reloadLatest();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to discard the draft');
    } finally {
      setActionBusy(false);
    }
  }

  return { actionBusy, actionError, handlePublish, handleDiscard };
}
