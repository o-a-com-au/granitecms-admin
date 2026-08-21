import { useEffect } from 'react';
import { useBlocker, useParams, useSearchParams } from 'react-router';
import { useAutosaveDraft } from '../editor/useAutosaveDraft.ts';
import { useDraftPublishActions } from '../editor/useDraftPublishActions.ts';
import { ConfirmDialog } from '../editor/ConfirmDialog.tsx';
import { UnsavedChangesPrompt } from '../editor/UnsavedChangesPrompt.tsx';
import { EditorContentPlaceholder, isPlaceholderStatus } from '../editor/EditorContentPlaceholder.tsx';
import { useToast } from '../toast/ToastContext.tsx';
import { TrashIcon } from '../sections/TrashIcon.tsx';
import { deriveMenuName } from './deriveMenuName.ts';

interface MenuItem {
  label: string;
  url: string;
}

interface ParsedMenu {
  envelope: Record<string, unknown>;
  items: MenuItem[];
}

// menu.schema.json is {schemaVersion, items: [{label, url}]}, both
// additionalProperties: false at the envelope and the item level -
// confirmed directly against the agent repo's own schema, the same way
// MenusPage.tsx's own extractMenuItemLabels already had to. A menu
// whose content doesn't parse as expected degrades to an empty item
// list rather than throwing, matching that same precedent.
function parseMenu(content: string): ParsedMenu | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    const envelope = parsed as Record<string, unknown>;
    const rawItems = envelope.items;
    const items: MenuItem[] = Array.isArray(rawItems)
      ? rawItems.map((item) => {
          const record = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
          return {
            label: typeof record.label === 'string' ? record.label : '',
            url: typeof record.url === 'string' ? record.url : '',
          };
        })
      : [];
    return { envelope, items };
  } catch {
    return null;
  }
}

// I6-equivalent for menus: parse, mutate a clone, stringify, call the
// hook's own setContent - the same save path every other structured
// control in this app uses, no second mechanism. additionalProperties:
// false at the item level means the serialised item is exactly
// {label, url}, nothing else riding along (no client-side id field).
function serializeMenu(envelope: Record<string, unknown>, items: MenuItem[]): string {
  return JSON.stringify({ ...envelope, items: items.map(({ label, url }) => ({ label, url })) }, null, 2);
}

