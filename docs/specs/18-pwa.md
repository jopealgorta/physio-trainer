# 18 · Installable physio app (PWA)

- **Status:** Done
- **Feature:** Core (platform)
- **Depends on:** 01, 17

## Summary

Makes the physio workspace an installable Progressive Web App: a web app manifest, generated
app icons, iOS home-screen metadata and a small service worker whose only job is to show a
branded, localized "You're offline" page instead of the browser's error page. Physios get an
app icon on their phone, tablet or desktop that opens straight into the dashboard.

## Goals

- `/manifest.webmanifest` describes the physio app (`start_url: /dashboard`, standalone).
- Icons (192, 512, maskable 512, Apple touch 180) are generated in code from the logo, not
  committed as binaries.
- iOS "Add to Home Screen" gets the right icon, title and standalone mode.
- A versioned service worker serves a localized offline page when a navigation fails.
- No page, API or Supabase response is ever cached: no stale or cross-user data.

## Non-goals

- Per-link patient manifest and installable patient page (spec 10 overrides `manifest` in the
  patient layout).
- Offline patient view or offline data (feature L, deferred).
- Push notifications (feature O, deferred).
- An in-app "Install app" button or iOS instructions dialog: browsers' native install UI only.
- Service worker in `pnpm dev` (HMR and a caching worker fight; production builds only).

## User stories

- As a physio, I want to install Physio Trainer on my phone's home screen so that it opens like
  an app, straight into my dashboard.
- As a physio on a flaky clinic connection, I want a clear "You're offline" screen with a retry
  button instead of the browser's error page.

## Data model

No changes.

## Routes and UI

| Route                   | Kind            | Purpose                                                                |
| ----------------------- | --------------- | ---------------------------------------------------------------------- |
| `/manifest.webmanifest` | Metadata        | `src/app/manifest.ts`. Localized description and `lang`.               |
| `/icon/<id>`            | Metadata        | `src/app/icon.tsx`: `192`, `512`, `maskable` (512, safe-zone padding). |
| `/apple-icon`           | Metadata        | `src/app/apple-icon.tsx`: 180×180 Apple touch icon.                    |
| `/offline`              | Server page     | Public, localized offline screen: logo, title, hint, "Try again".      |
| `/sw.js`                | Static (public) | Service worker, registered as `/sw.js?v=<build id>`.                   |

**Icons:** lucide `Activity` glyph (the `Logo` mark) in `primary-foreground` on a `primary`
(`#171717`) background. `any` icons are a rounded square; the maskable icon is full-bleed with
the glyph inside the central 80 % safe zone.

**Offline page:** centred card like `not-found.tsx`: `Logo`, "You're offline", "Check your
connection and try again.", and a "Try again" button that reloads. Works at phone width, light
and dark.

**Registration:** `ServiceWorkerRegistration` (client component, renders nothing) in the
`(app)` layout. Only physios' browsers register the worker; patients never do.

New top-level routes `offline`, `icon`, `apple-icon` and `sw.js` are added to
`RESERVED_HANDLES`.

## Behaviour and rules

1. Manifest: `id: "/"`, `name` and `short_name` "Physio Trainer", `description` from
   `Metadata.description` in the request locale, `lang` = locale, `start_url: "/dashboard"`,
   `scope: "/"`, `display: "standalone"`, `background_color` and `theme_color` `#ffffff`, icons
   192/512 (`purpose: "any"`) and the maskable 512 (`purpose: "maskable"`).
2. Root metadata adds `appleWebApp: { capable: true, title: "Physio Trainer",
statusBarStyle: "default" }`.
3. Build id: `VERCEL_GIT_COMMIT_SHA`, else a timestamp taken when `next.config.ts` loads, exposed
   as `NEXT_PUBLIC_BUILD_ID` (declared in `@/env`).
4. Registration runs only when `NODE_ENV === "production"` and `serviceWorker` is supported:
   `navigator.serviceWorker.register("/sw.js?v=<build id>", { scope: "/" })`. A new build id is
   a new script URL, so every deploy installs a fresh worker. Registration errors are swallowed
   (the app works without it).
5. Service worker, cache name `physio-trainer-<v>`:
   1. `install`: fetch `/offline` (a non-OK or redirected response fails the install, so a
      redirect can never put a signed-in page in the cache), cache it, cache every
      `/_next/static/…` URL referenced in its HTML (CSS, JS, fonts), then `skipWaiting()`.
   2. `activate`: delete every other `physio-trainer-*` cache, enable navigation preload,
      `clients.claim()`.
   3. `fetch`, same-origin `GET` only:
      - `mode === "navigate"`: network (the preload response when there is one); if the network
        throws, respond with cached `/offline`.
        HTTP error responses pass through unchanged.
      - `/_next/static/…`: cache first, then network (hashed, immutable, public).
      - Anything else: not intercepted.
