import { describe, expect, it } from 'vitest';
import { backfillPageName, derivePageLabel } from '../../src/pages/derivePageLabel.ts';

describe('derivePageLabel', () => {
  it('prefers "name" when present', () => {
    const content = JSON.stringify({ name: 'Home Page', title: 'Welcome to Granite' });
    expect(derivePageLabel(content, 'pages/index.json')).toBe('Home Page');
  });

  it('falls back to "title" when "name" is absent', () => {
    const content = JSON.stringify({ title: 'About Us' });
    expect(derivePageLabel(content, 'pages/about.json')).toBe('About Us');
  });

  it('falls back to "title" when "name" is present but blank', () => {
    const content = JSON.stringify({ name: '   ', title: 'About Us' });
    expect(derivePageLabel(content, 'pages/about.json')).toBe('About Us');
  });

  it('falls back to the raw path when neither "name" nor "title" is present', () => {
    const content = JSON.stringify({ sections: [] });
    expect(derivePageLabel(content, 'pages/about.json')).toBe('pages/about.json');
  });

  it('falls back to the raw path when the content is not valid JSON', () => {
    expect(derivePageLabel('not json', 'pages/about.json')).toBe('pages/about.json');
  });

  it('falls back to the raw path when the content is a JSON array, not an object', () => {
    expect(derivePageLabel('[]', 'pages/about.json')).toBe('pages/about.json');
  });
});

describe('backfillPageName', () => {
  it('backfills "name" from "title" when "name" is entirely absent', () => {
    const content = JSON.stringify({ title: 'About Us' });
    expect(backfillPageName(content)).toBe(JSON.stringify({ title: 'About Us', name: 'About Us' }, null, 2));
  });

  it('leaves content unchanged when "name" is already present, even if blank', () => {
    const content = JSON.stringify({ title: 'About Us', name: '' });
    expect(backfillPageName(content)).toBe(content);
  });

  it('leaves content unchanged when there is no "title" to backfill from', () => {
    const content = JSON.stringify({ sections: [] });
    expect(backfillPageName(content)).toBe(content);
  });

  it('leaves content unchanged when "title" is blank', () => {
    const content = JSON.stringify({ title: '   ' });
    expect(backfillPageName(content)).toBe(content);
  });

  it('leaves invalid JSON unchanged', () => {
    expect(backfillPageName('not json')).toBe('not json');
  });

  it('leaves a JSON array unchanged', () => {
    expect(backfillPageName('[]')).toBe('[]');
  });
});
