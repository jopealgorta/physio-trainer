# Spec 17 · Spanish locale: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Spanish (`es`, Rioplatense voseo) as a second UI language, detect it for
signed-out visitors, and make the build fail whenever a locale file drifts from `en.json`.

**Architecture:** next-intl without i18n routing is already set up (`src/i18n/`). This plan adds
`es` to `locales`, a pure `pickLocale()` (explicit → cookie → `Accept-Language` → `en`) used by
`src/i18n/request.ts`, a `LocaleSwitcher` client component backed by an unauthenticated
`setLocaleAction` that only writes the `NEXT_LOCALE` cookie, and an ICU-aware parity test over
`messages/*.json`. Setting a cookie in a Server Action makes Next.js re-render the current page
and layouts, so the switcher needs no `router.refresh()`.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, next-intl 4, TypeScript,
Vitest 5 + Testing Library, Playwright 1.63, `@formatjs/icu-messageformat-parser` (new dev
dependency, already in the tree via next-intl).

**Spec:** [`docs/specs/17-spanish-locale.md`](../specs/17-spanish-locale.md) (read it and
[`docs/architecture.md`](../architecture.md) before starting).

## Global Constraints

- Node 24 (`.nvmrc`). If `node --version` is below 22, run `source ~/.nvm/nvm.sh && nvm use`
  first.
- Branch: `feat/17-spanish-locale` (already created; spec committed as `b460dbd`).
- Next.js 16: `params`, `searchParams`, `cookies()`, `headers()` are async. Check
  `node_modules/next/dist/docs/` before using an unfamiliar API.
- Locales are **not** in the URL. Locale codes: exactly `"en"` and `"es"`.
- Every user-visible string goes in **both** `messages/en.json` and `messages/es.json`, same key
  tree, same ICU arguments and rich tags. No hard-coded copy.
- Spanish copy: Rioplatense voseo (`ingresá`, `elegí`, `revisá`, `podés`), "link" for link,
  "email" for e-mail, "usuario" for handle, sentence case.
- Language names are autonyms: "English", "Español".
- Accent colour uses the `primary` token only; never hard-code colours.
- Never pass non-action functions from Server to Client Components; Server Actions as props are
  fine (repo pattern: `ProfileForm` gets `action` and `checkHandle` props).
- No new top-level routes (so `RESERVED_HANDLES` is unchanged).
- Run `pnpm format` before every commit; `pnpm check` must pass before every commit.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

Failure modes the spec implies that would bite a real user; each has a test in the named task.

1. **A visitor chooses Spanish on /login, then signs up**: the first sign-in must not flip them
   back to English because their new `physios` row still has the column default `en`.
   → Task 4 unit test (`postSignInPath` leaves the cookie alone for non-onboarded physios) and
   Task 6 e2e (onboarding in Spanish).
2. **Messy `Accept-Language` headers** (`es-UY;q=0.9, en;q=0.8`, `q=0`, `*`, garbage like
   `;;,q=abc`, upper-case `ES-AR`) must pick a sensible locale and never throw.
   → Task 2 unit tests.
3. **A stale or tampered `NEXT_LOCALE` cookie** (`fr`, `garbage`) must fall through to the
   browser language, not force English. → Task 2 unit test for `pickLocale`.
4. **A translator breaks a placeholder** (`{email}` → `{correo}`, dropped `<code>` tag, invalid
   ICU syntax) must fail `pnpm check`, not render a raw key or crash at runtime.
   → Task 1 parity test.
5. **Existing English e2e tests start failing on a Spanish-locale CI machine** because the
   browser now negotiates the language. → Task 2 pins Playwright's `locale` to `en-US`.

---

## File map

| File                                                                                                                      | Task | Responsibility                                                |
| ------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------- |
| `messages/es.json`                                                                                                        | 1, 3 | Spanish messages (create)                                     |
| `src/i18n/messages.test.ts`                                                                                               | 1, 2 | Parity of every locale file with `en.json` (create)           |
| `package.json`                                                                                                            | 1    | Dev dependency `@formatjs/icu-messageformat-parser`           |
| `src/i18n/config.ts`                                                                                                      | 2    | `locales`, `negotiateLocale`, `pickLocale`, `languageOptions` |
| `src/i18n/config.test.ts`                                                                                                 | 2    | Unit tests for the above                                      |
| `src/i18n/request.ts`                                                                                                     | 2    | Reads cookie + `Accept-Language`, calls `pickLocale`          |
| `src/server/physios/form-options.ts`                                                                                      | 2    | `profileFormOptions()` loses its argument                     |
| `src/app/(app)/settings/page.tsx`                                                                                         | 2    | Caller update                                                 |
| `src/app/(auth)/onboarding/page.tsx`                                                                                      | 2, 4 | Caller update; default language = UI locale                   |
| `playwright.config.ts`                                                                                                    | 2    | Pin browser locale `en-US`                                    |
| `src/server/i18n/actions.ts`                                                                                              | 3    | `setLocaleAction` (create)                                    |
| `src/server/i18n/actions.test.ts`                                                                                         | 3    | (create)                                                      |
| `src/components/locale-switcher.tsx`                                                                                      | 3    | `LocaleSwitcher` (create)                                     |
| `src/components/locale-switcher.test.tsx`                                                                                 | 3    | (create)                                                      |
| `messages/en.json`                                                                                                        | 3    | `LocaleSwitcher.label`                                        |
| `src/app/(marketing)/page.tsx`                                                                                            | 3    | Switcher in header (signed-out only)                          |
| `src/app/(auth)/login/page.tsx`                                                                                           | 3    | Switcher below the card                                       |
| `src/server/auth/post-sign-in.ts`                                                                                         | 4    | Only onboarded physios' locale overrides the cookie           |
| `src/server/auth/post-sign-in.test.ts`                                                                                    | 4    | (create)                                                      |
| `supabase/templates/magic_link.html`                                                                                      | 5    | Bilingual email                                               |
| `supabase/config.toml`                                                                                                    | 5    | Bilingual subject                                             |
| `e2e/i18n.spec.ts`                                                                                                        | 6    | End-to-end language flows (create)                            |
| `CLAUDE.md`, `docs/architecture.md`, `docs/specs/_template.md`, `docs/specs/17-spanish-locale.md`, `docs/specs/README.md` | 7    | All-locales rule, status, decisions                           |

