// Single source of truth for the app version shown in the UI, in export
// filenames, and in status messages. Change it here only -- everything
// else (index.html title/badge, app-core.js, fi25d-engine.js) reads from
// this constant instead of a hardcoded string, specifically so the UI,
// exports, and package.json can't drift out of sync with each other again.
//
// V29.3 also loads the character-agnostic Reference Camera as a side-effect
// module. It injects its own controls after the main UI is ready, so Kaelor's
// side-project workflow can use it without coupling the core engine to Kaelor.
import './reference-camera.js';

export const FI_APP_VERSION = 'V29.3';
