# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0] - 2025-10-21
- Breaking: Data schema normalization and explicit schemaVersion field (migrated on first run).
- Migration: In-app migration runs automatically on first load and creates a timestamped localStorage backup key `punchBuggy_backup_<ts>`.
- Service worker update flow: no change — update banner will prompt users; auto-apply after 30s remains.
- UI: Minor notices added to Data → Log when migration runs.

### Migration notes
- The app will attempt an automatic, non-destructive migration of local state. A backup copy of the raw JSON is stored in localStorage under `punchBuggy_backup_<timestamp>` and a pointer in `punchBuggy_last_backup`.
- If you prefer a manual rollback: open DevTools → Application → Local Storage, find the backup key and restore by copying its value back to the `punchBuggy` key, or use the Import feature with the exported JSON.