---

### Task 1: Spanish messages and the parity test

**Files:**

- Create: `messages/es.json`
- Create: `src/i18n/messages.test.ts`
- Modify: `package.json` (dev dependency, via pnpm)

**Interfaces:**

- Consumes: `messages/en.json` (existing).
- Produces: `messages/es.json` with the same key tree as `en.json`; `src/i18n/messages.test.ts`
  exporting nothing, with a `describe("messages")` block that later tasks extend (Task 2 adds a
  `locales` ↔ files check).

- [ ] **Step 1: Add the ICU parser as a dev dependency**

Run: `pnpm add -D @formatjs/icu-messageformat-parser`
Expected: `package.json` `devDependencies` gains `"@formatjs/icu-messageformat-parser": "^3.x"`.

- [ ] **Step 2: Write the failing parity test**

Create `src/i18n/messages.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";

type Tree = { [key: string]: string | Tree };

const MESSAGES_DIR = path.join(process.cwd(), "messages");

function load(file: string): Tree {
  return JSON.parse(readFileSync(path.join(MESSAGES_DIR, file), "utf8")) as Tree;
}

/** `{ a: { b: "x" } }` → `{ "a.b": "x" }`. */
function flatten(tree: Tree, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const id = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") result[id] = value;
    else Object.assign(result, flatten(value, id));
  }
  return result;
}

/** Argument names and rich-text tags a message uses, e.g. ["arg:email", "tag:code"]. */
function signature(elements: MessageFormatElement[], out = new Set<string>()): string[] {
  for (const element of elements) {
    switch (element.type) {
      case TYPE.argument:
      case TYPE.number:
      case TYPE.date:
      case TYPE.time:
        out.add(`arg:${element.value}`);
        break;
      case TYPE.plural:
      case TYPE.select:
        out.add(`arg:${element.value}`);
        for (const option of Object.values(element.options)) signature(option.value, out);
        break;
      case TYPE.tag:
        out.add(`tag:${element.value}`);
        signature(element.children, out);
        break;
    }
  }
  return [...out].sort();
}

const english = flatten(load("en.json"));
const otherFiles = readdirSync(MESSAGES_DIR).filter(
  (file) => file.endsWith(".json") && file !== "en.json",
);

describe("messages", () => {
  it("has at least one translation besides English", () => {
    expect(otherFiles).not.toHaveLength(0);
  });

  it.each(Object.keys(english))("en.json %s is valid ICU", (key) => {
    expect(() => parse(english[key])).not.toThrow();
  });

  describe.each(otherFiles)("%s", (file) => {
    const translated = flatten(load(file));

    it("has exactly the same keys as en.json", () => {
      expect(Object.keys(translated).sort()).toEqual(Object.keys(english).sort());
    });

    it.each(Object.keys(english))(
      "%s is non-empty, valid ICU with en.json's arguments and tags",
      (key) => {
        const message = translated[key];
        expect(message, `missing in ${file}`).toBeTypeOf("string");
        expect(message.trim()).not.toBe("");
        expect(signature(parse(message))).toEqual(signature(parse(english[key])));
      },
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run src/i18n/messages.test.ts`
Expected: FAIL on "has at least one translation besides English" (only `en.json` exists).

- [ ] **Step 4: Create `messages/es.json`**

