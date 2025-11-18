# src

This folder contains runtime JavaScript used by the browser UI.

Notes:
- Keep `service-worker.js` at project root so its scope remains the entire site (`/`).
- `app-version.js` and `auto-backup.js` live here now; `service-worker.js` imports `src/app-version.js` at runtime.
- When adjusting paths, update `index.html` and `service-worker.js` accordingly.
