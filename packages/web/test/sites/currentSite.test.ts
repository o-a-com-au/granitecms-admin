import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeStorage } from '../helpers/fakeStorage.ts';
import {
  defaultEditorHref,
  readLastEditorLocation,
  readLastSiteId,
  resolveEditorHref,
  writeLastEditorLocation,
  writeLastSiteId,
} from '../../src/sites/currentSite.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('currentSite', () => {
  it('readLastSiteId/writeLastSiteId round-trip', () => {
    vi.stubGlobal('localStorage', createFakeStorage());

    expect(readLastSiteId()).toBeNull();
    writeLastSiteId('site-1');
    expect(readLastSiteId()).toBe('site-1');
    writeLastSiteId('site-2');
    expect(readLastSiteId()).toBe('site-2');
  });

  it('readLastEditorLocation/writeLastEditorLocation round-trip, keyed per site', () => {
    vi.stubGlobal('localStorage', createFakeStorage());

    expect(readLastEditorLocation('site-1')).toBeNull();
    writeLastEditorLocation('site-1', '/sites/site-1/editor?path=pages%2Fabout.json&url=%2Fabout');
    writeLastEditorLocation('site-2', '/sites/site-2/editor?path=pages%2Fcontact.json&url=%2Fcontact');

    expect(readLastEditorLocation('site-1')).toBe('/sites/site-1/editor?path=pages%2Fabout.json&url=%2Fabout');
    expect(readLastEditorLocation('site-2')).toBe('/sites/site-2/editor?path=pages%2Fcontact.json&url=%2Fcontact');
  });

  it('malformed pre-existing JSON at the key degrades to null, never throws', () => {
    const storage = createFakeStorage();
    storage.setItem('cms-admin-last-editor-location', 'not json');
    vi.stubGlobal('localStorage', storage);

    expect(readLastEditorLocation('site-1')).toBeNull();
  });

  it('with no storage stubbed at all, every read is null and every write is a silent no-op', () => {
    expect(readLastSiteId()).toBeNull();
    expect(readLastEditorLocation('site-1')).toBeNull();
    expect(() => writeLastSiteId('site-1')).not.toThrow();
    expect(() => writeLastEditorLocation('site-1', '/anything')).not.toThrow();
    expect(readLastSiteId()).toBeNull();
  });

  it('defaultEditorHref builds the CMS\'s own homepage address', () => {
    expect(defaultEditorHref('abc')).toBe('/sites/abc/editor?path=pages%2Findex.json&url=%2F');
  });

  it('resolveEditorHref falls back to defaultEditorHref when nothing is remembered', () => {
    vi.stubGlobal('localStorage', createFakeStorage());

    expect(resolveEditorHref('abc')).toBe(defaultEditorHref('abc'));

    writeLastEditorLocation('abc', '/sites/abc/editor?path=pages%2Fabout.json&url=%2Fabout');
    expect(resolveEditorHref('abc')).toBe('/sites/abc/editor?path=pages%2Fabout.json&url=%2Fabout');
  });
});
