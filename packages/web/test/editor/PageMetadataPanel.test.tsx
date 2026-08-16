import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { PageMetadataPanel, type PageMetadataPanelProps } from '../../src/editor/PageMetadataPanel.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type RenderPanelProps = Pick<PageMetadataPanelProps, 'content' | 'setContent'> &
  Partial<Omit<PageMetadataPanelProps, 'content' | 'setContent'>>;

function renderPanel(props: RenderPanelProps) {
  const {
    siteId = 'site-1',
    path = 'pages/about.json',
    previewUrl = '/about',
    renameDisabled = false,
    onRenamed = vi.fn(),
    ...rest
  } = props;
  return render(
    <MemoryRouter>
      <PageMetadataPanel
        {...rest}
        siteId={siteId}
        path={path}
        previewUrl={previewUrl}
        renameDisabled={renameDisabled}
        onRenamed={onRenamed}
      />
    </MemoryRouter>,
  );
}

describe('PageMetadataPanel', () => {
  it('Page title and Status are seeded from the real content, the remaining fields are empty placeholders', () => {
    renderPanel({ content: '{"title":"About us","published":true}', setContent: vi.fn() });

    expect((screen.getByLabelText('Page title') as HTMLInputElement).value).toBe('About us');
    expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('published');
    for (const label of ['Page meta description', 'Author', 'Publish date']) {
      const field = screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement;
      expect(field.value).toBe('');
    }
  });

  it('Status defaults to Draft when published is absent or false', () => {
    renderPanel({ content: '{"title":"Hi"}', setContent: vi.fn() });

    expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('draft');
  });

  it('I6: editing Page title re-serialises the whole page and calls setContent - the same save path as everything else', () => {
    const setContent = vi.fn();
    renderPanel({ content: JSON.stringify({ title: 'Old', layout: 'default' }), setContent });

    fireEvent.change(screen.getByLabelText('Page title'), { target: { value: 'New title' } });

    expect(setContent).toHaveBeenCalledTimes(1);
    const updated = JSON.parse(setContent.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(updated.title).toBe('New title');
    expect(updated.layout).toBe('default');
  });

  it('changing Status to Published re-serialises the whole page and calls setContent - the same field the Sections tab checkbox used to edit', () => {
    const setContent = vi.fn();
    renderPanel({
      content: JSON.stringify({ title: 'Hi', published: false, layout: 'default' }),
      setContent,
    });

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'published' } });

    expect(setContent).toHaveBeenCalledTimes(1);
    const updated = JSON.parse(setContent.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(updated.published).toBe(true);
    expect(updated.layout).toBe('default');
  });

  it('the remaining placeholder fields (meta description, author, publish date) are still locally interactive but not wired to real content', () => {
    renderPanel({ content: '{"title":"Hi"}', setContent: vi.fn() });

    fireEvent.change(screen.getByLabelText('Author'), { target: { value: 'Ada Lovelace' } });

    expect((screen.getByLabelText('Author') as HTMLInputElement).value).toBe('Ada Lovelace');
  });

  it('Page title and Status are disabled when the current content is not a plain JSON object (e.g. mid-edit invalid JSON)', () => {
    renderPanel({ content: 'not valid json', setContent: vi.fn() });

    expect((screen.getByLabelText('Page title') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Status') as HTMLSelectElement).disabled).toBe(true);
  });

  it('Name is seeded from the real content, editable via the same save path as Page title', () => {
    const setContent = vi.fn();
    renderPanel({ content: JSON.stringify({ name: 'Home Page', title: 'Welcome', layout: 'default' }), setContent });

    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Home Page');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Name' } });

    expect(setContent).toHaveBeenCalledTimes(1);
    const updated = JSON.parse(setContent.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(updated.name).toBe('New Name');
    expect(updated.title).toBe('Welcome');
  });

  it('Slug starts at the current path\'s own stem, not derived from Name', () => {
    renderPanel({
      content: JSON.stringify({ name: 'Home Page', title: 'Welcome' }),
      setContent: vi.fn(),
      path: 'pages/about/team.json',
    });

    expect((screen.getByLabelText('Slug') as HTMLInputElement).value).toBe('team');
  });

  it('Slug live-follows a slugified Name until the user edits the slug field directly', () => {
    const setContent = vi.fn((next: string) => {
      // Mirrors what PageEditorPage really does: setContent flows back
      // in as the next content prop. Simulated here by re-rendering
      // with the updated content, since this test renders standalone.
      rerender(
        <MemoryRouter>
          <PageMetadataPanel
            content={next}
            setContent={setContent}
            siteId="site-1"
            path="pages/about.json"
            previewUrl="/about"
            renameDisabled={false}
            onRenamed={vi.fn()}
          />
        </MemoryRouter>,
      );
    });
    const { rerender } = renderPanel({ content: JSON.stringify({ name: '', title: '' }), setContent });

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Contact Us!' } });
    expect((screen.getByLabelText('Slug') as HTMLInputElement).value).toBe('contact-us');

    // Once the slug itself has been hand-edited, further Name changes
    // no longer override it.
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'custom-slug' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Something Else Entirely' } });
    expect((screen.getByLabelText('Slug') as HTMLInputElement).value).toBe('custom-slug');
  });

  it('the Update slug button is disabled until the slug actually differs from the current path', () => {
    renderPanel({ content: JSON.stringify({ name: 'About', title: 'About' }), setContent: vi.fn() });

    expect(screen.getByRole('button', { name: 'Update slug' })).toHaveProperty('disabled', true);

    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'about-us' } });

    expect(screen.getByRole('button', { name: 'Update slug' })).toHaveProperty('disabled', false);
  });

  it('renameDisabled disables the Slug field and Update slug button, with an explanation', () => {
    renderPanel({ content: JSON.stringify({ name: 'About', title: 'About' }), setContent: vi.fn(), renameDisabled: true });

    expect((screen.getByLabelText('Slug') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Update slug' })).toHaveProperty('disabled', true);
    expect(screen.getByText('Save or discard your changes before changing the URL.')).toBeDefined();
  });

  it('clicking Update slug calls the move API with the new URL and reports success via onRenamed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const onRenamed = vi.fn();
    renderPanel({
      content: JSON.stringify({ name: 'About', title: 'About' }),
      setContent: vi.fn(),
      path: 'pages/about.json',
      previewUrl: '/about',
      onRenamed,
    });

    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'about-us' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update slug' }));

    await vi.waitFor(() => expect(onRenamed).toHaveBeenCalledWith('pages/about-us.json', '/about-us'));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/sites/site-1/move',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ from: '/about', to: '/about-us', message: 'Change URL from /about to /about-us' }),
      }),
    );
  });

  it('a failed Update slug (e.g. a page already exists at the new slug) shows an inline error, without calling onRenamed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ statusCode: 409, error: 'Conflict', message: 'A page already exists at that path' }), {
          status: 409,
        }),
      ),
    );
    const onRenamed = vi.fn();
    renderPanel({ content: JSON.stringify({ name: 'About', title: 'About' }), setContent: vi.fn(), onRenamed });

    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'contact' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update slug' }));

    // reasonFromResponse (site-editor.ts) prefers the response's own
    // specific "message" over the generic "error" status phrase - the
    // same priority every error path in this app now shows.
    await screen.findByText('A page already exists at that path');
    expect(onRenamed).not.toHaveBeenCalled();
  });
});
