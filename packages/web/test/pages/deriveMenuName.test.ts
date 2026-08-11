import { describe, expect, it } from 'vitest';
import { deriveMenuName, isMenuPath } from '../../src/pages/deriveMenuName.ts';

describe('isMenuPath', () => {
  it('is true for anything under menus/', () => {
    expect(isMenuPath('menus/main.json')).toBe(true);
    expect(isMenuPath('menus/footer-resources.json')).toBe(true);
  });

  it('is false for pages and posts', () => {
    expect(isMenuPath('pages/about.json')).toBe(false);
    expect(isMenuPath('posts/hello-world.json')).toBe(false);
  });
});

describe('deriveMenuName', () => {
  it('title-cases a plain single-word filename', () => {
    expect(deriveMenuName('menus/main.json')).toBe('Main');
  });

  it('splits a camelCase filename into separate title-cased words', () => {
    expect(deriveMenuName('menus/footerCompany.json')).toBe('Footer Company');
  });

  it('splits a kebab-case filename', () => {
    expect(deriveMenuName('menus/footer-resources.json')).toBe('Footer Resources');
  });

  it('splits a snake_case filename', () => {
    expect(deriveMenuName('menus/footer_product.json')).toBe('Footer Product');
  });

  it('handles a path with no menus/ prefix the same way', () => {
    expect(deriveMenuName('footerCompany.json')).toBe('Footer Company');
  });
});
