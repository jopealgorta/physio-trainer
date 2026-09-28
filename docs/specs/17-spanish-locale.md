# 17 · Spanish locale

- **Status:** Done
- **Feature:** Core (i18n)
- **Depends on:** 01

## Summary

Adds Spanish (`es`, Rioplatense voseo) as the second UI language and makes "every feature ships
in every language" a rule the build enforces. Signed-out visitors get their browser's language
and can switch it; signed-in physios keep choosing theirs in Settings. Patient pages will follow
the customer's `locale` (specs 04 and 10) with no extra work.

## Goals

- `es` is a supported locale; the whole existing UI is translated into Rioplatense Spanish.
- Signed-out pages (landing, login) pick the language from the `NEXT_LOCALE` cookie, then
  `Accept-Language`, then `en`, and offer a visible language switcher.
- Onboarding preselects the current UI language.
- The sign-in email is readable by Spanish and English speakers.
- A unit test fails `pnpm check` when any `messages/*.json` drifts from `messages/en.json`.
- Docs (`CLAUDE.md`, `docs/architecture.md`, `docs/specs/_template.md`) state that every new
  string is added to all locales.

## Non-goals

- Locale in the URL (architecture decision: share links stay clean).
- Per-language email templates or a Supabase Send Email hook (revisit when a third language
  arrives).
- Other Spanish variants (`es-ES`, `es-MX`) or more languages.
- Translating the timezone list (IANA names and `GMT±n` offsets stay as they are).
- Translating user content (exercise names, notes): that is the physio's text.

## User stories

- As a Spanish-speaking physio, I want the app in Spanish so that I work in my language.
- As a visitor with a Spanish browser, I want the landing and login pages in Spanish without
  doing anything, and a switcher if the guess is wrong.
- As a physio who signed up in Spanish, I want onboarding to already have Spanish selected.
- As a developer, I want the build to fail if I forget a Spanish string.

## Data model

No changes. `physios.locale` is already `text not null default 'en'`, validated by
`z.enum(locales)` in `profileSchema`; adding `es` to `locales` makes it valid.

## Routes and UI

| Route    | Kind   | Purpose                                                            |
| -------- | ------ | ------------------------------------------------------------------ |
| `/`      | Server | Landing: `LocaleSwitcher` in the header, next to the theme toggle. |
| `/login` | Server | Login: `LocaleSwitcher` below the card.                            |

No new routes, so `RESERVED_HANDLES` is unchanged.

**`LocaleSwitcher`** (client component, `src/components/locale-switcher.tsx`): a labelled native
`<select>` listing `languageOptions()` (autonyms). Changing it calls `setLocaleAction(locale)`, which
re-renders the page; the select is disabled while pending. Works at phone width. Not shown
inside the signed-in app: there the Settings language field is the single control, because it
also persists `physios.locale`.

**Language names** are autonyms everywhere (switcher and profile select): "English", "Español".
A user who lands in the wrong language can still recognise their own.

## Behaviour and rules

1. `src/i18n/config.ts`: `locales = ["en", "es"]`.
2. Locale resolution in `src/i18n/request.ts`, first match wins:
   1. explicit locale passed by the caller (patient pages, spec 10);
   2. `NEXT_LOCALE` cookie (via `resolveLocale`);
   3. `Accept-Language` header via `negotiateLocale(header)`;
   4. `defaultLocale` (`en`).
3. `negotiateLocale(header: string | null): Locale` in `src/i18n/config.ts`: parses the header,
   sorts by `q` (default 1, ties keep header order, `q=0` excluded), returns the first entry whose
   exact tag or base language (`es-UY` → `es`) is supported; `*` or nothing supported → `en`.
   Malformed input never throws.
4. Detection never writes the cookie; only an explicit choice does (switcher, Settings save,
   sign-in from `physios.locale`, as today).
5. `setLocaleAction(locale: unknown)` in `src/server/i18n/actions.ts`: validates with `isLocale`
   (invalid → `{ ok: false }`, no cookie), sets the cookie with `setLocaleCookie`, returns
   `{ ok: true }`. No auth required and it never touches the database.
6. `languageOptions()` returns autonyms: each label is `Intl.DisplayNames([locale], { type:
"language" }).of(locale)` with the first letter upper-cased for that locale. It no longer takes
   a display-locale argument.
7. Onboarding: while `onboardedAt` is null, the language default is the current UI locale
   (`getLocale()`), not the DB default. Settings keeps showing `physios.locale`. Sign-in only
   restores `physios.locale` into the cookie for onboarded physios.
