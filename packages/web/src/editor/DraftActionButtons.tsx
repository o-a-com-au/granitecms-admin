// The same Discard/Save buttons PageEditorPage.tsx renders inline in
// its own pageActionsNode (identical markup/classNames), factored out
// for Media/Pages hub (usePreviewNavigationGuard.tsx) to reuse rather
// than a second copy-pasted pair - PageEditorPage.tsx's own version
// stays as-is (its disabled condition also checks EditorStatus values
// this simpler caller has no equivalent of), so this isn't a like-for-
// like replacement there, just the shared shape for the two new
// call sites.
export function DraftActionButtons({
  busy,
  onDiscard,
  onPublish,
}: {
  busy: boolean;
  onDiscard: () => void;
  onPublish: () => void;
}) {
  return (
    <>
      <button type="button" onClick={onDiscard} disabled={busy}>
        Discard Changes
      </button>
      <button type="button" className="button-primary" onClick={onPublish} disabled={busy}>
        Save Changes
      </button>
    </>
  );
}
