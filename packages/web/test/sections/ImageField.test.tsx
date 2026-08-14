import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ImageField, type ImageFieldValue } from '../../src/sections/ImageField.tsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function installFakeMediaApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
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

function mockRect(img: HTMLElement, rect: Partial<DOMRect>): void {
  vi.spyOn(img, 'getBoundingClientRect').mockReturnValue({
    top: 0,
    left: 0,
    width: 100,
    height: 100,
    bottom: 100,
    right: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect);
}

// SchemaField always renders a real <label> wrapping the field's own
// control - native label-wrapping is what resolves getByLabelText,
// same as every other field type's own test (SchemaField.test.tsx),
// not a bare sibling <span>/id pairing which has no such resolution
// for a plain <input>.
function renderField(value: unknown, onChange = vi.fn()) {
  render(
    <label>
      Poster
      <ImageField siteId="site-1" value={value} onChange={onChange} />
    </label>,
  );
  return { onChange };
}

describe('ImageField', () => {
  it('renders a text input bound to the current url', () => {
    renderField({ url: 'https://example.com/a.jpg', focalX: 0.5, focalY: 0.5 });

    const input = screen.getByLabelText('Poster') as HTMLInputElement;
    expect(input.value).toBe('https://example.com/a.jpg');
  });

  it('defaults to an empty url and a centred 0.5/0.5 focal point for an absent/malformed value', () => {
    renderField(undefined);

    expect((screen.getByLabelText('Poster') as HTMLInputElement).value).toBe('');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('shows no preview/marker while the url is empty', () => {
    renderField({ url: '', focalX: 0.5, focalY: 0.5 });

    expect(screen.queryByRole('img')).toBeNull();
  });

  it('typing a new url preserves the existing focal point in the onChange payload', () => {
    const { onChange } = renderField({ url: 'https://example.com/a.jpg', focalX: 0.2, focalY: 0.8 });

    fireEvent.change(screen.getByLabelText('Poster'), { target: { value: 'https://example.com/b.jpg' } });

    expect(onChange).toHaveBeenCalledWith({ url: 'https://example.com/b.jpg', focalX: 0.2, focalY: 0.8 });
  });

  it('clicking the preview computes focalX/focalY as fractions of the image bounding box, preserving the url', () => {
    const { onChange } = renderField({ url: 'https://example.com/a.jpg', focalX: 0.5, focalY: 0.5 });

    const img = screen.getByRole('img');
    mockRect(img, { top: 0, left: 0, width: 100, height: 100 });

    fireEvent.click(img, { clientX: 25, clientY: 75 });

    expect(onChange).toHaveBeenCalledWith({ url: 'https://example.com/a.jpg', focalX: 0.25, focalY: 0.75 });
  });

  it('clamps a click outside the image bounding box to [0, 1]', () => {
    const { onChange } = renderField({ url: 'https://example.com/a.jpg', focalX: 0.5, focalY: 0.5 });

    const img = screen.getByRole('img');
    mockRect(img, { top: 0, left: 0, width: 100, height: 100 });

    fireEvent.click(img, { clientX: -50, clientY: 500 });

    expect(onChange).toHaveBeenCalledWith({ url: 'https://example.com/a.jpg', focalX: 0, focalY: 1 });
  });

  it('a click against a zero-sized (unloaded/broken) image is a no-op', () => {
    const { onChange } = renderField({ url: 'https://example.com/a.jpg', focalX: 0.5, focalY: 0.5 });

    const img = screen.getByRole('img');
    mockRect(img, { width: 0, height: 0 });

    fireEvent.click(img, { clientX: 10, clientY: 10 });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('positions the focal marker via left/top percentages matching the current focal point', () => {
    renderField({ url: 'https://example.com/a.jpg', focalX: 0.3, focalY: 0.7 } satisfies ImageFieldValue);

    const marker = document.querySelector('.image-field-focal-marker') as HTMLElement;
    expect(marker.style.left).toBe('30%');
    expect(marker.style.top).toBe('70%');
  });

  it('Choose Image opens the media picker modal', async () => {
    installFakeMediaApi();
    renderField(undefined);

    fireEvent.click(screen.getByRole('button', { name: 'Choose Image' }));

    expect(screen.getByRole('dialog', { name: 'Choose an image' })).toBeDefined();
    await waitFor(() => expect(screen.getByText('chosen.jpg')).toBeDefined());
  });

  it('selecting an image from the picker sets the url and preserves the existing focal point', async () => {
    installFakeMediaApi();
    const { onChange } = renderField({ url: 'https://example.com/a.jpg', focalX: 0.2, focalY: 0.8 });

    fireEvent.click(screen.getByRole('button', { name: 'Choose Image' }));
    await waitFor(() => expect(screen.getByText('chosen.jpg')).toBeDefined());
    fireEvent.click(screen.getByAltText('chosen.jpg'));
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));

    expect(onChange).toHaveBeenCalledWith({
      url: 'http://site.example/media/chosen.jpg',
      focalX: 0.2,
      focalY: 0.8,
    });
    expect(screen.queryByRole('dialog', { name: 'Choose an image' })).toBeNull();
  });

  it('closing the picker without selecting leaves the existing value untouched', async () => {
    installFakeMediaApi();
    const { onChange } = renderField({ url: 'https://example.com/a.jpg', focalX: 0.2, focalY: 0.8 });

    fireEvent.click(screen.getByRole('button', { name: 'Choose Image' }));
    await waitFor(() => expect(screen.getByText('chosen.jpg')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog', { name: 'Choose an image' })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Poster') as HTMLInputElement).value).toBe('https://example.com/a.jpg');
  });
});