8. Sign-in email (`supabase/templates/magic_link.html`): Spanish then English for each
   paragraph (`lang` attributes), a single sign-in link. Subject in `supabase/config.toml` (both
   `magic_link` and `confirmation`): "Tu link para ingresar · Your sign-in link — Physio Trainer".
9. Spanish copy uses Rioplatense voseo (`ingresá`, `elegí`, `revisá`), "email" for e-mail, and
   sentence case like English.
10. `messages/es.json` mirrors `en.json` exactly: same key tree, same ICU arguments (`{email}`,
    `{url}`, `{spec}`), same rich-text tags (`<code>`), no empty strings.

## Security and privacy

- `setLocaleAction` is unauthenticated but only writes the caller's own `NEXT_LOCALE` cookie with
  a whitelisted value; it reads and writes no data.
- `Accept-Language` is read only to pick a message file; it is never stored or logged.
- No new patient-facing data.

## i18n

- Adds `messages/es.json` (all namespaces) and `LocaleSwitcher.label` ("Language" / "Idioma") in
  both files.
- Convention from this spec on: every user-visible string is added to **every**
  `messages/*.json` in the same change; dates, numbers and lists use next-intl formatters
  (`useFormatter` / `getFormatter`) or `Intl` with the active locale, never a hard-coded `en-US`
  (the IANA timezone helpers in `src/lib/timezones.ts` are the documented exception: they
  normalise names, not display text for sentences).
- Docs updated: `CLAUDE.md` (rules list), `docs/architecture.md` (Languages row, Strings
  convention), `docs/specs/_template.md` (i18n section asks for en + es keys), and the
  add-a-language comment in `src/i18n/config.ts`.

## Acceptance criteria

- [x] With `Accept-Language: es-UY,es;q=0.9` and no cookie, `/` and `/login` render in Spanish and
      `<html lang="es">`.
- [x] With `Accept-Language: fr` and no cookie, pages render in English.
- [x] The switcher on `/` and `/login` changes the language, and the choice survives a reload.
- [x] A cookie always beats `Accept-Language`.
- [x] Onboarding preselects the current UI language.
- [x] Settings → Español saves, and the app (nav, settings, user menu) renders in Spanish.
- [x] Language options read "English" and "Español" regardless of the UI language.
- [x] `pnpm check` fails if `es.json` misses a key, has an extra key, or changes an ICU argument
      or rich tag.
- [x] Sign-in email shows Spanish and English text with one working link (local Mailpit).
- [x] `CLAUDE.md`, `docs/architecture.md` and `_template.md` state the all-locales rule.

## Test plan

- Unit:
  - `negotiateLocale`: q-value ordering, `es-UY` → `es`, `q=0` ignored, `*`, empty, malformed,
    unsupported → `en`.
  - `resolveLocale` accepts `es` and `es-AR`.
  - `languageOptions` returns `[{en, "English"}, {es, "Español"}]`.
  - Message parity (`src/i18n/messages.test.ts`): for every locale, key tree equals `en.json`,
    ICU argument names and rich tags per message match, no empty strings.
  - `setLocaleAction`: valid locale sets cookie; invalid locale does not.
  - `LocaleSwitcher`: renders options, calls the action and refreshes on change.
- Integration: none (no database change).
- E2E (`e2e/i18n.spec.ts`):
  - Context with `locale: "es-UY"` → login page heading in Spanish.
  - Switcher to English → English; reload → still English.
  - Signed-in physio: Settings → Español → nav in Spanish.

## Open questions

Resolved in brainstorming (2026-09-28):

1. Spanish variant? → Rioplatense, voseo.
2. How do signed-out visitors get a language? → `Accept-Language` detection plus a visible
   switcher on landing and login; onboarding preselects the UI language.
3. Sign-in email? → One bilingual template (Spanish first).

## Decisions made during implementation

- No `router.refresh()` in `LocaleSwitcher`: setting a cookie in a Server Action already
  re-renders the page (Next.js 16 docs, "Mutating data › Cookies"). It uses `useOptimistic`
  so the select shows the new choice while the action runs.
- `postSignInPath` no longer overwrites the cookie for non-onboarded physios (their row only has
  the `en` default), so a visitor who picked Spanish onboards in Spanish. Found while planning.
- `pickLocale` lets an unsupported cookie fall through to `Accept-Language` instead of forcing
  English.
- The switcher is hidden on the landing page for signed-in physios.
- The parity test uses `@formatjs/icu-messageformat-parser` (dev dependency) to compare ICU
  arguments and tags and to reject invalid ICU.
- Email: Spanish and English paragraphs interleaved rather than two blocks with a divider.
- Spanish wording: "link" (not "enlace"), "usuario" for handle, "Clientes" for customers,
  "Panel" for dashboard.
