# src

This folder contains runtime JavaScript used by the browser UI.

Notes:
- Static assets like `service-worker.js`, `manifest.webmanifest`, and `app-version.js` live in `public/` for Vite.
- `auto-backup.js` lives here and is imported by `src/main.js`; it still attaches `window.AutoBackup`.
- When adjusting paths, update `index.html` and `public/service-worker.js` accordingly.