// Menus are edited here, inside the Menus section (reached from the
// left nav's third icon), not by routing into PageEditorPage - a menu
// has no sections/blocks/metafields/preview, so the page editor's own
// tabs and device toggle would all be meaningless for it. Still drives
// the exact same useAutosaveDraft/useDraftPublishActions machinery
// pages do, so save/conflict/publish/discard behave identically.
export function MenuEditorPage() {
  const { siteId = '' } = useParams<{ siteId: string }>();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const path = searchParams.get('path') ?? '';

  const {
    status,
    content,
    setContent,
    source,
    errorMessage,
    invalidJson,
    comparisonContent,
    loadComparison,
    reloadLatest,
  } = useAutosaveDraft(siteId, path);

  const { actionBusy, actionError, confirmingDiscard, handlePublish, handleDiscard, cancelDiscard } = useDraftPublishActions(
    siteId,
    path,
    deriveMenuName(path),
    reloadLatest,
  );

  // Save/Discard render in this page's own footer now (docs/design/
  // Sections Tab.png's pattern, matching PageEditorPage), not the
  // app's shared header - there is no shared header any more.
  const contentLoaded = !isPlaceholderStatus(status);
  const hasPendingChanges = source === 'draft' || status !== 'ready';
  const showFooter = contentLoaded && hasPendingChanges;

  // Same toast-firing rationale as PageEditorPage.tsx: 'not-found' stays
  // a quiet placeholder-only state, but a genuine load failure or an
  // unreachable site interrupts with a popup, same as save/action
  // failures do.
  useEffect(() => {
    if (status === 'load-error') {
      showToast(errorMessage ?? 'Failed to load content.');
    } else if (status === 'unreachable') {
      showToast(errorMessage ?? 'Could not reach the site.');
    }
  }, [status, errorMessage, showToast]);

  useEffect(() => {
    if (status === 'save-error' && errorMessage) {
      showToast(errorMessage);
    }
  }, [status, errorMessage, showToast]);

  useEffect(() => {
    if (actionError) {
      showToast(actionError);
    }
  }, [actionError, showToast]);

  // Same guard as PageEditorPage's own - called unconditionally here,
  // before any of the early returns below, since hooks can never be
  // conditional. See PageEditorPage.tsx for the full rationale.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      contentLoaded &&
      hasPendingChanges &&
      (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search),
  );

  async function handlePromptSave(): Promise<void> {
    const ok = await handlePublish();
    if (ok) {
      blocker.proceed?.();
    }
  }

  async function handlePromptDiscard(): Promise<void> {
    const ok = await handleDiscard({ skipConfirm: true });
    if (ok) {
      blocker.proceed?.();
    }
  }

  const menu = parseMenu(content);

  function updateItems(items: MenuItem[]): void {
    if (menu !== null) {
      setContent(serializeMenu(menu.envelope, items));
    }
  }

  function handleLabelChange(index: number, value: string): void {
    if (menu === null) {
      return;
    }
    updateItems(menu.items.map((item, i) => (i === index ? { ...item, label: value } : item)));
  }

  function handleUrlChange(index: number, value: string): void {
    if (menu === null) {
      return;
    }
    updateItems(menu.items.map((item, i) => (i === index ? { ...item, url: value } : item)));
  }

  function handleRemoveItem(index: number): void {
    if (menu === null) {
      return;
    }
    updateItems(menu.items.filter((_, i) => i !== index));
  }

  function handleAddItem(): void {
    if (menu === null) {
      return;
    }
    updateItems([...menu.items, { label: '', url: '' }]);
  }

  function handleMove(index: number, direction: -1 | 1): void {
    if (menu === null) {
      return;
    }
    const target = index + direction;
    if (target < 0 || target >= menu.items.length) {
      return;
    }
    const next = [...menu.items];
    const moved = next[index] as MenuItem;
    next[index] = next[target] as MenuItem;
    next[target] = moved;
    updateItems(next);
  }

  return (
    <>
      <div className="list-page">
        <div className="list-page-inner menu-editor-page">
          <h1>{deriveMenuName(path)}</h1>

          {invalidJson && <p role="alert">Not valid JSON yet - not saved.</p>}

          {status === 'conflict' && (
            <section>
              <p role="alert">This menu changed since you opened it.</p>
              <button type="button" onClick={reloadLatest}>
                Reload latest version
              </button>
              <button type="button" onClick={loadComparison}>
                View changes
              </button>
              {comparisonContent !== null && (
                <div>
                  <h2>Latest on the server</h2>
                  <pre>{comparisonContent}</pre>
                  <h2>Your unsaved version</h2>
                  <pre>{content}</pre>
                </div>
              )}
            </section>
          )}

          {isPlaceholderStatus(status) ? (
            <EditorContentPlaceholder status={status} />
          ) : menu === null ? (
            <p role="alert">This menu&apos;s content isn&apos;t valid right now - fix it before it can be edited here.</p>
          ) : (
            <>
              <ul className="menu-item-list">
                {menu.items.map((item, index) => (
                  // No stable id in the data model (menu.schema.json's items
                  // are additionalProperties: false - a client-side id has
                  // nowhere to live) - index is the only key available, an
                  // accepted trade-off for a short, non-virtualised list.
                  <li key={index} className="menu-item-row">
                    <label>
                      Label
                      <input value={item.label} onChange={(event) => handleLabelChange(index, event.target.value)} />
                    </label>
                    <label>
                      URL
                      <input value={item.url} onChange={(event) => handleUrlChange(index, event.target.value)} />
                    </label>
                    <button type="button" onClick={() => handleMove(index, -1)} disabled={index === 0} aria-label="Move up">
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(index, 1)}
                      disabled={index === menu.items.length - 1}
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="instance-row-remove"
                      aria-label={`Remove ${item.label || 'menu item'}`}
                      onClick={() => handleRemoveItem(index)}
                    >
                      <TrashIcon />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="menu-editor-footer">
                <button type="button" className="instance-add-button" onClick={handleAddItem}>
                  + Add menu item
                </button>
              </div>
            </>
          )}

          {showFooter && (
            <div className="editor-footer">
              <button type="button" onClick={() => void handleDiscard()} disabled={actionBusy || status === 'saving'}>
                Discard Changes
              </button>
              <button
                type="button"
                className="button-primary"
                onClick={() => void handlePublish()}
                disabled={
                  actionBusy || status === 'dirty' || status === 'saving' || status === 'save-error' || status === 'conflict'
                }
              >
                Save Changes
              </button>
            </div>
          )}
        </div>
      </div>
      {blocker.state === 'blocked' && (
        <UnsavedChangesPrompt
          busy={actionBusy}
          error={actionError}
          onSave={() => void handlePromptSave()}
          onDiscard={() => void handlePromptDiscard()}
          onCancel={() => blocker.reset?.()}
        />
      )}
      {confirmingDiscard && (
        <ConfirmDialog
          message="Discard the draft and return to the live version? This cannot be undone."
          confirmLabel="Discard Changes"
          busy={actionBusy}
          onConfirm={() => void handleDiscard({ skipConfirm: true })}
          onCancel={cancelDiscard}
        />
      )}
    </>
  );
}
