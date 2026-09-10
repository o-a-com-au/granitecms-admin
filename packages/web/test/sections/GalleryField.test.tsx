import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GalleryField } from '../../src/sections/GalleryField.tsx';
import { createFakeDataTransfer } from '../helpers/fakeDataTransfer.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Mirrors ImageField.test.tsx's own installFakeMediaApi exactly -
// GalleryField's useSites() call means every render fetches
// /api/sites, and opening the picker fetches the site's media list.
function installFakeMediaApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/sites') {
        return new Response(
          JSON.stringify([{ id: 'site-1', url: 'http://site.example', createdAt: '', updatedAt: '', status: { state: 'ok', agentVersion: '', contentSchemaVersion: 1, sqliteDriver: '' } }]),
          { status: 200 },
        );
      }
      if (url === '/api/sites/site-1/media') {
        return new Response(
          JSON.stringify({
            items: [{ name: 'chosen.jpg', size: 5, mtimeMs: 1, url: 'http://site.example/media/chosen.jpg' }],
            maxUploadBytes: 1000,
          }),
          { status: 200 },
        );
      }
      throw new Error(`unhandled fetch in test: ${url}`);
    }),
  );
}

// Mirrors StringListField.test.tsx's own dragOnto helper - the same
// horizontal gap maths, just against a grid tile's rect instead of a
// chip's.
function dragOnto(fromTile: HTMLElement, toTile: HTMLElement, half: 'left' | 'right'): void {
  vi.spyOn(toTile, 'getBoundingClientRect').mockReturnValue({
    top: 0,
    height: 0,
    bottom: 0,
    left: 0,
    right: 40,
    width: 40,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);

  fireEvent.dragStart(fromTile, { dataTransfer: createFakeDataTransfer() });
  fireEvent.dragOver(toTile, { clientX: half === 'left' ? 5 : 35 });
  fireEvent.drop(toTile);
}

describe('GalleryField', () => {
  beforeEach(() => {
    installFakeMediaApi();
  });

  it('renders one tile per image, in order', async () => {
    render(
      <GalleryField
        siteId="site-1"
        value={[{ url: 'https://example.com/a.jpg', focalX: 0.5, focalY: 0.5 }, { url: 'https://example.com/b.jpg', focalX: 0.5, focalY: 0.5 }]}
        labelledBy="gallery-label"
        onChange={vi.fn()}
      />,
    );

    const images = (await screen.findAllByRole('img')) as HTMLImageElement[];
    expect(images.map((img) => img.src)).toEqual(['https://example.com/a.jpg', 'https://example.com/b.jpg']);
  });

  it('a non-array value renders as an empty grid, not a crash', () => {
    render(<GalleryField siteId="site-1" value={undefined} labelledBy="gallery-label" onChange={vi.fn()} />);
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('"+ Add image" opens the media picker, and selecting an item appends a centred-focal-point entry', async () => {
    const onChange = vi.fn();
    render(
      <GalleryField
        siteId="site-1"
        value={[{ url: 'https://example.com/a.jpg', focalX: 0.5, focalY: 0.5 }]}
        labelledBy="gallery-label"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '+ Add image' }));
    expect(screen.getByRole('dialog', { name: 'Choose an image' })).toBeDefined();
    await waitFor(() => expect(screen.getByText('chosen.jpg')).toBeDefined());
    fireEvent.click(screen.getByAltText('chosen.jpg'));
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));

    expect(onChange).toHaveBeenCalledWith([
      { url: 'https://example.com/a.jpg', focalX: 0.5, focalY: 0.5 },
      { url: 'http://site.example/media/chosen.jpg', focalX: 0.5, focalY: 0.5 },
    ]);
    expect(screen.queryByRole('dialog', { name: 'Choose an image' })).toBeNull();
  });

  it('"+ Add image" is disabled once maxItems is reached', () => {
    render(
      <GalleryField
        siteId="site-1"
        value={[{ url: 'https://example.com/a.jpg', focalX: 0.5, focalY: 0.5 }]}
        maxItems={1}
        labelledBy="gallery-label"
        onChange={vi.fn()}
      />,
    );

    expect((screen.getByRole('button', { name: '+ Add image' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('clicking a tile\'s remove button drops that entry', async () => {
    const onChange = vi.fn();
    render(
      <GalleryField
        siteId="site-1"
        value={[{ url: 'https://example.com/a.jpg', focalX: 0.5, focalY: 0.5 }, { url: 'https://example.com/b.jpg', focalX: 0.5, focalY: 0.5 }]}
        labelledBy="gallery-label"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove image 2' }));

    expect(onChange).toHaveBeenCalledWith([{ url: 'https://example.com/a.jpg', focalX: 0.5, focalY: 0.5 }]);
  });

  it('no remove control is offered on any tile once minItems would be violated by removing one', () => {
    render(
      <GalleryField
        siteId="site-1"
        value={[{ url: 'https://example.com/a.jpg', focalX: 0.5, focalY: 0.5 }]}
        minItems={1}
        labelledBy="gallery-label"
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /^Remove image/i })).toBeNull();
  });

  it("dragging a tile onto another tile's position reorders the array and calls onChange", () => {
    const onChange = vi.fn();
    render(
      <GalleryField
        siteId="site-1"
        value={[
          { url: 'https://example.com/a.jpg', focalX: 0.5, focalY: 0.5 },
          { url: 'https://example.com/b.jpg', focalX: 0.5, focalY: 0.5 },
          { url: 'https://example.com/c.jpg', focalX: 0.5, focalY: 0.5 },
        ]}
        labelledBy="gallery-label"
        onChange={onChange}
      />,
    );

    const tiles = Array.from(document.querySelectorAll('.gallery-field-tile')) as HTMLElement[];
    dragOnto(tiles[0] as HTMLElement, tiles[2] as HTMLElement, 'right');

    expect(onChange).toHaveBeenCalledWith([
      { url: 'https://example.com/b.jpg', focalX: 0.5, focalY: 0.5 },
      { url: 'https://example.com/c.jpg', focalX: 0.5, focalY: 0.5 },
      { url: 'https://example.com/a.jpg', focalX: 0.5, focalY: 0.5 },
    ]);
  });

  it('dropping a tile back onto its own current gap is a no-op - onChange is never called', () => {
    const onChange = vi.fn();
    render(
      <GalleryField
        siteId="site-1"
        value={[{ url: 'https://example.com/a.jpg', focalX: 0.5, focalY: 0.5 }, { url: 'https://example.com/b.jpg', focalX: 0.5, focalY: 0.5 }]}
        labelledBy="gallery-label"
        onChange={onChange}
      />,
    );

    const tiles = Array.from(document.querySelectorAll('.gallery-field-tile')) as HTMLElement[];
    dragOnto(tiles[0] as HTMLElement, tiles[0] as HTMLElement, 'left');

    expect(onChange).not.toHaveBeenCalled();
  });
});
