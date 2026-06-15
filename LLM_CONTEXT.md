# LLM Project Context — PunchBuggy

## 1) Project Snapshot
- Project name: PunchBuggy
- One-line description: Mobile-first PWA scorekeeper for the "Punch Buggy" car game (spot VW Beetles, tally points).
- Current status: `active`
- Primary owner: BenWassa
- Last updated (YYYY-MM-DD): 2026-06-15

## 2) Purpose and Scope
- Problem this project solves: Keeps score during road-trip Punch Buggy games without needing paper or a shared device.
- Target users: Two players on a road trip using their own or a shared mobile phone.
- Core outcomes / success criteria: Scores persist between browser sessions; rounds are recorded with full history; the app works offline.
- In scope: Two-player scoring, round management, leaderboard, import/export of game state, PWA offline support.
- Out of scope: Multiplayer networking, server-side persistence, more than 2 players.

## 3) Links (Use Full URLs)
- Production app: https://benwassa.github.io/punchbuggy/
- Repository: https://github.com/BenWassa/punchbuggy
- Main branch: https://github.com/BenWassa/punchbuggy/tree/main

## 4) Tech Stack
### Frontend
- Framework: None — vanilla JavaScript ES modules
- Language: JavaScript (no TypeScript)
- Styling: Plain CSS with custom design-system variables (`src/styles/app.css`)
- State management: Single in-memory `state` object; persisted via `localStorage` key `punchBuggy`

### Backend
- Runtime/framework: None — fully client-side, static hosting only
- API style: N/A
- Auth: N/A

### Data
- Primary database: `localStorage` (key: `punchBuggy`)
- Caching: Service worker cache (`punchbuggy-cache-<version>`)
- File storage: Avatar images stored as base64 data URLs inside `state.players[A|B].avatar` in localStorage (max 1.5 MB per image enforced client-side)

### Tooling
- Package manager: npm
- Build tool: Vite 5 (output → `docs/` for GitHub Pages)
- Test frameworks: None
- Lint/format: ESLint 9 + Prettier 3
- CI/CD: Manual release script (`scripts/release.js`); deploys via GitHub Pages from `docs/`

## 5) Architecture Overview
- Single HTML file (`index.html`, ~2300 lines) contains all markup. `src/main.js` is the sole module entry.
- All app logic (state, scoring, undo/redo, leaderboard, import/export, SW updates) lives in `src/main.js`.
- Service worker (`public/service-worker.js`) provides offline support with versioned cache-key busting.
- Schema migration runs on startup via `archive/migrations/migrate-to-v2.js` (imported as ES module).
- Key folders and purpose:
  - `src/`: Application source (JS + CSS)
  - `public/`: Static assets served as-is (service worker, manifest, version file, icons)
  - `docs/`: Vite build output — deployed to GitHub Pages
  - `scripts/`: Release automation (bump-version.js, release.js, check-versions.js)
  - `archive/migrations/`: Schema migration helpers (legacy data normalisation)
- Entry points:
  - App entry: `index.html` → `<script type="module" src="./src/main.js">`
  - Service Worker entry: `public/service-worker.js` (registered from main.js on non-localhost)

