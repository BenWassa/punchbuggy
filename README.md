# punchbuggy

no punchbacks

## Backup & Versioning quick reference

- **Backups** use the File System Access API to write rotating JSON snapshots to a user-selected folder. Connect a folder from the Data & Log modal, then the app automatically debounces saves, skips identical payloads via hash comparison, and prunes daily snapshots beyond the configured limit.
- **Metadata** (last backup time, hash) is stored in IndexedDB plus localStorage so status persists even if permission to the folder is revoked.
- **Versioning** is centralized in `app-version.js`. The manifest, UI, and service worker all read the same value so releasing a new build is as simple as bumping that single version string and redeploying.
- **Updates** are handled by the service worker. When a new version is available the app shows a banner prompting the user to refresh; after 30 seconds it reloads automatically if the banner is still visible.

Release checklist:
1. Update `app-version.js` and `manifest.webmanifest` with the new version number.
2. Deploy static assets.
3. Open the app to confirm the update banner appears and the backup status still reports correctly.
