import { useCallback, useEffect, useRef, useState } from 'react';
import { readSiteEditorContent, saveSiteDraft, SiteEditorError, type ValidationFieldError } from '../api/site-editor.ts';

export type EditorStatus =
  | 'loading'
  | 'ready'
  | 'dirty'
  | 'saving'
  | 'save-error'
  | 'conflict'
  | 'not-found'
  | 'site-not-found'
  | 'load-error'
  | 'unreachable';

const DEBOUNCE_MS = 1000;

export interface UseAutosaveDraftResult {
  status: EditorStatus;
  content: string;
  setContent: (value: string) => void;
  source: 'draft' | 'live' | null;
  errorMessage: string | null;
  // Group I, I5: the real ajv errors from a failed save, alongside
  // errorMessage's own flat summary - additive only, no change to the
  // save/debounce/conflict machinery below.
  validationErrors: ValidationFieldError[] | null;
  invalidJson: boolean;
  comparisonContent: string | null;
  loadComparison: () => void;
  reloadLatest: () => void;
}

// Public contract is deliberately UI-agnostic (a string in/out, plus
// status/etag bookkeeping) - per phase-3-checklist.md's own I6
// ("reordering sections/blocks and editing settings all flow through
// the same autosave/ETag/conflict path Group E already built"), so a
// future real form-based editor can drive this same hook without
// touching it.
export function useAutosaveDraft(
  siteId: string,
  path: string,
  debounceMs: number = DEBOUNCE_MS,
): UseAutosaveDraftResult {
  const [status, setStatusState] = useState<EditorStatus>('loading');
  const [content, setContentState] = useState('');
  const [source, setSource] = useState<'draft' | 'live' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationFieldError[] | null>(null);
  const [invalidJson, setInvalidJson] = useState(false);
  const [comparisonContent, setComparisonContent] = useState<string | null>(null);

  // Refs, not just state, for everything read synchronously inside
  // timers/callbacks - avoids stale-closure bugs the debounce/chained-
  // save logic below depends on being exactly up to date.
  const statusRef = useRef<EditorStatus>('loading');
  const etagRef = useRef<string | null>(null);
  const contentRef = useRef('');
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function updateStatus(next: EditorStatus): void {
    statusRef.current = next;
    setStatusState(next);
  }

  const load = useCallback(async () => {
    updateStatus('loading');
    setErrorMessage(null);
    // Same staleness as attemptSave's success branch above: reloadLatest
    // (Discard Changes, the conflict panel's own reload, SiteStatusPanel's
    // Retry) all funnel through this same load(), and a validation error
    // from before the reload has nothing to do with whatever content is
    // about to replace it.
    setValidationErrors(null);
    try {
      const result = await readSiteEditorContent(siteId, path);
      etagRef.current = result.etag;
      contentRef.current = result.content;
      setContentState(result.content);
      setSource(result.source);
      updateStatus('ready');
    } catch (err) {
      if (err instanceof SiteEditorError && err.reason === 'site-not-found') {
        updateStatus('site-not-found');
      } else if (err instanceof SiteEditorError && err.reason === 'not-found') {
        updateStatus('not-found');
      } else if (err instanceof SiteEditorError && err.reason === 'unreachable') {
        updateStatus('unreachable');
        setErrorMessage(err.message);
      } else {
        updateStatus('load-error');
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load content');
      }
    }
  }, [siteId, path]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () => () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    },
    [],
  );

  // Single-flight with a queued follow-up, not cancel-and-restart or
  // overlapping saves. If a save is already in flight when this is
  // called again (the debounce timer fired mid-save), it just marks
  // pendingSave and returns - no second PUT starts. On success, the
  // held etag updates immediately (E3), then if pendingSave was set,
  // the next save fires right away using that fresh etag, no further
  // debounce wait - this is what stops rapid typing from ever
  // silently losing an edit.
  const attemptSave = useCallback(async () => {
    if (saveInFlightRef.current) {
      pendingSaveRef.current = true;
      return;
    }
    if (etagRef.current === null) {
      return;
    }

    saveInFlightRef.current = true;
    pendingSaveRef.current = false;
    updateStatus('saving');

    try {
      const newEtag = await saveSiteDraft(siteId, path, contentRef.current, etagRef.current);
      etagRef.current = newEtag;
      saveInFlightRef.current = false;
      // A successful PUT to /drafts/:path always means a draft now
      // exists, regardless of what source held before this call - a
      // page/menu that started as live-only (no draft yet) has one for
      // the first time. Without this, source stays stuck at its
      // initial-load value, and hasPendingChanges (PageEditorPage/
      // MenuEditorPage's own gate for showing Save/Discard) would
      // incorrectly go false the moment status returns to 'ready',
      // hiding the very actions needed to publish or discard the draft
      // that was just created.
      setSource('draft');

      // A prior failed attempt's errorMessage/validationErrors were
      // never cleared on success - they lingered in state indefinitely,
      // so buildFieldErrorMap (page-content.ts) kept mapping a long-
      // since-fixed error onto whatever section now sits at that same
      // array index (sections can reorder/change), lighting up a red
      // dot on a section with no actual error and no matching field to
      // show it against. A genuinely new failure re-sets both from the
      // catch branch below regardless.
      setErrorMessage(null);
      setValidationErrors(null);

      if (pendingSaveRef.current) {
        void attemptSave();
      } else {
        updateStatus('ready');
      }
    } catch (err) {
      saveInFlightRef.current = false;
      if (err instanceof SiteEditorError && err.reason === 'conflict') {
        // E4: stop the loop entirely - don't touch the held etag or
        // discard local content, E5 owns what happens next.
        updateStatus('conflict');
      } else {
        updateStatus('save-error');
        setErrorMessage(err instanceof Error ? err.message : 'Failed to save');
        setValidationErrors(err instanceof SiteEditorError ? (err.validationErrors ?? null) : null);
      }
    }
  }, [siteId, path]);

  const setContent = useCallback(
    (value: string) => {
      contentRef.current = value;
      setContentState(value);

      let validJson = true;
      try {
        JSON.parse(value);
      } catch {
        validJson = false;
      }
      setInvalidJson(!validJson);

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      // Autosave stays fully paused during a conflict until the user
      // explicitly reloads (E4/E5) - not just re-guarded against
      // overlap, genuinely not scheduled at all.
      if (statusRef.current === 'conflict') {
        return;
      }

      if (statusRef.current !== 'saving') {
        updateStatus('dirty');
      }

      if (!validJson) {
        // Not valid JSON yet - held, not saved, per this group's own
        // design decision to catch this client-side rather than
        // giving the backend anything to parse.
        return;
      }

      debounceTimerRef.current = setTimeout(() => {
        void attemptSave();
      }, debounceMs);
    },
    [attemptSave, debounceMs],
  );

  const reloadLatest = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingSaveRef.current = false;
    setComparisonContent(null);
    void load();
  }, [load]);

  // Reuses the exact same draft-then-live read as the initial load,
  // not a live-only fetch - the far more common real conflict source
  // is another tab's own draft autosave (E6's own scenario), and a
  // live-only comparison would show the wrong thing for exactly that
  // case. Populates a separate field, never touches the authoritative
  // etag/content - merely viewing must never silently resolve the
  // conflict (E5).
  const loadComparison = useCallback(() => {
    readSiteEditorContent(siteId, path)
      .then((result) => setComparisonContent(result.content))
      .catch(() => setComparisonContent('(failed to load the latest version)'));
  }, [siteId, path]);

  return {
    status,
    content,
    setContent,
    source,
    errorMessage,
    validationErrors,
    invalidJson,
    comparisonContent,
    loadComparison,
    reloadLatest,
  };
}