## 6) Local Development
- Prerequisites: Node.js ≥ 18, npm
- Install: `npm install`
- Run: `npm run dev` (Vite dev server at http://localhost:5173/punchbuggy/ — SW is skipped on localhost)
- Build: `npm run build` (output to `docs/`)
- Lint: `npm run lint`
- Format: `npm run format`
- Bump version: `npm run bump <x.y.z> [release notes]`
- Full release: `npm run release <x.y.z> [notes]` (lint → bump → format:check → build)

## 7) Environment and Secrets
- No environment variables required.
- No secrets. Fully client-side with no API keys.

## 8) External Dependencies
- No third-party APIs or runtime dependencies.
- Dev-only: ESLint, Prettier, Vite, globals (ESLint plugin).

## 9) Data Contracts

### localStorage schema (`punchBuggy`, schemaVersion `2.0.0`)
```json
{
  "schemaVersion": "2.0.0",
  "round": 1,
  "players": {
    "A": { "name": "Player A", "score": 0, "streak": 0, "avatar": "" },
    "B": { "name": "Player B", "score": 0, "streak": 0, "avatar": "" }
  },
  "roundWinners": [
    { "winner": "A" | "B" | "T", "scoreA": 0, "scoreB": 0 }
  ],
  "history": ["Player A spotted a bug! +1", "..."]
}
```
- `undoStack` is runtime-only (never persisted to localStorage, never exported).
- Avatar images: base64 data URL, max 1.5 MB per upload enforced at read time.
- `winner` field is always normalised to `'A'`, `'B'`, or `'T'` — arbitrary strings are coerced to `'T'`.

### Migration
- `archive/migrations/migrate-to-v2.js` runs on every page load before `load()`.
- If `schemaVersion` is missing it normalises the shape and writes `schemaVersion: '2.0.0'` back.
- `load()` itself also validates and sanitises all nested fields defensively.

### Import/export
- Export: JSON file without `undoStack`. Supports current shape and older wrapped `{ app, data }` shapes.
- Import: `normalizeImportedState()` accepts both flat and nested player objects and both `roundWinners` and `rounds.history` shapes.

## 10) Product and UX Notes
- Main user flows:
  1. Open app → names/avatars set → tap score buttons during drive → press Next Round → view leaderboard.
  2. Export game → share JSON file → other device imports to continue.
- Critical screens/components: Player cards (score, streak badge, avatar, crown), Next Round button, Leaderboard modal/view, Update banner.
- Accessibility: `inert` + `aria-hidden` on the slide-out menu; focus is returned to the menu button on close.
- Performance: Scores are the hot path; each tap triggers one render + one localStorage write.
- Update banner: shown when a new service worker is waiting. User clicks Refresh → `SKIP_WAITING` message sent to SW → page reloads automatically via `controllerchange` event.

## 11) Quality and Testing
- Test strategy: No automated tests. Verify manually with `npm run dev`.
- Current coverage gaps: No unit tests for state logic, migration, or normalisation helpers.
- High-risk areas:
  - `load()` / `sanitizeLoadedState()`: corruption of localStorage data.
  - `normalizeImportedState()`: malformed import files.
  - Service worker caching: version mismatch leaves users on stale assets.
  - Avatar storage: large images can exhaust localStorage quota.
- How to verify a change manually:
  1. `npm run dev` → open http://localhost:5173/punchbuggy/
  2. Score points, change names, next round, open leaderboard, export/import JSON.
  3. `npm run build` → check `docs/` output size is reasonable.
  4. `npm run lint` → should pass with zero warnings.

## 12) Current Priorities
- Active tasks: None (v3.4.2 is stable)
- Known bugs: None after backend quality review (June 2026)
- Blockers: None

## 13) Constraints for the LLM
- Do not change: The `docs/` directory is build output — never edit it by hand.
- Do not change: `public/app-version.js` version string — use `npm run bump <x.y.z>` instead.
- Preferred patterns/conventions:
  - Vanilla JS only — no frameworks, no TypeScript.
  - Use `getEl()` / `setText()` / `setDisplay()` helpers instead of raw `querySelector`.
  - All localStorage access goes through `safeStorageGet` / `safeStorageSet` / `safeStorageRemove`.
  - `log(msg)` appends to `state.history`; callers must call `render()` themselves — `log()` does NOT render.
  - `render()` is the single source of truth for DOM → it calls `save()` internally.
  - `undoStack` is never persisted or exported.
  - HTML content from player names must be escaped via `escapeHtml()` before any `innerHTML` insertion.
- Code style rules: Prettier defaults (2-space indent, single quotes). ESLint enforces no-unused-vars and browser globals.
- Definition of done for PRs: `npm run lint` passes, `npm run build` succeeds, manual smoke test in browser.

## 14) Suggested Prompt for Another LLM
```text
You are helping maintain PunchBuggy — a vanilla-JS PWA scorekeeper with no framework and no backend.
All logic is in src/main.js. State is persisted in localStorage. The service worker handles offline
caching with versioned keys. Read LLM_CONTEXT.md in full before making any changes.

Key rules:
- Escape all user-supplied content before innerHTML insertion (use escapeHtml()).
- log(msg) does not call render(); the calling function must.
- undoStack is runtime-only; never persist or export it.
- All localStorage access goes through the safeStorage* helpers.
- Run `npm run lint` and `npm run build` to verify your changes before committing.

Task:
[Describe the specific task]
```

## 15) Portfolio Metadata
- Public tagline: Offline-first PWA scorekeeper for road-trip Punch Buggy games.
- Demo-ready features: Score tracking, round history, leaderboard with win %, export/import JSON.
- Production URL: https://benwassa.github.io/punchbuggy/
