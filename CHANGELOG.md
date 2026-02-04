# Changelog

All notable changes to this project will be documented in this file.

## [3.4.1] - 2026-02-04
- Fix PWA layout to prevent extra scroll on small screens

## [3.4.0] - 2026-02-03

- Minor version bump: rebuild assets and speed up splash preload

## [3.3.1] - 2026-02-02

- Fix splash screen loading with optimized JPG, title preload, and brightness fade animation

## [3.3.0] - 2026-02-02

- UI polish: taller avatars, score/streak layout, button/header tweaks

## [3.0.0] - 2026-02-02

- Major UI refresh: new player layout, leaderboard presentation, and streamlined modals.
- Remove auto backups + migration workflow and related UI text.
- Silent service worker updates with versioned cache busting (no update banner).

## [2.2.0] - 2025-10-27

- Fix import to accept backup wrapper files (restore from AutoBackup downloads).
- Sync UI version tag with active build after updates.
- Clear Data now purges localStorage + IndexedDB backups, plus names and avatars.

## [2.1.3] - 2025-10-21

- Fix: version tag now shows running version (not newly-fetched) until user clicks Refresh to apply update.
- Dev: added console logging on page load showing version details (runningVersion, fetchedVersion, autoApplyEnabled).

## [2.1.2] - 2025-10-21

- Patch: make service worker update auto-apply opt-in by default; add `DEBUG_showUpdateBanner` helper for manual testing.
- Build: Incremented manifest and runtime versions to publish the banner fix.

## [2.1.0] - 2025-10-21

- Minor: improved import handling — supports nested `rounds` exports and legacy player shapes; added normalization for `players.*.current` and `rounds.history` mappings.
- UI: small refinements to Data → Import messaging.

## [2.0.3] - 2025-10-21

- UI: Moved the update banner to the top of the screen and aligned it with the mobile layout.
- UX: Added dynamic safe-area spacing so the banner never hides page content on small displays.

## [2.0.2] - 2025-10-21

- UI: Replaced the avatar upload emoji with an inline SVG icon for consistent sizing and centering.
- Accessibility: Added labels to the avatar upload controls so screen readers announce their purpose.
- Build: Bumped manifest and runtime version constants to trigger the service worker update flow.

## [2.0.1] - 2025-10-21

- Patch: small bug fixes and polish after v2.0.0 migration rollout.
- Fixes: minor UI text tweaks, improved migration logging in Data + Log, and safer object merging when restoring backups.

## [2.0.0] - 2025-10-21

- Breaking: Data schema normalization and explicit schemaVersion field (migrated on first run).
- Migration: In-app migration runs automatically on first load and creates a timestamped localStorage backup key `punchBuggy_backup_<ts>`.
- Service worker update flow: no change -- update banner will prompt users; auto-apply after 30s remains.
- UI: Minor notices added to Data + Log when migration runs.

### Migration notes

- The app will attempt an automatic, non-destructive migration of local state. A backup copy of the raw JSON is stored in localStorage under `punchBuggy_backup_<timestamp>` and a pointer in `punchBuggy_last_backup`.
- If you prefer a manual rollback: open DevTools + Application + Local Storage, find the backup key and restore by copying its value back to the `punchBuggy` key, or use the Import feature with the exported JSON.
