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
