import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router';
import { usePreview, usePreviewFrameHandlers } from '../layout/PreviewContext.tsx';
import { readLastEditorLocation, writeLastEditorLocation } from '../sites/currentSite.ts';
import { useToast } from '../toast/ToastContext.tsx';
import { replaceInstanceImage } from '../media/replace-instance-image.ts';
import { SiteEditorError } from '../api/site-editor.ts';
import { listSiteContent } from '../api/site-content.ts';

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
  const { iframeRef, bumpPreview, setPreview } = usePreview();
  const { showToast } = useToast();
  const highlightedElementRef = useRef<HTMLElement | null>(null);

  // Same "index every page's live url -> content path once, so a real
  // link click in the preview can be resolved to something this CMS
  // actually tracks" PageEditorPage.tsx's own contentIndexRef does, for
  // the same reason - the agent's content-list endpoint has no
  // single-url lookup, only a full listing. Kept in a ref, not state -
  // read from inside a plain DOM event listener (handleAnchorClick,
  // below), never rendered.
  const contentIndexRef = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    let cancelled = false;
    contentIndexRef.current = null;
    listSiteContent(siteId, {})
      .then((entries) => {
        if (cancelled) {
          return;
        }
        const index = new Map<string, string>();
        for (const entry of entries) {
          if (entry.url !== null) {
            index.set(entry.url, entry.path);
          }
        }
        contentIndexRef.current = index;
      })
      .catch(() => {
        // A preview link just won't be recognised as internal
        // navigation until this loads (or a future siteId change
        // retries it) - clicking it falls back to opening in a new
        // tab, same as PageEditorPage.tsx's own identical fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);
  // Separate from highlightedElementRef above - a different, narrower
  // granularity (the one [data-cms-image] element under the cursor
  // during a drag, not the whole section/block) and never active at
  // the same time as it anyway: the browser suppresses mouseover for
  // the duration of an active native drag.
  const dragHighlightedElementRef = useRef<HTMLElement | null>(null);

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

  // Resolves the drop target from a drag event fired inside the
  // iframe's own document - localX/localY are already relative to that
  // document's own viewport (native behaviour for an event dispatched
  // there), no iframe-offset math needed.
  //
  // A plain elementFromPoint().closest('[data-cms-image]') isn't quite
  // enough on its own, though: several sections layer a purely
  // decorative element on top of the image itself (site-hero's own
  // scrim, a parallax grid line) - confirmed live, elementFromPoint
  // hits that overlay, a sibling of the picture rather than an
  // ancestor, so closest() from there finds nothing. Falls back to
  // picking whichever [data-cms-image] element within the same
  // section/block instance actually contains the point geometrically,
  // tolerating a non-interactive overlay winning the initial hit-test.
  const resolveDropTarget = useCallback(
    (doc: Document, localX: number, localY: number): { imageElement: HTMLElement; instanceElement: HTMLElement } | null => {
      const hit = doc.elementFromPoint(localX, localY);
      const instanceElement = hit?.closest<HTMLElement>('[data-section-id],[data-block-id]') ?? null;
      if (!hit || !instanceElement) {
        return null;
      }

      const directHit = hit.closest<HTMLElement>('[data-cms-image]');
      if (directHit) {
        return { imageElement: directHit, instanceElement };
      }

      const candidates = instanceElement.querySelectorAll<HTMLElement>('[data-cms-image]');
      for (const candidate of candidates) {
        const rect = candidate.getBoundingClientRect();
        if (localX >= rect.left && localX <= rect.right && localY >= rect.top && localY <= rect.bottom) {
          return { imageElement: candidate, instanceElement };
        }
      }
      return null;
    },
    [],
  );

  const setDragHighlight = useCallback((target: HTMLElement | null): void => {
    // dragover fires continuously while stationary (unlike mouseover,
    // which only fires on entry) - this no-ops the common case instead
    // of rewriting the same inline style on every event.
    if (target === dragHighlightedElementRef.current) {
      return;
    }
    if (dragHighlightedElementRef.current) {
      dragHighlightedElementRef.current.style.outline = '';
      dragHighlightedElementRef.current.style.outlineOffset = '';
      dragHighlightedElementRef.current = null;
    }
    if (target) {
      // No outline-offset, unlike the section-hover highlight's own
      // -2px (setHighlight above) - every [data-cms-image] element
      // carries the theme's .ri class, which sets overflow: hidden to
      // crop to its aspect ratio. A negative offset draws the outline
      // inside the border box, which that same overflow: hidden then
      // clips - confirmed live, the outline was being set correctly
      // the whole time, just invisible. Left at the default (drawn
      // right at the border edge) instead, never subject to the
      // element's own overflow.
      target.style.outline = '2px solid #3b6ef6';
      dragHighlightedElementRef.current = target;
    }
  }, []);

  // Drag a media item from the Media panel's grid onto an image in the
  // preview to replace it - the dropped-on element carries data-cms-image
  // (theme/snippets/responsive-image.liquid) naming which settings field
  // it renders, and the nearest data-section-id/data-block-id ancestor
  // names the instance that field lives on. Composed entirely from
  // pieces that already exist for other reasons (replace-instance-image.ts);
  // this is the only new write path.
  const handleDrop = useCallback(
    (event: DragEvent): void => {
      const doc = iframeRef.current?.contentDocument;
      const newUrl = event.dataTransfer?.getData('application/x-cms-media-url');
      if (!doc || !newUrl) {
        return;
      }
      const target = resolveDropTarget(doc, event.clientX, event.clientY);
      if (!target) {
        return;
      }
      const { imageElement, instanceElement } = target;
      event.preventDefault();
      setDragHighlight(null);
      const instanceId = instanceElement.dataset.sectionId ?? instanceElement.dataset.blockId;
      const field = imageElement.dataset.cmsImage;
      if (!instanceId || !field) {
        return;
      }
      replaceInstanceImage(siteId, instanceId, field, newUrl)
        .then(() => bumpPreview())
        .catch((error: unknown) => {
          const message = error instanceof SiteEditorError ? error.message : 'Could not replace that image';
          showToast(message, 'error');
        });
    },
    [siteId, bumpPreview, showToast, setDragHighlight, resolveDropTarget, iframeRef],
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

  // A click that lands outside any section at all - the theme's own
  // layout-level header/footer nav, for instance, which sectionIdAt
  // above has nothing to match against. Left to the browser's own
  // default navigation, a real link here would send the iframe away
  // from the admin-proxied preview to the site's actual origin
  // directly (this preview's own HTML carries a <base href> pointing
  // there, so relative links resolve to it) - confirmed live, that's
  // exactly what caused a later SecurityError trying to read the (now
  // genuinely cross-origin) iframe's contentWindow, and separately
  // left the admin's own address display/Pages list stuck on the old
  // page since nothing here ever told it navigation had happened.
  //
  // Mirrors PageEditorPage.tsx's own handlePreviewAnchorClick, but
  // switches the shared preview's own url (setPreview) rather than
  // navigating this route to the Editor - Pages hub/Media only need to
  // keep showing the new page, matching what clicking a row in the
  // Pages list itself already does (PagesHubPage.tsx's handlePreview).
  const handleAnchorClick = useCallback(
    (event: MouseEvent, anchor: HTMLAnchorElement, doc: Document): void => {
      const href = anchor.getAttribute('href');
      if (href === null) {
        return;
      }
      let resolved: URL;
      let siteOrigin: string;
      try {
        resolved = new URL(href, doc.baseURI);
        siteOrigin = new URL(doc.baseURI).origin;
      } catch {
        return;
      }

      if (resolved.origin !== siteOrigin) {
        event.preventDefault();
        window.open(resolved.href, '_blank', 'noopener,noreferrer');
        return;
      }

      const matchedPath = contentIndexRef.current?.get(resolved.pathname) ?? null;
      if (matchedPath === null) {
        event.preventDefault();
        window.open(resolved.href, '_blank', 'noopener,noreferrer');
        return;
      }

      event.preventDefault();
      setPreview({ url: resolved.pathname });
      const params = new URLSearchParams({ path: matchedPath, url: resolved.pathname });
      writeLastEditorLocation(siteId, `/sites/${siteId}/editor?${params.toString()}`);
    },
    [siteId, setPreview],
  );

  const handleFrameLoad = useCallback((): void => {
    const maybeDoc = iframeRef.current?.contentDocument;
    if (!maybeDoc) {
      return;
    }
    // Re-bound to a definitely-typed const - TS doesn't carry the
    // above null-check's narrowing into the nested onDragOverOrEnter
    // function declaration below, which passes doc on to
    // resolveDropTarget.
    const doc: Document = maybeDoc;
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
    // (e.g. a "Get started" button) can act on the click itself. A
    // click inside a section still consistently means "edit this
    // section", full stop, same deliberate choice as ever - only a
    // click that finds no section at all (see handleAnchorClick above)
    // falls through to real link-following instead.
    doc.addEventListener(
      'click',
      (event) => {
        const mouseEvent = event as MouseEvent;
        const id = sectionIdAt(event.target);
        if (id !== null) {
          event.preventDefault();
          navigateToSection(id);
          return;
        }
        const anchor =
          mouseEvent.target !== null && 'closest' in mouseEvent.target
            ? (mouseEvent.target as Element).closest<HTMLAnchorElement>('a[href]')
            : null;
        if (anchor !== null) {
          handleAnchorClick(mouseEvent, anchor, doc);
        }
      },
      true,
    );
    // dragenter AND dragover both call preventDefault - an element only
    // stays a recognised drop target if dragenter's default is
    // prevented too, not just dragover's.
    function onDragOverOrEnter(event: DragEvent): void {
      const target = resolveDropTarget(doc, event.clientX, event.clientY);
      if (target) {
        event.preventDefault();
      }
      setDragHighlight(target?.imageElement ?? null);
    }
    doc.addEventListener('dragenter', onDragOverOrEnter);
    doc.addEventListener('dragover', onDragOverOrEnter);
    doc.addEventListener('dragleave', (event) => {
      const related = (event as DragEvent).relatedTarget;
      const stillInside =
        related !== null && 'closest' in (related as object) ? (related as Element).closest('[data-cms-image]') : null;
      if (!stillInside) {
        setDragHighlight(null);
      }
    });
    doc.addEventListener('drop', handleDrop);
  }, [iframeRef, setHighlight, navigateToSection, handleAnchorClick, setDragHighlight, resolveDropTarget, handleDrop]);

  const handleFrameMouseLeave = useCallback(() => setHighlight(null), [setHighlight]);

  const frameHandlers = useMemo(
    () => ({ onFrameLoad: handleFrameLoad, onFrameMouseLeave: handleFrameMouseLeave }),
    [handleFrameLoad, handleFrameMouseLeave],
  );
  usePreviewFrameHandlers(frameHandlers);
}
