import { describe, expect, it } from 'vitest';
import { menuDisplayName, menuHandleFromPath, menuPathFromHandle, deriveMenuName, isMenuPath } from '../../src/pages/deriveMenuName.ts';

describe('isMenuPath', () => {
  it('is true for anything under menus/', () => {
    expect(isMenuPath('menus/main.json')).toBe(true);
    expect(isMenuPath('menus/footer-resources.json')).toBe(true);
  });

  it('is false for pages', () => {
    expect(isMenuPath('pages/about.json')).toBe(false);
    expect(isMenuPath('pages/blog/hello-world.json')).toBe(false);
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

describe('menuDisplayName', () => {
  it('uses the menu\'s own name when set, otherwise the filename-derived one', () => {
    expect(menuDisplayName({ path: 'menus/footerCompany.json', name: 'Company' })).toBe('Company');
    expect(menuDisplayName({ path: 'menus/footerCompany.json', name: null })).toBe('Footer Company');
  });
});

describe('menu handles', () => {
  it('a handle is the filename without the menus/ folder or .json, and maps back', () => {
    expect(menuHandleFromPath('menus/footerCompany.json')).toBe('footerCompany');
    expect(menuPathFromHandle('footer-company')).toBe('menus/footer-company.json');
  });
});
