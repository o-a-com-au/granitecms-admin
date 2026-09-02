import packageJson from '../../package.json';

// package.json's own "version" is the real source of truth for the
// version shown next to the logo (AppShell.tsx's topbar, and
// SettingsLayout.tsx's own standalone header) - pre-1.0 while still
// under active development, bumped by hand (minor for a batch of new
// capability, patch for a small fix), reserving 1.0.0 for an actual
// public launch.
export const APP_VERSION: string = packageJson.version;
