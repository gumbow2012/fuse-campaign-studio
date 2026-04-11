This folder preserves the pre-MVP app entrypoint that was mounted before the April 10, 2026 cutover.

Files:
- `legacy-app-router-2026-04-10.txt`: previous `src/App.tsx` route map before the stripped-down MVP shell replaced the public surface.

Notes:
- Legacy public/admin pages still exist under `src/pages` and related components.
- The MVP cutover only changes the mounted router and adds a new shell under `src/pages/mvp` and `src/components/mvp`.
