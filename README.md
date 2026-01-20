# Punch Buggy (mobile scorekeeper)

No punchbacks.

## Features that matter

- **Mobile-first UI** with a persistent, top-mounted update banner that respects safe-area insets, so new builds are obvious even on notch devices.
- **Player avatars** support inline uploads with a consistent SVG camera icon and accessible labels (screen readers announce “Change Player X avatar”).
- **Auto backups** rotate through current/previous/oldest snapshots in IndexedDB and surface status instantly via a cached metadata read.
- **Migration safety net**: first-run schema upgrades create a named backup key and log migration results in the Data & Log modal.

## Versioning & release flow

All runtime consumers read a single source of truth from `app-version.js` (now located in `public/app-version.js`), which the service worker also imports. The PWA manifest mirrors that value so app stores detect the release.

1. Bump the version string in `app-version.js`.
2. Mirror that version in `public/manifest.webmanifest` and add a changelog entry.
3. `git commit -m "chore: release x.y.z"` and push to `main`.
4. Deploy the static bundle and open the app once to confirm the update banner appears.
5. After 30 seconds the banner auto-refreshes unless dismissed; verify backups still report OK in the Data & Log modal.

## Dev tips

- `scripts/check-versions.js` sanity-checks that the manifest, changelog, and runtime version stay in sync.
- `npm install` then `npm run dev` starts Vite; `npm run build` outputs `dist/` for deployment.
- The update banner offset is controlled via the CSS custom property `--update-banner-offset`; when tweaking layout, confirm it still gets set inside `setupServiceWorkerUpdates()` in `src/main.js`.
- Keep README and CHANGELOG synchronized with user-facing tweaks so release notes stay authoritative.
