# Update Banner Auto-Refresh Investigation

## Summary

On mobile, users report that the app still refreshes into the latest build without ever showing the “update available” banner. The laptop view surfaces the banner as expected. We recently moved the banner to the top of the screen and added logic to auto-measure its height; the refresh behaviour predates (and outlives) that styling change.

## Current behaviour

1. A new build is deployed (version string incremented).
2. The PWA detects the update and reloads itself after a short delay.
3. No banner or prompt is rendered before the reload occurs, so users cannot postpone or manually trigger the refresh.

The auto-backup status still reports correctly, so the service worker is active; the issue is limited to the update notification UX.

## Relevant code paths

- `index.html#L930-L1010` (`setupServiceWorkerUpdates`):
  - Shows the banner when `reg.waiting` is present or when a new worker reaches the `installed` state.
  - Adds a 30 s auto-refresh timer **after** calling `showBanner`.
  - Calls `window.location.reload()` on every `controllerchange`, regardless of whether the user requested the refresh.
- `public/service-worker.js#L14-L58`:
  - Uses `self.clients.claim()` on activate and reloads all shell assets into a versioned cache.
  - Only calls `skipWaiting()` when it receives a `SKIP_WAITING` postMessage.

## Hypotheses

1. **Controller change without user intent**  
   When the old worker releases control (e.g. the page was backgrounded or closed on mobile), the new worker activates immediately. Our `controllerchange` listener reloads the page unconditionally, so the banner never has a chance to render even though `showBanner` never ran.

2. **Banner render timing vs. reload timing**  
   On slower mobile devices the activation sequence may complete before `setupServiceWorkerUpdates()` attaches DOM event handlers, causing an early `controllerchange` and reload path before the banner elements are measured/displayed.

3. **Display conditions mismatch**  
   If `navigator.serviceWorker.controller` is falsy while the new worker reaches `installed`, we skip `showBanner` entirely. This can happen when the page is the first to load after an update (no prior controller), yet the subsequent `controllerchange` still forces a reload.

## Next steps

- Gate the `controllerchange` reload behind an explicit “refresh in progress” flag set when we trigger `requestRefresh()` (either user click or 30 s timer). This would prevent automatic reloads when the update is detected quietly.
- Capture debug telemetry in dev tools:
  - Log when `showBanner()` runs and when `controllerchange` fires.
  - Inspect `registration.waiting` and the new worker state when the issue reproduces.
- Consider persisting a `localStorage` flag when the banner is shown so we can diagnose whether the UI path ran on the affected devices.

Until the root cause is fixed, updates will continue to auto-apply on mobile with no dismissible prompt.