```json
{
  "Metadata": {
    "title": "Physio Trainer",
    "description": "Rutinas de rehabilitación que tus pacientes abren con un solo link."
  },
  "Landing": {
    "eyebrow": "Para fisioterapeutas",
    "headline": "Rutinas de rehabilitación que tus pacientes de verdad abren.",
    "subheadline": "Armá rutinas con tu propia biblioteca de ejercicios, compartilas con un solo link y mirá cómo les va a tus pacientes.",
    "primaryCta": "Empezar",
    "dashboardCta": "Abrir panel"
  },
  "Login": {
    "title": "Ingresar",
    "description": "Te mandamos un link por email. Sin contraseña.",
    "emailLabel": "Email",
    "emailPlaceholder": "vos@clinica.com",
    "sendLink": "Enviar link",
    "sending": "Enviando…",
    "or": "o",
    "google": "Continuar con Google",
    "checkInboxTitle": "Revisá tu email",
    "checkInboxDescription": "Te mandamos un link para ingresar a {email}. Podés abrirlo en cualquier dispositivo.",
    "useDifferentEmail": "Usar otro email",
    "back": "Volver al inicio"
  },
  "Auth": {
    "errors": {
      "linkInvalid": "Ese link para ingresar venció o ya se usó. Pedí uno nuevo.",
      "oauthFailed": "El ingreso con Google no terminó. Probá de nuevo o usá un link por email.",
      "unknown": "Algo salió mal al ingresar. Probá de nuevo.",
      "emailInvalid": "Ingresá un email válido.",
      "sendFailed": "No pudimos enviar el link. Esperá un momento y probá de nuevo."
    }
  },
  "ProfileForm": {
    "displayName": "Nombre visible",
    "displayNameHint": "Lo ven tus pacientes.",
    "handle": "Usuario",
    "handleHint": "Aparece en los links que compartís con tus pacientes.",
    "linkPreview": "Los links para pacientes se van a ver así: {url}",
    "language": "Idioma",
    "timezone": "Zona horaria",
    "handleStatus": {
      "checking": "Verificando disponibilidad…",
      "available": "Disponible",
      "taken": "Ese usuario ya está en uso.",
      "reserved": "Ese usuario está reservado. Elegí otro.",
      "tooShort": "Usá al menos 3 caracteres.",
      "tooLong": "Usá como máximo 30 caracteres.",
      "format": "Usá letras minúsculas, números y guiones simples, sin guion al principio ni al final."
    },
    "errors": {
      "displayNameRequired": "Ingresá tu nombre.",
      "displayNameTooLong": "Usá como máximo 80 caracteres.",
      "localeInvalid": "Elegí un idioma de la lista.",
      "timezoneInvalid": "Elegí una zona horaria de la lista.",
      "unknown": "Algo salió mal. Probá de nuevo."
    },
    "submitOnboarding": "Continuar",
    "submitSettings": "Guardar cambios",
    "saving": "Guardando…",
    "saved": "Guardado",
    "handleChangeNotice": "Los links que ya compartiste siguen funcionando y van a mostrar tu nuevo usuario."
  },
  "Onboarding": {
    "title": "Configurá tu perfil",
    "description": "Así te ven tus pacientes. Podés cambiarlo después en Configuración."
  },
  "Settings": {
    "title": "Configuración",
    "profile": {
      "title": "Perfil",
      "description": "Tu nombre, usuario, idioma y zona horaria."
    },
    "account": {
      "title": "Cuenta",
      "description": "Ingresás con este email.",
      "email": "Email",
      "signOut": "Cerrar sesión"
    }
  },
  "UserMenu": {
    "trigger": "Menú de la cuenta",
    "settings": "Configuración",
    "signOut": "Cerrar sesión"
  },
  "Nav": {
    "dashboard": "Panel",
    "customers": "Clientes",
    "library": "Biblioteca de ejercicios",
    "routines": "Rutinas",
    "plans": "Planes semanales",
    "settings": "Configuración"
  },
  "Placeholder": {
    "comingSoon": "Todavía no está hecho",
    "specHint": "Especificado en <code>{spec}</code>."
  },
  "Theme": {
    "toggle": "Cambiar tema",
    "light": "Claro",
    "dark": "Oscuro",
    "system": "Sistema"
  },
  "NotFound": {
    "title": "Página no encontrada",
    "description": "Puede que este link haya vencido o se haya eliminado.",
    "home": "Ir al inicio"
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run src/i18n/messages.test.ts`
Expected: PASS.

- [ ] **Step 6: Prove the test catches drift (then revert)**

Temporarily change `"checkInboxDescription"` in `messages/es.json` to use `{correo}` instead of
`{email}`, run `pnpm vitest run src/i18n/messages.test.ts`, and confirm it FAILS on
`Login.checkInboxDescription`. Undo that, temporarily delete `"home"` from `NotFound`, and
confirm "has exactly the same keys as en.json" FAILS. Undo it and re-run: PASS.

- [ ] **Step 7: Commit**

```bash
pnpm format && pnpm check
git add package.json pnpm-lock.yaml messages/es.json src/i18n/messages.test.ts
git commit -m "feat(i18n): add Spanish messages and locale parity test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Enable `es` and negotiate the request locale

**Files:**

- Modify: `src/i18n/config.ts`
- Modify: `src/i18n/config.test.ts`
- Modify: `src/i18n/messages.test.ts`
- Modify: `src/i18n/request.ts`
- Modify: `src/server/physios/form-options.ts`
- Modify: `src/app/(app)/settings/page.tsx`
- Modify: `src/app/(auth)/onboarding/page.tsx`
- Modify: `playwright.config.ts`

**Interfaces:**

- Consumes: `messages/es.json` (Task 1).
- Produces (all in `src/i18n/config.ts`):
  - `locales = ["en", "es"] as const`, `type Locale = "en" | "es"`
  - `negotiateLocale(header: string | null | undefined): Locale`
  - `pickLocale(sources: { explicit?: string; cookie?: string; acceptLanguage?: string | null }): Locale`
  - `languageOptions(): { value: Locale; label: string }[]` (no argument; autonyms)
  - `resolveLocale(candidate)` keeps its signature.
  - `profileFormOptions()` in `src/server/physios/form-options.ts` takes no argument.

- [ ] **Step 1: Write the failing tests**

Replace `src/i18n/config.test.ts` with:

```ts
import { describe, expect, it } from "vitest";

