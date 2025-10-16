# punchbuggy

no punchbacks

## Backup & Versioning quick reference

- **Backups** use an IndexedDB-based automatic system that rotates three versions (current, previous, oldest). Changes are debounced, deduplicated via a SHA-256 hash, and stored inside the browser so they survive updates, cache clears, and offline use. Manual download and restore controls live in the Data & Log modal.
- **Metadata** (timestamps, hash, counts) is persisted in IndexedDB with a localStorage cache so status details render instantly even before the database is opened.
- **Versioning** is centralized in `app-version.js`. The manifest, UI, and service worker all read the same value so releasing a new build is as simple as bumping that single version string and redeploying.
- **Updates** are handled by the service worker. When a new version is available the app shows a banner prompting the user to refresh; after 30 seconds it reloads automatically if the banner is still visible.

Release checklist:
1. Update `app-version.js` and `manifest.webmanifest` with the new version number.
2. Deploy static assets.
3. Open the app to confirm the update banner appears and the backup status still reports correctly.
