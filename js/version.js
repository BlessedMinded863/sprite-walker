// Single source of truth for the app version shown in the UI, in export
// filenames, and in status messages. Change it here only -- everything
// else (index.html title/badge, app-core.js, fi25d-engine.js) reads from
// this constant instead of a hardcoded string, specifically so the UI,
// exports, and package.json can't drift out of sync with each other again.
export const FI_APP_VERSION = 'V29';