import { languageOptions, negotiateLocale, pickLocale, resolveLocale } from "./config";

describe("resolveLocale", () => {
  it.each([
    ["es", "es"],
    ["es-AR", "es"],
    ["ES_uy", "es"],
    ["en-GB", "en"],
    ["fr", "en"],
    [null, "en"],
    ["", "en"],
  ])("%j → %s", (candidate, expected) => {
    expect(resolveLocale(candidate)).toBe(expected);
  });
});

describe("negotiateLocale", () => {
  it.each([
    ["es-UY,es;q=0.9,en;q=0.8", "es"],
    ["en-US,en;q=0.9,es;q=0.8", "en"],
    ["fr-FR,es;q=0.5", "es"],
    ["fr-FR,de;q=0.9", "en"],
    ["en;q=0.5,es;q=0.9", "es"],
    ["es;q=0,en", "en"],
    ["ES-AR", "es"],
    ["*", "en"],
    ["fr,*;q=0.5,es;q=0.4", "en"],
    ["", "en"],
    [null, "en"],
    [undefined, "en"],
    [";;,q=abc,,", "en"],
    ["es;q=abc,en;q=0.1", "en"],
  ])("%j → %s", (header, expected) => {
    expect(negotiateLocale(header)).toBe(expected);
  });

  it("keeps header order for equal q-values", () => {
    expect(negotiateLocale("es;q=0.8,en;q=0.8")).toBe("es");
  });
});

describe("pickLocale", () => {
  it("prefers an explicit locale over everything", () => {
    expect(pickLocale({ explicit: "en", cookie: "es", acceptLanguage: "es" })).toBe("en");
  });

  it("prefers a valid cookie over Accept-Language", () => {
    expect(pickLocale({ cookie: "en", acceptLanguage: "es-UY" })).toBe("en");
  });

  it("falls through an unsupported cookie to Accept-Language", () => {
    expect(pickLocale({ cookie: "fr", acceptLanguage: "es-UY" })).toBe("es");
    expect(pickLocale({ cookie: "garbage", acceptLanguage: "es" })).toBe("es");
  });

  it("uses Accept-Language without a cookie, then the default", () => {
    expect(pickLocale({ acceptLanguage: "es-AR,es;q=0.9" })).toBe("es");
    expect(pickLocale({})).toBe("en");
  });
});

describe("languageOptions", () => {
  it("names every locale in its own language", () => {
    expect(languageOptions()).toEqual([
      { value: "en", label: "English" },
      { value: "es", label: "Español" },
    ]);
  });
});
```

Append to `src/i18n/messages.test.ts` (inside the file, after the existing `describe`), and add
`existsSync` to the `node:fs` import and `locales` import:

```ts
// at the top:
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { locales } from "./config";

