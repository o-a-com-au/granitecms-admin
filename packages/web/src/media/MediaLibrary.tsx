import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { deleteSiteMedia, uploadSiteMedia, type MediaItem } from '../api/site-media.ts';
import { useSiteMedia } from './useSiteMedia.ts';
import { TrashIcon } from '../sections/TrashIcon.tsx';
import { SiteStatusPanel } from '../site-status/SiteStatusPanel.tsx';
import { TopLoadingBar } from '../site-status/TopLoadingBar.tsx';
import { buildLoadErrorActions, loadErrorMessage } from '../sites/site-load-error.ts';

export interface MediaLibraryProps {
  siteId: string;
  mode: 'panel' | 'picker';
  // Controlled selection, picker mode only - the full MediaItem (not
  // just its name) so MediaPickerModal never needs a second, redundant
  // GET /media call to resolve what was clicked.
  selectedItem?: MediaItem | null;
  onSelectedItemChange?: (item: MediaItem | null) => void;
}

// Fast client-side feedback only - the agent stays the real authority
// regardless (same file type/size enforced again, authoritatively,
// server-side). Matches the agent's own ALLOWED_UPLOAD_EXTENSIONS
// (routes/media.ts) exactly - SVG deliberately excluded there since it
// isn't sanitised, so it isn't offered here either.
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

interface FileError {
  filename: string;
  message: string;
}

function hasAllowedExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ALLOWED_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function matchesSearch(item: MediaItem, query: string): boolean {
  if (query.trim() === '') {
    return true;
  }
  return item.name.toLowerCase().includes(query.trim().toLowerCase());
}

export function MediaLibrary({ siteId, mode, selectedItem, onSelectedItemChange }: MediaLibraryProps) {
  const { items, loading, loadError, maxUploadBytes, refresh } = useSiteMedia(siteId);
  const [search, setSearch] = useState('');
  const [fileErrors, setFileErrors] = useState<FileError[]>([]);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  // Counts drag-enter/leave rather than toggling a boolean directly -
  // a child element inside the dropzone re-triggers dragleave on every
  // pointer crossing, so only clearing the highlight at count 0 avoids
  // the classic flicker.
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(fileList: FileList | null): Promise<void> {
    if (!fileList || fileList.length === 0) {
      return;
    }
    const files = Array.from(fileList);
    const cap = maxUploadBytes ?? Infinity;
    const errors: FileError[] = [];
    const toUpload: File[] = [];

    for (const file of files) {
      if (!hasAllowedExtension(file.name)) {
        errors.push({ filename: file.name, message: 'That file type is not accepted' });
        continue;
      }
      if (file.size > cap) {
        errors.push({ filename: file.name, message: 'That file is too large' });
        continue;
      }
      toUpload.push(file);
    }

    // Uploaded sequentially, not in parallel - matches the agent's own
    // serialised write queue and keeps failures attributable to a
    // single file at a time.
    for (const file of toUpload) {
      try {
        await uploadSiteMedia(siteId, file);
      } catch (err) {
        errors.push({ filename: file.name, message: err instanceof Error ? err.message : 'Upload failed' });
      }
    }

    setFileErrors(errors);
    if (toUpload.length > errors.length) {
      refresh();
    }
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>): void {
    void handleFiles(event.target.files);
    event.target.value = '';
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    dragCounter.current += 1;
    setIsDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragActive(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    dragCounter.current = 0;
    setIsDragActive(false);
    void handleFiles(event.dataTransfer.files);
  }

  async function handleDelete(name: string): Promise<void> {
    setDeleteError(null);
    try {
      await deleteSiteMedia(siteId, name);
      if (mode === 'picker' && selectedItem?.name === name) {
        onSelectedItemChange?.(null);
      }
      refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete that file');
    }
  }

  const filteredItems = items.filter((item) => matchesSearch(item, search));

  // The full-swap loading/error treatment only applies to the panel
  // (mode: 'panel', MediaLibraryPage's own left panel) - MediaPickerModal's
  // mode: 'picker' usage is a small modal, not a full screen, so it
  // keeps its existing flat inline-error behaviour below instead.
  if (mode === 'panel' && loading) {
    return <TopLoadingBar active />;
  }
  if (mode === 'panel' && loadError) {
    return (
      <SiteStatusPanel
        variant="problem"
        message={loadErrorMessage(loadError)}
        actions={buildLoadErrorActions(loadError, siteId, refresh)}
      />
    );
  }

  // Selectable in both modes now - panel mode previews the pick large in
  // the shared viewport (MediaLibraryPage.tsx), picker mode reports it
  // up to MediaPickerModal for the caller to use. Only the top-level
  // "browse without a picker" case (never actually happens now that
  // panel mode always supplies onSelectedItemChange, but the prop stays
  // optional for defensiveness) is a true no-op.
  const isSelectable = mode === 'panel' || mode === 'picker';

  return (
    <div className="media-library">
      <div className="panel-toolbar">
        <input
          type="search"
          className="content-search"
          placeholder="Search media"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {/* Plain button (no .button-primary) - requested directly, with
            a mockup: a neutral box matching this toolbar's own search
            field in height/border, not the app's accent blue. */}
        <button type="button" onClick={() => fileInputRef.current?.click()}>
          Upload
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          hidden
          onChange={handleFileInputChange}
        />
      </div>

      {loadError && <p role="alert">{loadErrorMessage(loadError)}</p>}
      {deleteError && <p role="alert">{deleteError}</p>}
      {fileErrors.length > 0 && (
        <ul className="media-library-errors" role="alert">
          {fileErrors.map((fileError) => (
            <li key={fileError.filename}>
              {fileError.filename}: {fileError.message}
            </li>
          ))}
        </ul>
      )}

      <div
        className={`media-library-dropzone${isDragActive ? ' is-drag-active' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        {!loadError && filteredItems.length === 0 && (
          <p className="media-library-empty">
            {items.length === 0 ? 'No media files yet. Drag images here or use Upload.' : 'No media files match your search.'}
          </p>
        )}
        {filteredItems.length > 0 && (
          <ul className="media-library-grid">
            {filteredItems.map((item) => {
              const isSelected = isSelectable && selectedItem?.name === item.name;
              return (
                <li key={item.name} className={`media-library-item${isSelected ? ' is-selected' : ''}`}>
                  <button
                    type="button"
                    className="media-library-item-thumb"
                    onClick={() => {
                      if (isSelectable) {
                        onSelectedItemChange?.(item);
                      }
                    }}
                  >
                    <img src={item.url} alt={item.name} loading="lazy" />
                  </button>
                  <span className="media-library-item-name">{item.name}</span>
                  <button
                    type="button"
                    className="media-library-item-delete"
                    aria-label={`Delete ${item.name}`}
                    onClick={() => void handleDelete(item.name)}
                  >
                    <TrashIcon />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
