import { readSiteEditorContent, saveSiteDraft, SiteEditorError } from '../api/site-editor.ts';
import { readLastEditorLocation } from '../sites/currentSite.ts';
import { coerceImageValue } from '../sections/ImageField.tsx';
import { coerceVideoValue } from '../sections/VideoField.tsx';
import { findInstance, parsePage, updateInstance } from '../sections/page-content.ts';

// Pulls "path" back out of a stored editor location the same way
// currentSite.ts's own readLastPreviewUrl pulls "url" out of it - the
// content path a drop on the Media route's shared preview needs to
// read/save, which Media itself never tracks (it only cares about the
// page's live url, for the iframe src).
function readLastEditorContentPath(siteId: string): string | null {
  const pathAndSearch = readLastEditorLocation(siteId);
  const queryIndex = pathAndSearch?.indexOf('?') ?? -1;
  if (pathAndSearch === null || queryIndex === -1) {
    return null;
  }
  return new URLSearchParams(pathAndSearch.slice(queryIndex)).get('path');
}

// Which shape the target field stores. Not MediaKind (mediaKind.ts) -
// that is the library's own all/images/videos view filter, a different
// thing that happens to share two words.
export type MediaTargetKind = 'image' | 'video';

// Reads a kind off an attribute or a drag payload. Anything that is not
// exactly "video" is an image: data-cms-image, the attribute themes used
// before data-cms-media existed, marks images and carries no kind at
// all, and a drag payload from an older build carries none either. So
// the absent case has to mean image, not "unknown".
//
// Pure, and exported, so the rule that decides whether a drop is
// refused can be tested directly - the comparison itself lives in a drop
// handler bound to an iframe document, which has no test harness.
export function mediaKindFromAttribute(value: string | null | undefined): MediaTargetKind {
  return value === 'video' ? 'video' : 'image';
}

// The whole "drag a media item onto the preview" save, self-contained
// and composed entirely from pieces that already exist elsewhere for
// other reasons - no new agent-side endpoint, no new save mechanism.
// Deliberately no React dependency (same as readSiteEditorContent/
// saveSiteDraft themselves) - the caller (useSectionClickToEdit's drop
// handler) is what has bumpPreview/showToast available, via hooks this
// plain function can't call itself.
export async function replaceInstanceMedia(
  siteId: string,
  instanceId: string,
  field: string,
  newUrl: string,
  kind: MediaTargetKind,
): Promise<void> {
  const path = readLastEditorContentPath(siteId);
  if (path === null) {
    throw new SiteEditorError('error', 'No page is currently open in the preview');
  }

  const { content, etag } = await readSiteEditorContent(siteId, path);
  const page = parsePage(content);
  if (page === null) {
    throw new SiteEditorError('error', 'This page is not in the expected sections format');
  }

  const found = findInstance(page.sections, instanceId);
  if (found === null) {
    throw new SiteEditorError('error', 'The dropped-on section or block no longer exists on this page');
  }

  // Only the url changes, whichever kind this is: an image keeps its
  // focal point and a video keeps its poster, the same "swap the file,
  // keep everything set around it" behaviour the manual picker gives.
  // The two shapes are genuinely different ({ url, focalX, focalY } vs
  // { url, poster }), so writing the wrong one here does not merely look
  // odd - it fails the agent's own schema validation on save, or strips
  // a poster that was deliberately chosen.
  const updatedSections = updateInstance(page.sections, instanceId, (instance) => ({
    ...instance,
    settings: {
      ...instance.settings,
      [field]:
        kind === 'video'
          ? { ...coerceVideoValue(instance.settings[field]), url: newUrl }
          : { ...coerceImageValue(instance.settings[field]), url: newUrl },
    },
  }));

  await saveSiteDraft(siteId, path, JSON.stringify({ ...page, sections: updatedSections }), etag);
}