// at the bottom:
describe("locales", () => {
  it.each(locales)("%s has a messages file", (locale) => {
    expect(existsSync(path.join(MESSAGES_DIR, `${locale}.json`))).toBe(true);
  });

  it("every messages file is a supported locale", () => {
    const files = readdirSync(MESSAGES_DIR).filter((file) => file.endsWith(".json"));
    expect(files.map((file) => file.replace(/\.json$/, "")).sort()).toEqual([...locales].sort());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/i18n`
Expected: FAIL — `negotiateLocale`/`pickLocale` are not exported, `resolveLocale("es")` returns
`"en"`, and "every messages file is a supported locale" fails (`es.json` exists, `es` not in
`locales`).

- [ ] **Step 3: Implement in `src/i18n/config.ts`**

Replace the file with:

```ts
/**
 * Supported UI languages. Locales are NOT part of the URL (share links must stay clean);
 * the physio's locale comes from a cookie / their profile, the patient's from the
 * customer record, and signed-out visitors get their browser's language.
 * To add a language: add it here and create messages/<locale>.json with every key of en.json
 * (src/i18n/messages.test.ts enforces it).
 */
export const locales = ["en", "es"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";
export const localeCookieName = "NEXT_LOCALE";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/** Supported locale for a tag, matching the base language ("es-UY" → "es"), or null. */
function matchLocale(tag: string): Locale | null {
  const lower = tag.trim().toLowerCase();
  if (isLocale(lower)) return lower;
  const base = lower.split(/[-_]/)[0];
  return isLocale(base) ? base : null;
}

/** Picks the best supported locale for a candidate value, falling back to the default. */
export function resolveLocale(candidate: string | null | undefined): Locale {
  return (candidate && matchLocale(candidate)) || defaultLocale;
}

/**
 * Best supported locale for an Accept-Language header: highest q first (ties keep header
 * order), q=0 excluded, "*" means the default. Never throws.
 */
export function negotiateLocale(header: string | null | undefined): Locale {
  if (!header) return defaultLocale;
  const ranges = header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.split(";");
      const qParam = params.map((param) => param.trim()).find((param) => param.startsWith("q="));
      const q = qParam === undefined ? 1 : Number(qParam.slice(2));
      return { tag: tag.trim(), q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((range) => range.tag !== "" && range.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);

  for (const { tag } of ranges) {
    if (tag === "*") return defaultLocale;
    const match = matchLocale(tag);
    if (match) return match;
  }
  return defaultLocale;
}

/** The request's locale: explicit (patient pages) → cookie → Accept-Language → default. */
export function pickLocale(sources: {
  explicit?: string;
  cookie?: string;
  acceptLanguage?: string | null;
}): Locale {
  if (sources.explicit) return resolveLocale(sources.explicit);
  const fromCookie = sources.cookie ? matchLocale(sources.cookie) : null;
  return fromCookie ?? negotiateLocale(sources.acceptLanguage);
}

/** Language <select> options, each named in its own language ("English", "Español"). */
export function languageOptions(): { value: Locale; label: string }[] {
  return locales.map((value) => {
    const name = new Intl.DisplayNames([value], { type: "language" }).of(value) ?? value;
    return { value, label: name.charAt(0).toLocaleUpperCase(value) + name.slice(1) };
  });
}
```

- [ ] **Step 4: Wire `src/i18n/request.ts`**

```ts
import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { localeCookieName, pickLocale } from "./config";

export default getRequestConfig(async ({ locale: explicit }) => {
  // Patient pages pass the customer's locale explicitly; everything else uses the cookie, then
  // the browser's language.
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const locale = pickLocale({
    explicit,
    cookie: cookieStore.get(localeCookieName)?.value,
    acceptLanguage: headerList.get("accept-language"),
  });

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
```

- [ ] **Step 5: Drop the `languageOptions` argument from its callers**

`src/server/physios/form-options.ts`:

```ts
import "server-only";

import { env } from "@/env";
import { languageOptions } from "@/i18n/config";
import { timeZoneOptions } from "@/lib/timezones";

/** Serialisable options ProfileForm needs, built on the server. */
export function profileFormOptions() {
  return {
    linkBase: new URL(env.NEXT_PUBLIC_APP_URL).host,
    timeZones: timeZoneOptions(),
    languages: languageOptions(),
  };
}
```

`src/app/(app)/settings/page.tsx`: change `import { getLocale, getTranslations } from
"next-intl/server";` to `import { getTranslations } from "next-intl/server";` and
`{...profileFormOptions(await getLocale())}` to `{...profileFormOptions()}`.

`src/app/(auth)/onboarding/page.tsx`: change `{...profileFormOptions(await getLocale())}` to
`{...profileFormOptions()}`. Keep the `getLocale` import: Task 4 uses it. To keep lint green
now, make Task 4's one-line change here as well:

```tsx
            defaults={{
              displayName: profile.displayName,
              handle: suggestion ?? profile.handle,
              // Not onboarded yet: the row still has the column default, so offer the language
              // the page is already in (cookie or browser).
              locale: await getLocale(),
              timezone: profile.timezone,
            }}
```

- [ ] **Step 6: Pin Playwright's browser locale**

In `playwright.config.ts`, inside `use: { … }`, add after `baseURL,`:

```ts
    // Pages now follow Accept-Language; existing specs assert English copy.
    locale: "en-US",
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm vitest run src/i18n src/components/physios`
Expected: PASS.

- [ ] **Step 8: Check the app by hand**

Run `pnpm dev`, open `http://localhost:3000/login` with the browser language set to Spanish
(or `curl -s -H 'Accept-Language: es-UY' http://localhost:3000/login | grep -o '<html[^>]*>'`
→ contains `lang="es"`, and the page contains `Ingresar`). With `-H 'Accept-Language: fr'` →
`lang="en"`.

- [ ] **Step 9: Commit**

```bash
pnpm format && pnpm check
git add src/i18n src/server/physios/form-options.ts "src/app/(app)/settings/page.tsx" "src/app/(auth)/onboarding/page.tsx" playwright.config.ts
git commit -m "feat(i18n): enable Spanish and negotiate locale from Accept-Language

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Language switcher on landing and login

**Files:**

- Create: `src/server/i18n/actions.ts`
- Create: `src/server/i18n/actions.test.ts`
- Create: `src/components/locale-switcher.tsx`
- Create: `src/components/locale-switcher.test.tsx`
- Modify: `messages/en.json`, `messages/es.json`
- Modify: `src/app/(marketing)/page.tsx`
- Modify: `src/app/(auth)/login/page.tsx`

**Interfaces:**

- Consumes: `isLocale`, `languageOptions()` from `@/i18n/config` (Task 2);
  `setLocaleCookie(locale: string): Promise<void>` from `@/server/i18n/locale-cookie` (existing).
- Produces:
  - `setLocaleAction(locale: unknown): Promise<{ ok: boolean }>` (Server Action).
  - `LocaleSwitcher({ options, setLocale }: { options: { value: string; label: string }[];
setLocale: (locale: string) => Promise<{ ok: boolean }> })` (client component).
  - Message key `LocaleSwitcher.label`.

- [ ] **Step 1: Write the failing action test**

Create `src/server/i18n/actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setLocaleAction } from "./actions";

const { setLocaleCookie } = vi.hoisted(() => ({ setLocaleCookie: vi.fn() }));

vi.mock("./locale-cookie", () => ({ setLocaleCookie }));

beforeEach(() => {
  setLocaleCookie.mockReset();
});

describe("setLocaleAction", () => {
  it.each(["en", "es"])("remembers %s", async (locale) => {
    await expect(setLocaleAction(locale)).resolves.toEqual({ ok: true });
    expect(setLocaleCookie).toHaveBeenCalledWith(locale);
  });

  // Server actions are public endpoints: callers can send anything.
  it.each(["fr", "es-AR", "", null, 42, { locale: "es" }])(
    "rejects %j without touching the cookie",
    async (input) => {
      await expect(setLocaleAction(input)).resolves.toEqual({ ok: false });
      expect(setLocaleCookie).not.toHaveBeenCalled();
    },
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/server/i18n`
Expected: FAIL — cannot resolve `./actions`.

- [ ] **Step 3: Implement `src/server/i18n/actions.ts`**

```ts
"use server";

import { isLocale } from "@/i18n/config";

import { setLocaleCookie } from "./locale-cookie";

/**
 * Remembers a signed-out visitor's language choice. Public: it only writes the caller's own
 * NEXT_LOCALE cookie with a supported value, and Next.js re-renders the page after it.
 */
export async function setLocaleAction(locale: unknown): Promise<{ ok: boolean }> {
  if (!isLocale(locale)) return { ok: false };
  await setLocaleCookie(locale);
  return { ok: true };
}
```

Run: `pnpm vitest run src/server/i18n` → PASS.

- [ ] **Step 4: Add the message key**

`messages/en.json`, add a top-level namespace after `"Theme"`:

```json
  "LocaleSwitcher": {
    "label": "Language"
  },
```

`messages/es.json`, same position:

```json
  "LocaleSwitcher": {
    "label": "Idioma"
  },
```

- [ ] **Step 5: Write the failing component test**

Create `src/components/locale-switcher.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import messages from "../../messages/en.json";

import { LocaleSwitcher } from "./locale-switcher";

const options = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
];

function renderSwitcher(setLocale = vi.fn(async () => ({ ok: true }))) {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <LocaleSwitcher options={options} setLocale={setLocale} />
    </NextIntlClientProvider>,
  );
  return setLocale;
}

describe("LocaleSwitcher", () => {
  it("shows every language with the current one selected", () => {
    renderSwitcher();
    const select = screen.getByRole("combobox", { name: "Language" });
    expect(select).toHaveValue("en");
    expect(screen.getByRole("option", { name: "Español" })).toBeInTheDocument();
  });

  it("asks the server to switch when a language is picked", async () => {
    const user = userEvent.setup();
    const setLocale = renderSwitcher();
    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "es");
    await waitFor(() => expect(setLocale).toHaveBeenCalledWith("es"));
  });

  it("is disabled while the switch is pending", async () => {
    const user = userEvent.setup();
    let resolve: (value: { ok: boolean }) => void = () => {};
    renderSwitcher(vi.fn(() => new Promise<{ ok: boolean }>((r) => (resolve = r))));
    const select = screen.getByRole("combobox", { name: "Language" });
    await user.selectOptions(select, "es");
    await waitFor(() => expect(select).toBeDisabled());
    resolve({ ok: true });
    await waitFor(() => expect(select).toBeEnabled());
  });
});
```

Run: `pnpm vitest run src/components/locale-switcher.test.tsx`
Expected: FAIL — cannot resolve `./locale-switcher`.

- [ ] **Step 6: Implement `src/components/locale-switcher.tsx`**

```tsx
"use client";

import { useLocale, useTranslations } from "next-intl";
import { useOptimistic, useTransition } from "react";

import { cn } from "@/lib/utils";

/** Language picker for signed-out pages. Signed-in physios change language in Settings. */
export function LocaleSwitcher({
  options,
  setLocale,
  className,
}: {
  options: { value: string; label: string }[];
  setLocale: (locale: string) => Promise<{ ok: boolean }>;
  className?: string;
}) {
  const t = useTranslations("LocaleSwitcher");
  const locale = useLocale();
  const [shown, setShown] = useOptimistic(locale);
  const [pending, startTransition] = useTransition();

  return (
    <select
      aria-label={t("label")}
      value={shown}
      disabled={pending}
      onChange={(event) => {
        const next = event.target.value;
        startTransition(async () => {
          setShown(next);
          await setLocale(next);
        });
      }}
      className={cn(
        "border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px] disabled:opacity-50",
        className,
      )}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
```

Run: `pnpm vitest run src/components/locale-switcher.test.tsx` → PASS.

- [ ] **Step 7: Place the switcher**

`src/app/(marketing)/page.tsx`: add imports

```tsx
import { LocaleSwitcher } from "@/components/locale-switcher";
import { languageOptions } from "@/i18n/config";
import { setLocaleAction } from "@/server/i18n/actions";
```

and replace `<ThemeToggle />` in the header with:

```tsx
<div className="flex items-center gap-2">
  {/* Signed-in physios change language in Settings, which also saves it to their profile. */}
  {session ? null : <LocaleSwitcher options={languageOptions()} setLocale={setLocaleAction} />}
  <ThemeToggle />
</div>
```

`src/app/(auth)/login/page.tsx`: add the same three imports and, after `<LoginForm … />`
inside `<main>`:

```tsx
<LocaleSwitcher options={languageOptions()} setLocale={setLocaleAction} />
```

- [ ] **Step 8: Check the app by hand**

`pnpm dev`, open `/login`: switcher below the card shows "English"; pick "Español" → page
re-renders in Spanish ("Ingresar"), `<html lang="es">`; reload → still Spanish. Same on `/`
while signed out. At 375px width nothing overflows.

- [ ] **Step 9: Commit**

```bash
pnpm format && pnpm check
git add src/server/i18n src/components/locale-switcher.tsx src/components/locale-switcher.test.tsx messages "src/app/(marketing)/page.tsx" "src/app/(auth)/login/page.tsx"
git commit -m "feat(i18n): language switcher on landing and login

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Keep a new physio's chosen language through sign-in

**Files:**

- Modify: `src/server/auth/post-sign-in.ts`
- Create: `src/server/auth/post-sign-in.test.ts`

**Interfaces:**

- Consumes: `postSignInPath(supabase, accessToken, next): Promise<string>` (existing, unchanged
  signature); onboarding default already switched to `getLocale()` in Task 2 Step 5.
- Produces: rule "only an onboarded physio's saved locale overrides the cookie at sign-in".

- [ ] **Step 1: Write the failing test**

Create `src/server/auth/post-sign-in.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import { postSignInPath } from "./post-sign-in";

const { runAsPhysio, setLocaleCookie } = vi.hoisted(() => ({
  runAsPhysio: vi.fn(),
  setLocaleCookie: vi.fn(),
}));

// Unit tests run without the int config's server-only alias; the real package throws here.
vi.mock("server-only", () => ({}));
vi.mock("@/db/rls", () => ({ runAsPhysio }));
vi.mock("@/server/physios/queries", () => ({}));
vi.mock("@/server/i18n/locale-cookie", () => ({ setLocaleCookie }));

function supabase() {
  return {
    auth: {
      getClaims: vi.fn(async () => ({ data: { claims: { sub: "physio-1" } }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
  } as never;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("postSignInPath", () => {
  it("restores an onboarded physio's language and continues to next", async () => {
    runAsPhysio.mockResolvedValue({ locale: "es", onboardedAt: new Date() });
    await expect(postSignInPath(supabase(), "token", "/customers")).resolves.toBe("/customers");
    expect(setLocaleCookie).toHaveBeenCalledWith("es");
  });

  // The new row still has the column default ("en"): keep what they picked while signed out.
  it("leaves the language alone for a physio who has not onboarded", async () => {
    runAsPhysio.mockResolvedValue({ locale: "en", onboardedAt: null });
    await expect(postSignInPath(supabase(), "token", "/dashboard")).resolves.toBe(
      "/onboarding?next=%2Fdashboard",
    );
    expect(setLocaleCookie).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/server/auth/post-sign-in.test.ts`
Expected: the first test PASSES, the second FAILS (`setLocaleCookie` called with `"en"`).

- [ ] **Step 3: Implement**

In `src/server/auth/post-sign-in.ts` replace `await setLocaleCookie(profile.locale);` with:

```ts
// Before onboarding the row only has the column default; keep the language the physio
// chose (or their browser's) while signed out. Onboarding saves it to the profile.
if (profile.onboardedAt) await setLocaleCookie(profile.locale);
```

and update the doc comment's first line to: `Where to send a physio right after a session was
created; restores an onboarded physio's language.`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/server/auth`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format && pnpm check
git add src/server/auth/post-sign-in.ts src/server/auth/post-sign-in.test.ts
git commit -m "fix(i18n): keep a new physio's language through first sign-in

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Bilingual sign-in email

**Files:**

- Modify: `supabase/templates/magic_link.html`
- Modify: `supabase/config.toml` (both `[auth.email.template.magic_link]` and
  `[auth.email.template.confirmation]` subjects)

**Interfaces:**

- Consumes: nothing.
- Produces: an email whose **first** `href` is still the sign-in link (`e2e/helpers/mailpit.ts`
  takes the first `href`).

- [ ] **Step 1: Replace `supabase/templates/magic_link.html`**

```html
<h2>Ingresá a Physio Trainer · Sign in to Physio Trainer</h2>
<p lang="es">Usá este link para ingresar. Funciona una sola vez y vence en una hora.</p>
<p lang="en">Use this link to sign in. It works once and expires in one hour.</p>
<p><a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">Ingresar · Sign in</a></p>
<p lang="es">Si no pediste este email, podés ignorarlo.</p>
<p lang="en">If you didn't ask for this email, you can ignore it.</p>
```

- [ ] **Step 2: Update both subjects in `supabase/config.toml`**

```toml
subject = "Tu link para ingresar · Your sign-in link — Physio Trainer"
```

- [ ] **Step 3: Verify with the existing magic-link e2e**

Restart local Supabase so it picks up the template (`pnpm db:stop && pnpm db:start`), then run
`pnpm test:e2e e2e/auth.spec.ts --project=desktop`.
Expected: PASS (the magic-link test reads the link from Mailpit). Open Mailpit
(`http://127.0.0.1:54324`) and confirm the email shows both languages and one link.

- [ ] **Step 4: Commit**

```bash
pnpm format && pnpm check
git add supabase/templates/magic_link.html supabase/config.toml
git commit -m "feat(i18n): bilingual sign-in email

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: End-to-end language flows

**Files:**

- Create: `e2e/i18n.spec.ts`

**Interfaces:**

- Consumes: `test`, `expect`, `createPhysio`, `deletePhysio`, `signIn` from `./helpers/auth`;
  everything from Tasks 1–4.
- Produces: nothing.

- [ ] **Step 1: Write the e2e spec**

```ts
import { createPhysio, deletePhysio, expect, signIn, test } from "./helpers/auth";

test.describe("with a Spanish browser", () => {
  test.use({ locale: "es-UY" });

  test("login is in Spanish and the switcher choice sticks", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByRole("heading", { name: "Ingresar" })).toBeVisible();

    await page.getByRole("combobox", { name: "Idioma" }).selectOption("en");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await page.reload();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("a new physio onboards in Spanish", async ({ page }) => {
    const physio = await createPhysio();
    try {
      await signIn(page, physio);
      await expect(page).toHaveURL(/\/onboarding/);
      await expect(page.getByRole("heading", { name: "Configurá tu perfil" })).toBeVisible();
      await expect(page.getByLabel("Idioma")).toHaveValue("es");
    } finally {
      await deletePhysio(physio);
    }
  });
});

test("the landing switcher turns the page Spanish", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Language" }).selectOption("es");
  await expect(page.getByRole("link", { name: "Empezar" })).toBeVisible();
});

test("a physio switches the app to Spanish in Settings", async ({ physioPage: page }) => {
  await page.goto("/settings");
  await page.getByLabel("Language").selectOption("es");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Guardado$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Configuración", level: 1 })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Idioma")).toHaveValue("es");
});
```

- [ ] **Step 2: Run it**

Run: `pnpm test:e2e e2e/i18n.spec.ts`
Expected: PASS on desktop and mobile. If a test fails, use superpowers:systematic-debugging
before changing app code.

- [ ] **Step 3: Run the whole e2e suite**

Run: `pnpm test:e2e`
Expected: PASS (existing English specs still pass with `locale: "en-US"`).

- [ ] **Step 4: Commit**

```bash
pnpm format && pnpm check
git add e2e/i18n.spec.ts
git commit -m "test(e2e): Spanish language flows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Make "every feature in every language" the documented rule

**Files:**

- Modify: `CLAUDE.md`
- Modify: `docs/architecture.md` (Languages row ~line 21, i18n tech row ~line 49, `messages/`
  tree line ~78, Strings convention ~line 193)
- Modify: `docs/specs/_template.md` (i18n section)
- Modify: `docs/specs/17-spanish-locale.md` (Status, rule 7, decisions, acceptance boxes)
- Modify: `docs/specs/README.md` (status column)

**Interfaces:** none (docs only).

- [ ] **Step 1: `CLAUDE.md`**

Replace the line `- Every user-visible string goes in \`messages/en.json\`; no hard-coded copy.`
with:

```markdown
- **i18n**: every user-visible string goes in **every** `messages/*.json` (`en`, `es`) in the
  same change; no hard-coded copy. Spanish is Rioplatense voseo ("ingresá", "elegí"). Format
  dates/numbers with next-intl (`getFormatter`/`useFormatter`) or `Intl` with the active locale,
  never a hard-coded `en-US`. `src/i18n/messages.test.ts` fails `pnpm check` on missing keys or
  mismatched ICU arguments/tags.
```

- [ ] **Step 2: `docs/architecture.md`**

- Languages row: replace `Ships with \`en\`.`with`Signed-out visitors get \`Accept-Language\`
  and a switcher. Ships with \`en\` and \`es\` (Rioplatense). Every feature ships in every
  locale.`
- `messages/` tree line: `translations (en.json, es.json)`.
- Strings convention: replace the bullet with:

```markdown
- **Strings**: every user-visible string goes in **every** `messages/<locale>.json` under a
  namespace per feature, in the same change (`src/i18n/messages.test.ts` enforces same keys,
  ICU arguments and tags). No hard-coded copy in components. Dates, numbers and lists use
  next-intl formatters or `Intl` with the active locale.
```

- [ ] **Step 3: `docs/specs/_template.md`** — replace the i18n section body with:

```markdown
New message namespaces, added to **every** `messages/*.json` (en + es, Spanish in Rioplatense
voseo). Locale-sensitive formatting (dates, numbers, week start).
```

- [ ] **Step 4: `docs/specs/17-spanish-locale.md`**

- Status → `Done`; tick the acceptance boxes that were verified.
- Rule 7: append "Sign-in only restores `physios.locale` into the cookie for onboarded physios."
- Rule 8 subject: `Tu link para ingresar · Your sign-in link — Physio Trainer`.
- Decisions made during implementation:
  - No `router.refresh()` in `LocaleSwitcher`: setting a cookie in a Server Action already
    re-renders the page (Next.js 16 docs, "Mutating data › Cookies").
  - `postSignInPath` no longer overwrites the cookie for non-onboarded physios (their row only
    has the `en` default), so a Spanish visitor onboards in Spanish.
  - `pickLocale` lets an unsupported cookie fall through to `Accept-Language` instead of
    forcing English.
  - The switcher is hidden on the landing page for signed-in physios.
  - Parity test uses `@formatjs/icu-messageformat-parser` (dev dependency) to compare ICU
    arguments and tags, and to reject invalid ICU.
  - Spanish wording: "link" (not "enlace"), "usuario" for handle, "Clientes" for customers,
    "Panel" for dashboard.

- [ ] **Step 5: `docs/specs/README.md`** — spec 17 status → `Done`.

- [ ] **Step 6: Commit**

```bash
pnpm format && pnpm check
git add CLAUDE.md docs
git commit -m "docs: every feature ships in every locale

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Final verification (before finishing the branch)

Use superpowers:verification-before-completion:

- `pnpm check` → PASS
- `pnpm test:int` (with `pnpm db:start`) → PASS (no DB changes, but profile saves `es` now)
- `pnpm test:e2e` → PASS on desktop and mobile

Then superpowers:requesting-code-review and superpowers:finishing-a-development-branch.
