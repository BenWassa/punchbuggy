# Punch Buggy (mobile scorekeeper)

No punchbacks.

## Features that matter

- **Mobile-first UI** with oversized scores, tall action buttons, and safe-area spacing for notch devices.
- **Player avatars** support inline uploads (max 1.5 MB) with a consistent SVG camera icon and accessible labels.
- **Leaderboard view** with head-to-head stats and round history details.
- **Service worker updates** with versioned cache busting; an update banner appears when a new version is ready and reloads the page automatically when confirmed.

## Versioning & release flow

All runtime consumers read a single source of truth from `public/app-version.js`, which the service worker imports. The PWA manifest mirrors that value so app stores detect the release.

1. Bump the version string in `public/app-version.js`.
2. Mirror that version in `manifest.webmanifest` and add a changelog entry.
3. `git commit -m "chore: release x.y.z"` and push to `main`.
4. Deploy the static bundle; updates apply silently on the next load.

## Dev tips

- `scripts/check-versions.js` sanity-checks that the manifest, changelog, and runtime version stay in sync.
- Keep README and CHANGELOG synchronized with user-facing tweaks so release notes stay authoritative.
