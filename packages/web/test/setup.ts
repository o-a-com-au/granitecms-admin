import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// @testing-library/react's automatic afterEach cleanup only
// self-registers when it detects a *global* afterEach - this project
// deliberately does not set vitest's `globals: true` (imports stay
// explicit everywhere else), so without this, DOM from one test leaks
// into the next within the same file.
afterEach(() => {
  cleanup();
});

// jsdom implements no scroll/layout behaviour at all - unlike a real
// browser, Element.prototype.scrollIntoView doesn't exist there, not
// even as a no-op, so any code that calls it (PageEditorPage's
// hover-to-scroll preview highlight) throws in every test that
// triggers it, not just ones asserting on scrolling. lib.dom.d.ts
// declares the property as always present, so a runtime existence
// check would narrow to `never` under strict mode - ??= sidesteps
// that since it's a value check, not a type-narrowing one.
Element.prototype.scrollIntoView ??= () => {};
