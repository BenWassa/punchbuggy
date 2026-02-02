# src

This folder contains runtime JavaScript used by the browser UI.

Notes:

- Keep `service-worker.js` in `public/` so it is copied to the site root during builds.
- `app-version.js` lives in `public/` and is imported by the service worker.
- When adjusting paths, update `index.html` and `public/service-worker.js` accordingly.