6. `/sw.js` is served with `Cache-Control: no-cache` so update checks always reach the server.
7. The proxy matcher skips `sw.js`, `icon` and `apple-icon` (no Supabase session refresh for
   them). `/offline` still goes through the proxy; it is not a protected path.
8. Kill switch: if a bad worker ships, remove `<ServiceWorkerRegistration>` from the `(app)`
   layout (it re-registers on every page load) and replace `public/sw.js` with one that calls
   `self.registration.unregister()` and deletes its caches.

## Security and privacy

- The worker caches only `/offline` (no user data: same HTML for everyone in a locale) and
  public hashed build assets. Pages, Server Actions, API routes and Supabase calls are never
  cached, so a shared device never shows one physio's data to another.
- Same-origin `GET` only; cross-origin requests (Supabase, YouTube) are never touched.
- Registration is limited to the signed-in physio layout.

## i18n

- New namespace `Offline`: `title`, `description`, `retry` (en + es, voseo).
- The manifest description reuses `Metadata.description`.
- The cached offline page is in the locale active when the worker installed; it refreshes on
  every deploy.

## Acceptance criteria

- [x] `/manifest.webmanifest` returns the fields in rule 1; every icon URL in it returns a PNG
      of the declared size.
- [x] Pages include `<link rel="manifest">` and `<link rel="apple-touch-icon">`.
- [x] Chrome reports the app installable (Lighthouse/DevTools "Installability" has no errors).
- [x] Signed-in physio, production build: the worker controls the page; going offline and
      navigating shows the localized offline page; back online, "Try again" loads the page.
- [x] No service worker is registered by `pnpm dev`.
- [x] Only `/offline` and `/_next/static/…` entries exist in the worker's cache.

## Test plan

- Unit:
  - `manifest()`: fields, icon URLs, sizes and purposes, localized description.
  - `ServiceWorkerRegistration`: registers `/sw.js?v=<id>` in production, does nothing in
    development or without `serviceWorker` support.
  - Offline page renders title, description and retry button; retry reloads.
  - `RESERVED_HANDLES` test covers the new top-level routes; message parity test covers
    `Offline`.
- Integration: none (no database change).
- E2E (`e2e/pwa.spec.ts`):
  - Manifest JSON and every icon (and the Apple icon) return `image/png`.
  - Signed-in physio: wait for the worker to control the page, go offline, navigate → offline
    page; cache keys are only `/offline` and `/_next/static/…`; online again → "Try again" loads
    the dashboard.

## Open questions

Resolved in brainstorming (2026-09-28):

1. Which surface? → The physio app only; the patient per-link manifest stays in spec 10.
2. How much offline? → A minimal worker with an offline fallback page; no data caching.
3. Icons? → Generated from the current logo with `next/og`.
4. Install UI? → None; browsers' native install flow.

## Decisions made during implementation

- Manifest data and the icon list live in `src/lib/pwa.ts` (`buildManifest`, `APP_ICONS`,
  `serviceWorkerUrl`) so they are unit-tested without mocking next-intl; `src/app/manifest.ts`
  and `src/app/icon.tsx` are thin wrappers over them.
- Icons are drawn from the lucide `activity` path inlined as SVG (`src/lib/app-icon-image.tsx`):
  `ImageResponse` renders plain SVG reliably, not the lucide React component. Colours are
  hex copies of light-mode `--primary`/`--primary-foreground` (it can't read CSS variables).
- The Apple icon is full-bleed like the maskable one: iOS rounds corners itself, and a rounded
  PNG would show black corners.
- `ServiceWorkerRegistration` takes `buildId` as a prop from the `(app)` layout (server reads
  `@/env`), matching how the login page passes env flags to client components.
- The worker caches offline-page assets best-effort (`Promise.allSettled`): a missing asset only
  degrades the page's look and must not block install. The asset regex stops at backslashes
  because the RSC payload inlines the same URLs inside escaped JSON.
- `NEXT_PUBLIC_BUILD_ID` can also be set explicitly (it wins over `VERCEL_GIT_COMMIT_SHA`), and
  `@/env` defaults it to `dev`.
- Verified in Chrome via CDP: `Page.getInstallabilityErrors` and manifest errors are empty.
- The proxy matcher skips `apple-icon` as an exact segment (`apple-icon$`), so a handle such as
  `apple-iconic` still goes through the proxy.
- Known limitation (from code review, not tested on a device): on iOS a home-screen app keeps
  its own cookies, separate from Safari's. A magic link opens in Safari, so an installed app that
  has lost its session can only sign in again with Google. A follow-up could add an email OTP
  code entry.
- Accepted: the maskable icon is also emitted as a `<link rel="icon">` by the `icon` convention;
  browsers use `favicon.ico` or the smaller icons for tabs. The locale-dependent manifest sends no
  `Vary` header; revisit if a CDN ever caches it.
