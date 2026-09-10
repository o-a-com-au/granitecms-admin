import { readSiteEditorContent, saveSiteDraft, SiteEditorError } from '../api/site-editor.ts';
import { readLastEditorLocation } from '../sites/currentSite.ts';
import { coerceImageValue } from '../sections/ImageField.tsx';
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

// The whole "drag a media item onto the preview" save, self-contained
// and composed entirely from pieces that already exist elsewhere for
// other reasons - no new agent-side endpoint, no new save mechanism.
// Deliberately no React dependency (same as readSiteEditorContent/
// saveSiteDraft themselves) - the caller (useSectionClickToEdit's drop
// handler) is what has bumpPreview/showToast available, via hooks this
// plain function can't call itself.
export async function replaceInstanceImage(
  siteId: string,
  instanceId: string,
  field: string,
  newUrl: string,
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

  // Keep the existing focal point, only replace the url - the same
  // "swap the image, keep the crop" behaviour ImageField.handlePickerSelect
  // already gives a manual picker-based replace.
  const updatedSections = updateInstance(page.sections, instanceId, (instance) => ({
    ...instance,
    settings: {
      ...instance.settings,
      [field]: { ...coerceImageValue(instance.settings[field]), url: newUrl },
    },
  }));

  await saveSiteDraft(siteId, path, JSON.stringify({ ...page, sections: updatedSections }), etag);
}
