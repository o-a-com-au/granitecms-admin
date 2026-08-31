import { useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router';
import { usePreview, usePreviewFrameHandlers } from '../layout/PreviewContext.tsx';
import { readLastEditorLocation } from '../sites/currentSite.ts';

// Lets Pages hub/Media's own preview (a page shown read-only, not
// currently being edited) support the same "hover a section to
// highlight it, click to jump straight into editing it" interaction
// PageEditorPage already has for itself - requested directly, so
// browsing a page from anywhere and wanting to fix one specific
// section never requires first finding it again in the Sections list.
//
// Deliberately a separate, simpler implementation from PageEditorPage's
// own handlePreviewFrameLoad, not a shared hook both use - that one has
// several other responsibilities this has no need for (bidirectional
// highlight with its own Sections-tab row list, a historical-revision
// guard, internal-link interception for in-preview navigation), and
// forcing both very different call sites through one abstraction right
// now would cost more than it would save.
export function useSectionClickToEdit(siteId: string): void {
  const navigate = useNavigate();
  const { iframeRef } = usePreview();
  const highlightedElementRef = useRef<HTMLElement | null>(null);

  const findSectionElement = useCallback(
    (id: string): HTMLElement | undefined => {
      const doc = iframeRef.current?.contentDocument;
      return doc
        ? Array.from(doc.querySelectorAll<HTMLElement>('[data-section-id]')).find(
            (element) => element.dataset.sectionId === id,
          )
        : undefined;
    },
    [iframeRef],
  );

  const setHighlight = useCallback(
    (id: string | null): void => {
      if (highlightedElementRef.current) {
        highlightedElementRef.current.style.outline = '';
        highlightedElementRef.current.style.outlineOffset = '';
        highlightedElementRef.current = null;
      }
      if (id === null) {
        return;
      }
      const target = findSectionElement(id);
      if (target) {
        target.style.outline = '2px solid #3b6ef6';
        target.style.outlineOffset = '-2px';
        highlightedElementRef.current = target;
      }
    },
    [findSectionElement],
  );

  // readLastEditorLocation (currentSite.ts) already carries the exact
  // path+url for whatever page is currently being previewed -
  // PagesHubPage/PageEditorPage both keep it current whenever they
  // change what's showing, so this never needs its own separate
  // "which page is this" plumbing.
  const navigateToSection = useCallback(
    (sectionId: string): void => {
      const stored = readLastEditorLocation(siteId);
      if (stored === null) {
        return;
      }
      const separator = stored.includes('?') ? '&' : '?';
      navigate(`${stored}${separator}section=${encodeURIComponent(sectionId)}`);
    },
    [siteId, navigate],
  );

  const handleFrameLoad = useCallback((): void => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) {
      return;
    }
    // Duck-typed, not `target instanceof Element` - same cross-frame
    // instanceof pitfall PageEditorPage's own identical helper avoids.
    function sectionIdAt(target: EventTarget | null): string | null {
      if (target === null || !('closest' in target)) {
        return null;
      }
      return (target as Element).closest<HTMLElement>('[data-section-id]')?.dataset.sectionId ?? null;
    }
    doc.addEventListener('mouseover', (event) => {
      const id = sectionIdAt(event.target);
      if (id !== null) {
        setHighlight(id);
      }
    });
    doc.addEventListener('mouseout', (event) => {
      const id = sectionIdAt(event.target);
      const relatedId = sectionIdAt((event as MouseEvent).relatedTarget);
      if (id !== null && id !== relatedId) {
        setHighlight(null);
      }
    });
    // Capture phase, same reasoning as PageEditorPage's own click
    // listener - fires before a real link/button inside the section
    // (e.g. a "Get started" button) can act on the click itself.
    // Deliberately no anchor-link exception here (unlike PageEditorPage's
    // own handlePreviewAnchorClick) - Pages hub/Media have no in-preview
    // navigation concept to preserve, so any click inside a section
    // consistently means "edit this section", full stop.
    doc.addEventListener(
      'click',
      (event) => {
        const id = sectionIdAt(event.target);
        if (id !== null) {
          event.preventDefault();
          navigateToSection(id);
        }
      },
      true,
    );
  }, [iframeRef, setHighlight, navigateToSection]);

  const handleFrameMouseLeave = useCallback(() => setHighlight(null), [setHighlight]);

  const frameHandlers = useMemo(
    () => ({ onFrameLoad: handleFrameLoad, onFrameMouseLeave: handleFrameMouseLeave }),
    [handleFrameLoad, handleFrameMouseLeave],
  );
  usePreviewFrameHandlers(frameHandlers);
}
