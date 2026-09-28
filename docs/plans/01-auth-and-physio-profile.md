# Spec 01 · Auth and physio profile: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Physios sign in (magic link, env-gated Google), onboard with a public handle, edit
their profile, and every later spec gets a tested RLS data-access layer, route protection,
an integration-test harness and an e2e sign-in fixture.

**Architecture:** Supabase Auth issues sessions (cookies via `@supabase/ssr`). A
`physios` row is created by a Postgres trigger on `auth.users`. All table access is server-side
Drizzle: `runAsPhysio(claims, fn)` runs a transaction as the `authenticated` role with the
verified JWT claims so RLS applies, and `withPhysio(fn)` wraps it with the request's session.
The Supabase Data API is turned off. `src/proxy.ts` only does optimistic redirects; layouts and
data access do the real checks.

**Tech Stack:** Next.js 16 (App Router, Server Actions, `proxy.ts`), React 19, TypeScript,
Supabase (Auth, Postgres 17, CLI 2.118), Drizzle ORM 0.45 + drizzle-kit 0.31, zod 4,
next-intl 4, Tailwind v4 + shadcn/ui, Vitest 5, Playwright 1.63.

**Spec:** [`docs/specs/01-auth-and-physio-profile.md`](../specs/01-auth-and-physio-profile.md)
(read it and [`docs/architecture.md`](../architecture.md) before starting).

## Global Constraints

- Node 24 (`.nvmrc`). If `node --version` is below 22, run
  `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"` (or `nvm use`) first.
- Local Supabase must be running for integration and e2e tests: `pnpm db:start`.
- Next.js 16: `proxy.ts` not middleware; `params`, `searchParams`, `cookies()` are async. Check
  `node_modules/next/dist/docs/` before using an unfamiliar API. `typedRoutes` is on: literal
  `href`s are checked; `redirect()` takes a plain `string`.
- Every user-visible string goes in `messages/en.json`. No hard-coded copy.
- Accent colour uses the `primary` token only. Never hard-code colours.
- New top-level route ⇒ add it to `RESERVED_HANDLES` (`auth`, `login`, `onboarding`,
  `settings` are already reserved).
- Migrations: generate with `pnpm db:generate`; hand-written SQL only in the custom migration
  created with `drizzle-kit generate --custom`.
- `src/db`, `src/db/rls.ts` and `src/lib/supabase/server.ts` are server-only. Read env through
  `@/env`.
- Never pass non-action functions (e.g. lucide icons) from Server to Client Components. Server
  Actions passed as props are fine.
- Session verification uses `supabase.auth.getClaims()`, never `getSession()`, on the server.
- Run `pnpm format` before every commit (Prettier sorts Tailwind classes); `pnpm check` must
  pass before every commit.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

Failure modes the spec implies that would bite a real user; each has a test in the named task.

1. **Magic link opened in a different browser or device** than the one that requested it (no
   PKCE verifier cookie) must still sign in. → Task 8, e2e opens the emailed link in a fresh
   browser context.
2. **Hostile or looping `next` values** (`//evil`, `/\evil`, `%2F%2F`, `/login?next=…`) must
   land on a same-origin page, never another site or a redirect loop. → Task 1 unit tests;
   Task 7 e2e signs in with `next=//evil.example`.
3. **Handle taken between the availability check and save** (two physios racing) must show
   "already taken", not a 500, and must not poison the rest of the transaction. → Task 6
   integration tests (savepoint).
4. **Session gone while on a protected page** (signed out in another tab) must redirect to
   `/login?next=…` instead of rendering or mutating as nobody. → Task 10 e2e signs out, then
   opens `/settings`.
5. **Names with no Latin letters** (e.g. "李伟") must not blank the handle or suggest an invalid
   one. → Task 1 unit tests (`handleFromName`, `handleCandidates` fall back to `physio`);
   Task 9 component test keeps the suggested handle.

---

## File map

| File                                                                                                          | Responsibility                                                           | Task     |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------- |
| `src/lib/handles.ts`                                                                                          | Handle rules, problems, suggestions (pure)                               | 1        |
| `src/lib/redirects.ts`                                                                                        | `safeNextPath` (pure)                                                    | 1        |
| `src/lib/search-params.ts`                                                                                    | `firstParam` (pure)                                                      | 1        |
| `src/lib/timezones.ts`                                                                                        | Timezone validation and select options (pure)                            | 1        |
| `src/lib/auth/route-guard.ts`                                                                                 | Proxy redirect decisions (pure)                                          | 2        |
| `src/lib/supabase/proxy.ts`, `src/proxy.ts`                                                                   | Session refresh + route guard                                            | 2        |
| `supabase/config.toml`, `supabase/templates/*.html`                                                           | Local Auth/API config, email templates                                   | 3        |
| `vitest.int.config.mts`, `src/test/**`                                                                        | Integration harness and helpers                                          | 3, 4     |
| `src/db/schema/_columns.ts`, `src/db/schema/physios.ts`                                                       | Shared columns, `physios` table + RLS policies                           | 4        |
| `supabase/migrations/*`                                                                                       | Generated table migration + custom functions/triggers migration          | 4        |
| `src/db/errors.ts`                                                                                            | Postgres error helpers                                                   | 4        |
| `src/db/rls.ts`                                                                                               | `runAsPhysio`, `Tx`                                                      | 5        |
| `src/server/physios/{schemas,queries,mutations}.ts`                                                           | Profile validation, reads, writes                                        | 6        |
| `src/server/auth/session.ts`                                                                                  | `getSessionPhysio`, `withPhysio`, `requirePhysio`                        | 7        |
| `src/server/auth/post-sign-in.ts`                                                                             | Where to go after a session is created                                   | 7        |
| `src/server/i18n/locale-cookie.ts`                                                                            | `NEXT_LOCALE` cookie writer                                              | 7        |
| `src/app/auth/{confirm,callback}/route.ts`                                                                    | Magic-link and OAuth callbacks                                           | 7        |
| `e2e/helpers/{auth,mailpit}.ts`                                                                               | E2E physio factory, sign-in helper, `physioPage` fixture, Mailpit reader | 7, 8     |
| `src/lib/auth/login-errors.ts`                                                                                | Login error codes (pure)                                                 | 8        |
| `src/server/auth/{schemas,actions}.ts`                                                                        | Magic link, Google, sign out actions                                     | 8        |
| `src/components/ui/alert.tsx`                                                                                 | shadcn Alert                                                             | 8        |
| `src/components/auth/login-form.tsx`, `(auth)/login`                                                          | Login UI                                                                 | 8        |
| `src/components/physios/profile-form.tsx`                                                                     | Shared profile form                                                      | 9        |
| `src/server/physios/{actions,form-options}.ts`                                                                | Profile actions, form option builder                                     | 9        |
| `src/app/(auth)/onboarding/page.tsx`                                                                          | Onboarding page                                                          | 9        |
| `src/app/(app)/settings/page.tsx`, `src/components/user-menu.tsx`, `(app)/layout.tsx`, `(marketing)/page.tsx` | Settings, account menu, landing CTA                                      | 10       |
| `.github/workflows/ci.yml`, README, CLAUDE.md, spec                                                           | CI jobs and docs                                                         | 3, 7, 11 |

---

### Task 1: Pure helpers for handles, redirects, search params and timezones

**Files:**

- Modify: `src/lib/handles.ts`, `src/lib/handles.test.ts`
- Create: `src/lib/redirects.ts`, `src/lib/redirects.test.ts`
- Create: `src/lib/search-params.ts`, `src/lib/search-params.test.ts`
- Create: `src/lib/timezones.ts`, `src/lib/timezones.test.ts`

**Interfaces:**

- Consumes: existing `slugify`, `RESERVED_HANDLES`, `HANDLE_MIN_LENGTH`, `HANDLE_MAX_LENGTH`,
  `isValidHandle` in `src/lib/handles.ts`.
- Produces:
  - `type HandleProblem = "tooShort" | "tooLong" | "format" | "reserved"`
  - `handleProblem(handle: string): HandleProblem | null`
  - `isValidHandle(handle: string): boolean` (now `handleProblem(handle) === null`)
  - `handleFromName(displayName: string): string` (may return `""`)
  - `MAX_HANDLE_CANDIDATES = 20`; `handleCandidates(displayName: string): string[]`
  - `isPlaceholderHandle(handle: string): boolean`
  - `DEFAULT_REDIRECT = "/dashboard"`; `safeNextPath(value: string | null | undefined, fallback?: string): string`
  - `firstParam(value: string | string[] | undefined): string | undefined`
  - `normalizeTimeZone(value: string): string | null`; `isValidTimeZone(value: string): boolean`
  - `type TimeZoneOption = { value: string; label: string }`; `timeZoneOptions(now?: Date): TimeZoneOption[]`

- [ ] **Step 1: Write failing tests for the new handle helpers**

Append to `src/lib/handles.test.ts` (update the import line to include the new names):

```ts
import {
  HANDLE_MAX_LENGTH,
  MAX_HANDLE_CANDIDATES,
  RESERVED_HANDLES,
  handleCandidates,
  handleFromName,
  handleProblem,
  isPlaceholderHandle,
  isValidHandle,
  slugify,
} from "./handles";
```

```ts
describe("handleProblem", () => {
  it.each([
    ["ab", "tooShort"],
    ["a".repeat(31), "tooLong"],
    ["Maria", "format"],
    ["maria--lopez", "format"],
    ["-maria", "format"],
    ["maria_lopez", "format"],
    ["dashboard", "reserved"],
  ] as const)("%s → %s", (handle, problem) => {
    expect(handleProblem(handle)).toBe(problem);
  });

  it("returns null for a usable handle", () => {
    expect(handleProblem("maria-lopez")).toBeNull();
  });
});

describe("handleFromName", () => {
  it("slugifies and fits the maximum length without a trailing hyphen", () => {
    expect(handleFromName("María López")).toBe("maria-lopez");
    expect(handleFromName("abcdefghijklmnopqrstuvwxyzabc d")).toBe("abcdefghijklmnopqrstuvwxyzabc");
  });

  it("returns an empty string for names without Latin letters or digits", () => {
    expect(handleFromName("李伟")).toBe("");
  });
});

describe("handleCandidates", () => {
  it("starts with the slug and continues with numbered variants", () => {
    const candidates = handleCandidates("María López");
    expect(candidates.slice(0, 3)).toEqual(["maria-lopez", "maria-lopez-2", "maria-lopez-3"]);
    expect(candidates).toHaveLength(MAX_HANDLE_CANDIDATES);
  });

  it("truncates the base so numbered variants fit, without double hyphens", () => {
    const candidates = handleCandidates("abcdefghijklmnopqrstuvwxyza bcd");
    expect(candidates[0]).toBe("abcdefghijklmnopqrstuvwxyza-bc");
    expect(candidates[1]).toBe("abcdefghijklmnopqrstuvwxyza-2");
    expect(candidates[9]).toBe("abcdefghijklmnopqrstuvwxyza-10");
    for (const candidate of candidates) {
      expect(candidate.length).toBeLessThanOrEqual(HANDLE_MAX_LENGTH);
      expect(candidate).not.toContain("--");
    }
  });

  it("falls back to a 'physio' base when the name gives fewer than 3 usable characters", () => {
    expect(handleCandidates("Al")[0]).toBe("physio");
    expect(handleCandidates("李伟").slice(0, 2)).toEqual(["physio", "physio-2"]);
  });

  it("skips reserved handles", () => {
    expect(handleCandidates("Admin").slice(0, 2)).toEqual(["admin-2", "admin-3"]);
  });

  it("only yields valid handles", () => {
    for (const candidate of handleCandidates("Dr. Émile O'Brien-Smith")) {
      expect(isValidHandle(candidate)).toBe(true);
    }
  });
});

describe("isPlaceholderHandle", () => {
  it("recognises the handle created at sign-up", () => {
    expect(isPlaceholderHandle("physio-1a2b3c4d")).toBe(true);
    expect(isPlaceholderHandle("physio-2")).toBe(false);
    expect(isPlaceholderHandle("maria-lopez")).toBe(false);
  });
});
```

- [ ] **Step 2: Write failing tests for redirects, search params and timezones**

`src/lib/redirects.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { safeNextPath } from "./redirects";

describe("safeNextPath", () => {
  it.each(["/customers", "/customers/42?tab=plans", "/routines#top", "/settings"])(
    "keeps %s",
    (path) => {
      expect(safeNextPath(path)).toBe(path);
    },
  );

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["absolute URL", "https://evil.example/x"],
    ["protocol-relative URL", "//evil.example"],
    ["backslash", "/\\evil.example"],
    ["javascript scheme", "javascript:alert(1)"],
    ["encoded slashes", "/%2F%2Fevil.example"],
    ["encoded backslash", "/%5Cevil.example"],
    ["control character", "/\tevil"],
    ["path without leading slash", "customers"],
    ["login page (loop)", "/login?next=/customers"],
    ["auth route", "/auth/confirm?token_hash=x"],
  ])("falls back for %s", (_label, value) => {
    expect(safeNextPath(value)).toBe("/dashboard");
  });

  it("uses the given fallback", () => {
    expect(safeNextPath(null, "/")).toBe("/");
  });
});
```

`src/lib/search-params.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { firstParam } from "./search-params";

describe("firstParam", () => {
  it("returns the first string value", () => {
    expect(firstParam("a")).toBe("a");
    expect(firstParam(["a", "b"])).toBe("a");
    expect(firstParam(undefined)).toBeUndefined();
  });
});
```

`src/lib/timezones.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { isValidTimeZone, normalizeTimeZone, timeZoneOptions } from "./timezones";

describe("normalizeTimeZone", () => {
  it("accepts IANA zones and UTC, returning the canonical name", () => {
    expect(normalizeTimeZone("Europe/Madrid")).toBe("Europe/Madrid");
    expect(normalizeTimeZone("UTC")).toBe("UTC");
    expect(normalizeTimeZone("utc")).toBe("UTC");
  });

  it.each(["Mars/Base", "", "not a zone"])("rejects %j", (value) => {
    expect(normalizeTimeZone(value)).toBeNull();
    expect(isValidTimeZone(value)).toBe(false);
  });
});

describe("timeZoneOptions", () => {
  const january = new Date("2026-01-15T12:00:00Z");

  it("lists UTC first, then every supported zone once", () => {
    const values = timeZoneOptions(january).map((option) => option.value);
    expect(values[0]).toBe("UTC");
    expect(values).toContain("Europe/Madrid");
    expect(new Set(values).size).toBe(values.length);
  });

  it("labels zones with a readable name and their offset on the given date", () => {
    const labels = new Map(timeZoneOptions(january).map((option) => [option.value, option.label]));
    expect(labels.get("Europe/Madrid")).toBe("Europe/Madrid (GMT+1)");
    expect(labels.get("America/New_York")).toBe("America/New York (GMT-5)");
    expect(labels.get("Asia/Kolkata")).toBe("Asia/Kolkata (GMT+5:30)");
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `pnpm test src/lib`
Expected: FAIL: `handleProblem`, `handleFromName`, `handleCandidates`, `isPlaceholderHandle`,
`MAX_HANDLE_CANDIDATES` are not exported; `./redirects`, `./search-params`, `./timezones`
cannot be resolved.

- [ ] **Step 4: Implement the handle helpers**

In `src/lib/handles.ts`, replace `isValidHandle` with the block below (keep `RESERVED_HANDLES`,
`HANDLE_PATTERN`, the length constants and `slugify` as they are):

```ts
export type HandleProblem = "tooShort" | "tooLong" | "format" | "reserved";

/** The first rule a handle breaks, or null when it can be used (uniqueness is checked in the DB). */
export function handleProblem(handle: string): HandleProblem | null {
  if (handle.length < HANDLE_MIN_LENGTH) return "tooShort";
  if (handle.length > HANDLE_MAX_LENGTH) return "tooLong";
  if (!HANDLE_PATTERN.test(handle)) return "format";
  if (RESERVED_HANDLES.has(handle)) return "reserved";
  return null;
}

export function isValidHandle(handle: string): boolean {
  return handleProblem(handle) === null;
}

/** Handle derived from a display name as the physio types it. May be "" (e.g. "李伟"). */
export function handleFromName(displayName: string): string {
  return fitHandle(slugify(displayName), HANDLE_MAX_LENGTH);
}

export const MAX_HANDLE_CANDIDATES = 20;
const FALLBACK_HANDLE_BASE = "physio";

/**
 * Suggestions in order of preference: "maria-lopez", "maria-lopez-2", … Only valid handles;
 * the caller picks the first one that is not taken.
 */
export function handleCandidates(displayName: string): string[] {
  const slug = handleFromName(displayName);
  const base = slug.length >= HANDLE_MIN_LENGTH ? slug : FALLBACK_HANDLE_BASE;
  const candidates: string[] = [];
  for (
    let n = 1;
    candidates.length < MAX_HANDLE_CANDIDATES && n <= MAX_HANDLE_CANDIDATES * 2;
    n++
  ) {
    const suffix = n === 1 ? "" : `-${n}`;
    const candidate = fitHandle(base, HANDLE_MAX_LENGTH - suffix.length) + suffix;
    if (isValidHandle(candidate)) candidates.push(candidate);
  }
  return candidates;
}

const PLACEHOLDER_HANDLE = /^physio-[0-9a-f]{8}$/;

/** True for the random handle the sign-up trigger assigns before onboarding. */
export function isPlaceholderHandle(handle: string): boolean {
  return PLACEHOLDER_HANDLE.test(handle);
}

function fitHandle(value: string, maxLength: number): string {
  return value.slice(0, maxLength).replace(/-+$/, "");
}
```

- [ ] **Step 5: Implement redirects, search params and timezones**

`src/lib/redirects.ts`:

```ts
export const DEFAULT_REDIRECT = "/dashboard";

const BASE = "http://placeholder.invalid";

/**
 * Returns `value` only if it is a same-origin path that is safe to redirect to after sign-in.
 * Anything else (other origins, protocol-relative or encoded tricks, auth pages that would
 * loop) returns `fallback`.
 */
export function safeNextPath(
  value: string | null | undefined,
  fallback: string = DEFAULT_REDIRECT,
): string {
  if (!value || !value.startsWith("/") || hasUnsafeCharacters(value)) return fallback;

  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;

  const path = `${url.pathname}${url.search}${url.hash}`;
  if (/^\/(?:\/|%2f|%5c)/i.test(path)) return fallback;
  if (url.pathname === "/login" || url.pathname.startsWith("/auth/")) return fallback;
  return path;
}

// Browsers treat "\" like "/" and drop tabs/newlines, which turns "/\evil" into "//evil".
function hasUnsafeCharacters(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (char === "\\" || code < 0x20 || code === 0x7f) return true;
  }
  return false;
}
```

`src/lib/search-params.ts`:

```ts
/** Next.js searchParams values can repeat; pages only ever want the first one. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
```

`src/lib/timezones.ts`:

```ts
/**
 * Canonical IANA name for a time zone, or null if the runtime does not know it.
 * Uses DateTimeFormat rather than Intl.supportedValuesOf, which omits "UTC" in V8.
 */
export function normalizeTimeZone(value: string): string | null {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export function isValidTimeZone(value: string): boolean {
  return normalizeTimeZone(value) !== null;
}

export type TimeZoneOption = { value: string; label: string };

/** Options for a timezone <select>: UTC first, then every zone, labelled "Europe/Madrid (GMT+1)". */
export function timeZoneOptions(now: Date = new Date()): TimeZoneOption[] {
  const zones = ["UTC", ...Intl.supportedValuesOf("timeZone").filter((zone) => zone !== "UTC")];
  return zones.map((zone) => ({
    value: zone,
    label: `${zone.replaceAll("_", " ")} (${offsetLabel(zone, now)})`,
  }));
}

function offsetLabel(timeZone: string, date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  return parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `pnpm test src/lib`
Expected: PASS (all files in `src/lib`).

- [ ] **Step 7: Check and commit**

```bash
pnpm format && pnpm check
git add src/lib
git commit -m "Add handle, redirect, search-param and timezone helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Route guard in the proxy

**Files:**

- Create: `src/lib/auth/route-guard.ts`, `src/lib/auth/route-guard.test.ts`
- Modify: `src/lib/supabase/proxy.ts`, `src/proxy.ts`
- Modify: `e2e/smoke.spec.ts` (the workspace test now expects a redirect; Task 7 restores a
  signed-in version)

**Interfaces:**

- Consumes: `safeNextPath` (Task 1).
- Produces:
  - `PROTECTED_PREFIXES: readonly string[]`; `isProtectedPath(pathname: string): boolean`
  - `routeGuard(pathname: string, search: string, signedIn: boolean): string | null`
    (a path to redirect to, or null to continue)
  - `updateSession(request): Promise<{ response: NextResponse; signedIn: boolean }>`

- [ ] **Step 1: Write the failing test**

`src/lib/auth/route-guard.test.ts`:

```ts
import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isProtectedPath, routeGuard } from "./route-guard";

describe("routeGuard", () => {
  it("sends signed-out visitors of protected pages to login with a next param", () => {
    expect(routeGuard("/customers", "", false)).toBe("/login?next=%2Fcustomers");
    expect(routeGuard("/customers/42", "?tab=plans", false)).toBe(
      "/login?next=%2Fcustomers%2F42%3Ftab%3Dplans",
    );
    expect(routeGuard("/onboarding", "", false)).toBe("/login?next=%2Fonboarding");
  });

  it.each(["/", "/login", "/maria-lopez/ana-7k2m9qpx", "/auth/confirm", "/customersx"])(
    "lets signed-out visitors through to %s",
    (pathname) => {
      expect(routeGuard(pathname, "", false)).toBeNull();
    },
  );

  it("sends signed-in physios away from the login page", () => {
    expect(routeGuard("/login", "", true)).toBe("/dashboard");
    expect(routeGuard("/login", "?next=%2Fcustomers", true)).toBe("/customers");
    expect(routeGuard("/login", "?next=%2F%2Fevil.example", true)).toBe("/dashboard");
  });

  it("lets signed-in physios through to protected pages", () => {
    expect(routeGuard("/customers", "", true)).toBeNull();
  });
});

describe("PROTECTED_PREFIXES", () => {
  // Every page in the physio workspace must be behind the login redirect.
  it("covers every route folder in src/app/(app)", () => {
    const appDir = path.resolve(__dirname, "../../app/(app)");
    const folders = readdirSync(appDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    expect(folders.length).toBeGreaterThan(0);
    for (const folder of folders) {
      expect(isProtectedPath(`/${folder}`), `/${folder} must be protected`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `pnpm test src/lib/auth`
Expected: FAIL, cannot resolve `./route-guard`.

- [ ] **Step 3: Implement the route guard**

`src/lib/auth/route-guard.ts`:

```ts
import { safeNextPath } from "@/lib/redirects";

/** Paths that need a signed-in physio. Keep in sync with src/app/(app) (a test enforces it). */
export const PROTECTED_PREFIXES = [
  "/dashboard",
  "/customers",
  "/library",
  "/routines",
  "/plans",
  "/settings",
  "/onboarding",
] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Optimistic redirect decision for the proxy. Returns the path to redirect to, or null.
 * The real checks are requirePhysio()/withPhysio() on the server.
 */
export function routeGuard(pathname: string, search: string, signedIn: boolean): string | null {
  if (!signedIn && isProtectedPath(pathname)) {
    return `/login?${new URLSearchParams({ next: `${pathname}${search}` })}`;
  }
  if (signedIn && pathname === "/login") {
    return safeNextPath(new URLSearchParams(search).get("next"));
  }
  return null;
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `pnpm test src/lib/auth`
Expected: PASS.

- [ ] **Step 5: Return the session state from `updateSession` and apply the guard**

In `src/lib/supabase/proxy.ts`, change the doc comment, the signature and the end of the
function:

```ts
/**
 * Refreshes the Supabase auth session cookie on every request and reports whether the
 * request carries a valid session (JWT verified by getClaims).
 */
export async function updateSession(
  request: NextRequest,
): Promise<{ response: NextResponse; signedIn: boolean }> {
```

```ts
  // Do not add code between createServerClient and getClaims(): it validates the JWT
  // and triggers the cookie refresh above.
  const { data } = await supabase.auth.getClaims();

  return { response, signedIn: data?.claims.role === "authenticated" };
}
```

Replace `src/proxy.ts` with:

```ts
import { NextResponse, type NextRequest } from "next/server";

import { routeGuard } from "@/lib/auth/route-guard";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const { response, signedIn } = await updateSession(request);
  const target = routeGuard(request.nextUrl.pathname, request.nextUrl.search, signedIn);
  if (!target) return response;

  const redirect = NextResponse.redirect(new URL(target, request.url));
  // Keep any refreshed session cookies on the redirect.
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export const config = {
  matcher: [
    // Skip static assets, image optimisation, the health check and files with an extension.
    "/((?!_next/static|_next/image|api/health|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)",
  ],
};
```

- [ ] **Step 6: Update the smoke test that visits the workspace signed out**

In `e2e/smoke.spec.ts`, replace the `"physio workspace shows navigation"` test with:

```ts
test("signed-out visitors of the workspace are sent to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
});
```

- [ ] **Step 7: Create `.env.local`**

`pnpm test:e2e` builds the app, which validates env. Start local Supabase and write the
(gitignored) env file from its keys:

```bash
pnpm db:start
eval "$(pnpm exec supabase status -o env | grep -E '^(PUBLISHABLE_KEY|SECRET_KEY)=')"
cat > .env.local <<EOF
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=$SECRET_KEY
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=false
EOF
```

- [ ] **Step 8: Verify and commit**

Run: `pnpm format && pnpm check`, then `pnpm test:e2e e2e/smoke.spec.ts`
Expected: all green.

```bash
git add src/lib/auth src/lib/supabase/proxy.ts src/proxy.ts e2e/smoke.spec.ts
git commit -m "Redirect signed-out requests to protected pages to login

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Local Supabase configuration and integration-test harness

**Files:**

- Modify: `supabase/config.toml`
- Create: `supabase/templates/magic_link.html`, `supabase/templates/confirmation.html`
- Create: `vitest.int.config.mts`, `src/test/server-only.ts`, `src/test/int/supabase.ts`,
  `src/test/int/data-api.int.test.ts`
- Modify: `vitest.config.mts`, `package.json`, `.env.example`, `src/env.ts`,
  `.github/workflows/ci.yml`

**Interfaces:**

- Produces:
  - `pnpm test:int` (Vitest, `src/**/*.int.test.ts`, node environment, `.env.local` loaded,
    `server-only` stubbed)
  - `adminClient` (supabase-js with the secret key), `testClaims(sub: string, email?: string): JwtPayload`,
    `signInTestUser(email: string): Promise<string>` (returns an access token) in
    `src/test/int/supabase.ts`
  - `env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: boolean`

- [ ] **Step 1: Configure local Supabase**

Edit `supabase/config.toml`:

1. Under `[api]`, set `enabled = false` and add a comment above it:

   ```toml
   [api]
   # The Data API (PostgREST/GraphQL) is off: all table access is server-side through Drizzle
   # (docs/architecture.md, rule 6). `schemas = []` is not enough: PostgREST falls back to public.
   enabled = false
   ```

2. Replace the `additional_redirect_urls` line with:

   ```toml
   additional_redirect_urls = ["http://localhost:*/auth/**", "http://127.0.0.1:*/auth/**"]
   ```

3. Replace the `# Uncomment to customize email template` block's position with (keep the
   commented invite example below it):

   ```toml
   # Magic-link emails point at /auth/confirm with a token_hash so they work on any device.
   # New users get "magic_link" locally; hosted projects with confirmations on send
   # "confirmation", so both use the same template.
   [auth.email.template.magic_link]
   subject = "Your Physio Trainer sign-in link"
   content_path = "./supabase/templates/magic_link.html"

   [auth.email.template.confirmation]
   subject = "Your Physio Trainer sign-in link"
   content_path = "./supabase/templates/confirmation.html"
   ```

4. Directly above `[auth.external.apple]`, add:

   ```toml
   # Google sign-in. To try it locally: export SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID and
   # SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET, set enabled = true, restart Supabase, and set
   # NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true in .env.local. Never commit the secret.
   [auth.external.google]
   enabled = false
   client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"
   secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"
   skip_nonce_check = true
   ```

`supabase/templates/magic_link.html` (and the identical `confirmation.html`):

```html
<h2>Sign in to Physio Trainer</h2>
<p>Use this link to sign in. It works once and expires in one hour.</p>
<p><a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">Sign in</a></p>
<p>If you didn't ask for this email, you can ignore it.</p>
```

(`RedirectTo` is `<NEXT_PUBLIC_APP_URL>/auth/confirm?next=…`, set by the sign-in action in
Task 8. A redirect URL that is not allow-listed falls back to the Site URL and breaks the link,
which is why the allow-list uses port globs.)

- [ ] **Step 2: Restart Supabase with the new config**

Run: `pnpm db:stop && pnpm db:start`
Expected: it starts; `docker ps` shows no `supabase_rest_*` container. The keys are unchanged,
so `.env.local` from Task 2 still works.

- [ ] **Step 3: Add the Google flag to the env schema and example**

In `src/env.ts`, add to `client` and `runtimeEnv`:

```ts
    // Shows "Continue with Google" on /login once the provider is configured in Supabase.
    NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: z.stringbool().default(false),
```

```ts
    NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED,
```

Append to `.env.example`:

```bash
# Show "Continue with Google" on /login (needs the Google provider enabled in Supabase)
NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=false

# Only for trying Google sign-in against local Supabase (read by supabase/config.toml).
# Export them in your shell before `pnpm db:start`; never commit real values.
# SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=
# SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=
```

- [ ] **Step 4: Create the integration-test config and helpers**

`vitest.int.config.mts`:

```ts
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Integration tests run against local Supabase (`pnpm db:start`) using .env.local.
config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // `server-only` throws outside React Server Components; tests are server code.
      "server-only": fileURLToPath(new URL("./src/test/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.int.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
```

`src/test/server-only.ts`:

```ts
// Stand-in for the `server-only` package in integration tests (see vitest.int.config.mts).
export {};
```

In `vitest.config.mts`, keep integration tests out of `pnpm test`:

```ts
import { configDefaults, defineConfig } from "vitest/config";
```

```ts
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: [...configDefaults.exclude, "src/**/*.int.test.ts"],
```

In `package.json` scripts, after `"test:watch"`:

```json
    "test:int": "vitest run --config vitest.int.config.mts",
```

`src/test/int/supabase.ts`:

```ts
import { createClient, type JwtPayload } from "@supabase/supabase-js";

import { env } from "@/env";

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

/** Supabase client with the secret key: admin API (create/delete users, generate links). */
export const adminClient = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  noSession,
);

/** JWT claims shaped like the ones getClaims() returns, for runAsPhysio in tests. */
export function testClaims(sub: string, email?: string): JwtPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: "integration-tests",
    sub,
    aud: "authenticated",
    exp: now + 3600,
    iat: now,
    role: "authenticated",
    aal: "aal1",
    session_id: crypto.randomUUID(),
    email,
  };
}

/** Signs an existing user in without email and returns their access token. */
export async function signInTestUser(email: string): Promise<string> {
  const link = await adminClient.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw link.error;
  const client = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    noSession,
  );
  const { data, error } = await client.auth.verifyOtp({
    type: "email",
    token_hash: link.data.properties.hashed_token,
  });
  if (error || !data.session) throw error ?? new Error("verifyOtp returned no session");
  return data.session.access_token;
}
```

- [ ] **Step 5: Write the Data API test**

`src/test/int/data-api.int.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { env } from "@/env";

import { adminClient, signInTestUser } from "./supabase";

describe("Supabase Data API", () => {
  const email = `int-data-api-${crypto.randomUUID()}@example.test`;
  let userId: string;
  let accessToken: string;

  beforeAll(async () => {
    const { data, error } = await adminClient.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
    accessToken = await signInTestUser(email);
  });

  afterAll(async () => {
    await adminClient.auth.admin.deleteUser(userId);
  });

  // All table access goes through Drizzle on the server (docs/architecture.md, rule 6).
  it.each(["/rest/v1/physios?select=id", "/rest/v1/"])(
    "refuses %s for a signed-in user",
    async (path) => {
      const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}${path}`, {
        headers: {
          apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
      });
      expect(response.ok).toBe(false);
    },
  );

  it("refuses GraphQL", async () => {
    const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/graphql/v1`, {
      method: "POST",
      headers: {
        apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: "{ __typename }" }),
    });
    expect(response.ok).toBe(false);
  });
});
```

- [ ] **Step 6: Run it and see it pass; prove it would fail with the API on**

Run: `pnpm test:int`
Expected: PASS (3 tests; the requests get `503`).

Then temporarily set `[api] enabled = true` in `supabase/config.toml`, run
`pnpm db:stop && pnpm db:start && pnpm test:int` and confirm the `/rest/v1/` test FAILS (200).
Set it back to `false`, restart (`pnpm db:stop && pnpm db:start`) and rerun: PASS.

- [ ] **Step 7: Run integration tests in CI**

In `.github/workflows/ci.yml`:

1. Move `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ci-placeholder` and
   `SUPABASE_SECRET_KEY: ci-placeholder` from the top-level `env` into a job-level `env` on the
   `check` job (values set through `$GITHUB_ENV` must not compete with workflow-level `env`).
   Update the top-level comment to: `# Shared, non-secret local values. Jobs that need
Supabase start it and export its keys.`
2. Add this job:

```yaml
integration:
  name: Integration tests (local Supabase)
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with:
        node-version-file: .nvmrc
        cache: pnpm
    - run: pnpm install --frozen-lockfile
    - name: Migrations match the Drizzle schema
      run: pnpm db:generate && git diff --exit-code supabase/migrations
    - name: Start Supabase
      run: pnpm exec supabase start -x studio,imgproxy,vector,logflare,edge-runtime,realtime
    - name: Export Supabase keys
      run: |
        pnpm exec supabase status -o env \
          | sed -n -e 's/^PUBLISHABLE_KEY=/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=/p' \
                   -e 's/^SECRET_KEY=/SUPABASE_SECRET_KEY=/p' \
          | tr -d '"' >> "$GITHUB_ENV"
    - run: pnpm test:int
```

(The Supabase CLI is a pinned devDependency, so `pnpm exec supabase` uses the lockfile version.)

- [ ] **Step 8: Verify and commit**

Run: `pnpm format && pnpm check && pnpm test:int`
Expected: all green; `pnpm test` does not pick up `*.int.test.ts`.

```bash
git add supabase/config.toml supabase/templates vitest.int.config.mts vitest.config.mts \
  src/test package.json .env.example src/env.ts .github/workflows/ci.yml
git commit -m "Configure local Supabase auth, close the Data API, add integration harness

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `physios` table, sign-up trigger, shared functions and schema guards

**Files:**

- Create: `src/db/schema/_columns.ts`, `src/db/schema/physios.ts`, `src/db/errors.ts`
- Modify: `src/db/schema/index.ts`
- Create (generated): `supabase/migrations/<ts>_physios.sql`, `supabase/migrations/meta/*`
- Create (custom): `supabase/migrations/<ts>_physios-auth.sql`
- Create: `src/test/int/physios.ts`, `src/db/physios.int.test.ts`,
  `src/db/schema-conventions.int.test.ts`

**Interfaces:**

- Consumes: `adminClient`, `testClaims` (Task 3).
- Produces:
  - `timestamps` column helper; `physios` table; `type Physio = typeof physios.$inferSelect`
  - SQL: `public.set_updated_at()`, `public.handle_new_user()` (trigger on `auth.users`),
    `public.is_handle_available(candidate text) returns boolean`
  - `isUniqueViolation(error: unknown, constraint?: string): boolean`
  - `type TestPhysio = { id: string; email: string; claims: JwtPayload }`;
    `createTestPhysio(options?: { onboarded?: boolean; handle?: string; userMetadata?: Record<string, unknown> }): Promise<TestPhysio>`;
    `deleteTestPhysios(...physios: TestPhysio[]): Promise<void>`

- [ ] **Step 1: Write the failing integration tests**

`src/test/int/physios.ts`:

```ts
import type { JwtPayload } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { physios } from "@/db/schema";

import { adminClient, testClaims } from "./supabase";

export type TestPhysio = { id: string; email: string; claims: JwtPayload };

/** Creates an auth user (the trigger creates the physios row) with a unique email. */
export async function createTestPhysio(
  options: { onboarded?: boolean; handle?: string; userMetadata?: Record<string, unknown> } = {},
): Promise<TestPhysio> {
  const email = `int-${crypto.randomUUID()}@example.test`;
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: options.userMetadata ?? {},
  });
  if (error) throw error;
  const id = data.user.id;

  if (options.onboarded || options.handle) {
    await db
      .update(physios)
      .set({
        handle: options.handle ?? `int-${id.slice(0, 8)}`,
        ...(options.onboarded ? { onboardedAt: new Date() } : {}),
      })
      .where(eq(physios.id, id));
  }
  return { id, email, claims: testClaims(id, email) };
}

export async function deleteTestPhysios(...testPhysios: TestPhysio[]): Promise<void> {
  await Promise.all(testPhysios.map((physio) => adminClient.auth.admin.deleteUser(physio.id)));
}
```

`src/db/physios.int.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { physios } from "@/db/schema";
import { isPlaceholderHandle } from "@/lib/handles";
import { adminClient } from "@/test/int/supabase";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

const created: TestPhysio[] = [];
async function newPhysio(...args: Parameters<typeof createTestPhysio>) {
  const physio = await createTestPhysio(...args);
  created.push(physio);
  return physio;
}
async function rowOf(id: string) {
  const [row] = await db.select().from(physios).where(eq(physios.id, id));
  return row;
}

afterAll(() => deleteTestPhysios(...created));

describe("physios sign-up trigger", () => {
  it("creates a row with a placeholder handle and defaults", async () => {
    const physio = await newPhysio({ userMetadata: { full_name: "Ana Ruiz" } });
    const row = await rowOf(physio.id);
    expect(row).toMatchObject({
      email: physio.email,
      displayName: "Ana Ruiz",
      locale: "en",
      timezone: "UTC",
      onboardedAt: null,
    });
    expect(isPlaceholderHandle(row.handle)).toBe(true);
  });

  it("uses Google's 'name' when 'full_name' is missing", async () => {
    const physio = await newPhysio({ userMetadata: { name: "Leo Park" } });
    expect((await rowOf(physio.id)).displayName).toBe("Leo Park");
  });

  it("falls back to the email local part", async () => {
    const physio = await newPhysio();
    expect((await rowOf(physio.id)).displayName).toBe(physio.email.split("@")[0]);
  });

  it("truncates long names to 80 characters", async () => {
    const physio = await newPhysio({ userMetadata: { full_name: "x".repeat(120) } });
    expect((await rowOf(physio.id)).displayName).toHaveLength(80);
  });

  it("removes the row when the auth user is deleted", async () => {
    const physio = await createTestPhysio();
    await adminClient.auth.admin.deleteUser(physio.id);
    expect(await rowOf(physio.id)).toBeUndefined();
  });
});

describe("physios table", () => {
  it("bumps updated_at on update", async () => {
    const physio = await newPhysio();
    const before = (await rowOf(physio.id)).updatedAt;
    await db.update(physios).set({ displayName: "Updated" }).where(eq(physios.id, physio.id));
    expect((await rowOf(physio.id)).updatedAt.getTime()).toBeGreaterThan(before.getTime());
  });

  it.each(["Bad Handle", "ab", "-edge", "a".repeat(31)])(
    "rejects the handle %j",
    async (handle) => {
      const physio = await newPhysio();
      await expect(
        db.update(physios).set({ handle }).where(eq(physios.id, physio.id)),
      ).rejects.toThrow();
    },
  );

  it("rejects an empty display name", async () => {
    const physio = await newPhysio();
    await expect(
      db.update(physios).set({ displayName: "" }).where(eq(physios.id, physio.id)),
    ).rejects.toThrow();
  });
});
```

`src/db/schema-conventions.int.test.ts`:

```ts
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";

// Guards for every later spec: see docs/architecture.md (tenancy rule 1, column conventions).
describe("schema conventions", () => {
  it("enables RLS on every public table", async () => {
    const rows = await db.execute<{ table_name: string }>(sql`
      select c.relname as table_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(rows.map((row) => row.table_name)).toEqual([]);
  });

  it("attaches set_updated_at to every table with an updated_at column", async () => {
    const rows = await db.execute<{ table_name: string; has_trigger: boolean }>(sql`
      select c.table_name,
        exists (
          select 1
          from pg_trigger t
          join pg_class r on r.oid = t.tgrelid
          join pg_namespace n on n.oid = r.relnamespace
          join pg_proc p on p.oid = t.tgfoid
          where n.nspname = 'public'
            and r.relname = c.table_name
            and p.proname = 'set_updated_at'
            and not t.tgisinternal
        ) as has_trigger
      from information_schema.columns c
      where c.table_schema = 'public' and c.column_name = 'updated_at'`);

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((row) => !row.has_trigger).map((row) => row.table_name)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test:int src/db`
Expected: FAIL: `physios` is not exported from `@/db/schema`.

- [ ] **Step 3: Define the schema**

`src/db/schema/_columns.ts`:

```ts
import { timestamp } from "drizzle-orm/pg-core";

/**
 * created_at / updated_at for every table. updated_at is maintained by the shared
 * set_updated_at() trigger: attach it in the table's custom migration (a test enforces it).
 */
export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
};
```

`src/db/schema/physios.ts`:

```ts
import { sql } from "drizzle-orm";
import { check, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authenticatedRole, authUid, authUsers } from "drizzle-orm/supabase";

import { timestamps } from "./_columns";

/** One row per physio, 1:1 with auth.users. Created by the handle_new_user() trigger. */
export const physios = pgTable(
  "physios",
  {
    id: uuid()
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    email: text().notNull(),
    displayName: text().notNull(),
    handle: text().notNull().unique(),
    locale: text().notNull().default("en"),
    timezone: text().notNull().default("UTC"),
    onboardedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    check(
      "physios_handle_format",
      sql`${table.handle} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(${table.handle}) between 3 and 30`,
    ),
    check("physios_display_name_length", sql`char_length(${table.displayName}) between 1 and 80`),
    pgPolicy("physios_select_own", {
      for: "select",
      to: authenticatedRole,
      using: sql`${table.id} = ${authUid}`,
    }),
    pgPolicy("physios_update_own", {
      for: "update",
      to: authenticatedRole,
      using: sql`${table.id} = ${authUid}`,
      withCheck: sql`${table.id} = ${authUid}`,
    }),
  ],
);

export type Physio = typeof physios.$inferSelect;
```

Replace `src/db/schema/index.ts` with:

```ts
/**
 * Drizzle schema: the single source of truth for the database.
 * One file per domain area, re-exported from here.
 */
export * from "./physios";
```

`src/db/errors.ts`:

```ts
type PgErrorLike = { code?: unknown; constraint_name?: unknown; cause?: unknown };

/** True when `error` (possibly wrapped by Drizzle) is a Postgres unique violation. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pgError = findPgError(error);
  return (
    pgError?.code === "23505" &&
    (constraint === undefined || pgError.constraint_name === constraint)
  );
}

function findPgError(error: unknown): PgErrorLike | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
    const candidate = current as PgErrorLike;
    if (typeof candidate.code === "string") return candidate;
    current = candidate.cause;
  }
  return null;
}
```

- [ ] **Step 4: Generate the table migration and check it**

Run: `pnpm db:generate --name=physios`
Expected: a new `supabase/migrations/<timestamp>_physios.sql` plus `meta/` snapshot. Open the
SQL and confirm it contains, in some form:

- `CREATE TABLE "physios"` with `CONSTRAINT "physios_handle_unique" UNIQUE("handle")`, both
  `CHECK` constraints, and the FK to `"auth"."users"("id") ON DELETE cascade`;
- `ALTER TABLE "physios" ENABLE ROW LEVEL SECURITY`;
- `CREATE POLICY "physios_select_own"` and `"physios_update_own"` `TO authenticated` using
  `(select auth.uid())`.

It must NOT create `auth.users` or any role. If the constraint name differs from
`physios_handle_unique`, use the generated name in Task 6's `isUniqueViolation` call.

- [ ] **Step 5: Create the custom migration**

Run: `pnpm exec drizzle-kit generate --custom --name=physios-auth`
Then put this in the new `supabase/migrations/<timestamp>_physios-auth.sql`:

```sql
-- Shared trigger function: keeps updated_at current. Every table with an updated_at column
-- attaches it in its own custom migration (enforced by schema-conventions.int.test.ts).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger physios_set_updated_at
  before update on public.physios
  for each row execute function public.set_updated_at();

-- Creates the physio profile when someone signs up (magic link or Google). Onboarding
-- replaces the placeholder handle.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  name text := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Physio'
  );
begin
  insert into public.physios (id, email, display_name, handle)
  values (
    new.id,
    coalesce(new.email, ''),
    left(name, 80),
    'physio-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8)
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS hides other physios' rows, so availability needs a definer function. It only reveals
-- a boolean, and handles are public in share links anyway. The unique index stays the guard.
create or replace function public.is_handle_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.physios
    where handle = candidate
      and id is distinct from (select auth.uid())
  );
$$;

revoke execute on function public.is_handle_available(text) from public, anon;
grant execute on function public.is_handle_available(text) to authenticated;
```

- [ ] **Step 6: Apply the migrations and run the tests**

Run: `pnpm db:reset && pnpm test:int src/db`
Expected: `db:reset` applies both migrations; tests PASS.

- [ ] **Step 7: Verify and commit**

Run: `pnpm format && pnpm check && pnpm test:int`

```bash
git add src/db src/test/int/physios.ts supabase/migrations
git commit -m "Add physios table with sign-up trigger, RLS policies and schema guards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `runAsPhysio` and RLS isolation tests

**Files:**

- Create: `src/db/rls.ts`, `src/db/rls.int.test.ts`
- Modify: `src/db/index.ts` (doc comment only)

**Interfaces:**

- Consumes: `db`, `physios`, `createTestPhysio`, `deleteTestPhysios`, `testClaims`.
- Produces:
  - `type Tx` (the Drizzle transaction type)
  - `runAsPhysio<T>(claims: JwtPayload, fn: (tx: Tx, physioId: string) => Promise<T>): Promise<T>`

- [ ] **Step 1: Write the failing RLS tests**

`src/db/rls.int.test.ts`:

```ts
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { physios } from "@/db/schema";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

import { runAsPhysio } from "./rls";

describe("runAsPhysio (RLS on physios)", () => {
  let a: TestPhysio;
  let b: TestPhysio;

  beforeAll(async () => {
    [a, b] = await Promise.all([
      createTestPhysio({ onboarded: true }),
      createTestPhysio({ onboarded: true }),
    ]);
  });

  afterAll(() => deleteTestPhysios(a, b));

  it("passes the physio id from the claims", async () => {
    expect(await runAsPhysio(a.claims, async (_tx, physioId) => physioId)).toBe(a.id);
  });

  it("shows a physio only their own row", async () => {
    const rows = await runAsPhysio(a.claims, (tx) => tx.select({ id: physios.id }).from(physios));
    expect(rows).toEqual([{ id: a.id }]);
  });

  it("hides another physio's row even when asked for it by id", async () => {
    const rows = await runAsPhysio(a.claims, (tx) =>
      tx.select().from(physios).where(eq(physios.id, b.id)),
    );
    expect(rows).toEqual([]);
  });

  it("cannot update another physio's row", async () => {
    const updated = await runAsPhysio(a.claims, (tx) =>
      tx
        .update(physios)
        .set({ displayName: "Hijacked" })
        .where(eq(physios.id, b.id))
        .returning({ id: physios.id }),
    );
    expect(updated).toEqual([]);
    const [row] = await db.select().from(physios).where(eq(physios.id, b.id));
    expect(row.displayName).not.toBe("Hijacked");
  });

  it("can update its own row", async () => {
    const updated = await runAsPhysio(a.claims, (tx, physioId) =>
      tx
        .update(physios)
        .set({ displayName: "Own Update" })
        .where(eq(physios.id, physioId))
        .returning({ displayName: physios.displayName }),
    );
    expect(updated).toEqual([{ displayName: "Own Update" }]);
  });

  it("cannot insert physio rows", async () => {
    await expect(
      runAsPhysio(a.claims, (tx) =>
        tx.insert(physios).values({
          id: crypto.randomUUID(),
          email: "x@example.test",
          displayName: "Intruder",
          handle: `intruder-${a.id.slice(0, 8)}`,
        }),
      ),
    ).rejects.toThrow();
  });

  it("cannot delete physio rows, not even its own", async () => {
    const deleted = await runAsPhysio(a.claims, (tx, physioId) =>
      tx.delete(physios).where(eq(physios.id, physioId)).returning({ id: physios.id }),
    );
    expect(deleted).toEqual([]);
  });

  it("sees nothing as the authenticated role without claims", async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role authenticated`);
      return tx.select().from(physios);
    });
    expect(rows).toEqual([]);
  });

  it("reports handle availability without revealing rows", async () => {
    const [bRow] = await db.select().from(physios).where(eq(physios.id, b.id));
    const [aRow] = await db.select().from(physios).where(eq(physios.id, a.id));
    const check = (handle: string) =>
      runAsPhysio(a.claims, async (tx) => {
        const [row] = await tx.execute<{ available: boolean }>(
          sql`select public.is_handle_available(${handle}) as available`,
        );
        return row.available;
      });

    expect(await check(bRow.handle)).toBe(false);
    expect(await check(aRow.handle)).toBe(true);
    expect(await check(`free-${crypto.randomUUID().slice(0, 8)}`)).toBe(true);
  });

  it("does not let anonymous users call is_handle_available", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`set local role anon`);
        await tx.execute(sql`select public.is_handle_available('anything')`);
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:int src/db/rls.int.test.ts`
Expected: FAIL, cannot resolve `./rls`.

- [ ] **Step 3: Implement `runAsPhysio`**

`src/db/rls.ts`:

```ts
import "server-only";

import type { JwtPayload } from "@supabase/supabase-js";
import { sql } from "drizzle-orm";

import { db } from "@/db";

/** A Drizzle transaction; physio-facing queries and mutations take one. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Runs `fn` in a transaction as the `authenticated` role with the given (verified) JWT claims,
 * so Postgres RLS applies to every query. `claims` must come from getClaims() (or tests).
 * App code uses withPhysio() (src/server/auth/session.ts), which supplies the session's claims.
 */
export async function runAsPhysio<T>(
  claims: JwtPayload,
  fn: (tx: Tx, physioId: string) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`);
    await tx.execute(sql`set local role authenticated`);
    return fn(tx, claims.sub);
  });
}
```

In `src/db/index.ts`, update the doc comment on `db`:

```ts
/**
 * Drizzle client connected as the database owner: it BYPASSES Row Level Security.
 * Physio-facing code must use withPhysio() (src/server/auth/session.ts) / runAsPhysio()
 * (src/db/rls.ts); see docs/architecture.md → "Tenancy and data access".
 */
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm test:int src/db/rls.int.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Verify and commit**

Run: `pnpm format && pnpm check && pnpm test:int`

```bash
git add src/db/rls.ts src/db/rls.int.test.ts src/db/index.ts
git commit -m "Add runAsPhysio and prove physios RLS isolation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Profile schema, queries and mutations

**Files:**

- Create: `src/server/physios/schemas.ts`, `src/server/physios/schemas.test.ts`
- Create: `src/server/physios/queries.ts`, `src/server/physios/mutations.ts`
- Create: `src/server/physios/profile.int.test.ts`

**Interfaces:**

- Consumes: `handleProblem`, `HandleProblem`, `handleCandidates` (Task 1), `normalizeTimeZone`
  (Task 1), `locales` (`src/i18n/config.ts`), `Tx`, `runAsPhysio` (Task 5), `physios`,
  `Physio`, `isUniqueViolation` (Task 4).
- Produces:
  - `profileSchema` (zod); `type ProfileInput = { displayName: string; handle: string; locale: Locale; timezone: string }`
  - `type ProfileFieldErrors = { displayName?: "displayNameRequired" | "displayNameTooLong"; handle?: HandleProblem | "taken"; locale?: "localeInvalid"; timezone?: "timezoneInvalid" }`
  - `type ProfileFormState = { status: "idle" } | { status: "saved" } | { status: "error"; fieldErrors: ProfileFieldErrors; submittedHandle: string; formError?: "unknown" }`
  - `profileFieldErrors(error: z.ZodError): ProfileFieldErrors`
  - `getProfile(tx: Tx, physioId: string): Promise<Physio | null>`
  - `isHandleAvailable(tx: Tx, handle: string): Promise<boolean>`
  - `suggestHandle(tx: Tx, displayName: string): Promise<string | null>`
  - `type ProfileResult = { ok: true; data: Physio } | { ok: false; error: "handleTaken" | "notFound" }`
  - `completeOnboarding(tx: Tx, physioId: string, input: ProfileInput): Promise<ProfileResult>`
  - `updateProfile(tx: Tx, physioId: string, input: ProfileInput): Promise<ProfileResult>`

- [ ] **Step 1: Write the failing schema unit test**

`src/server/physios/schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { profileFieldErrors, profileSchema } from "./schemas";

const valid = { displayName: "Maria Lopez", handle: "maria-lopez", locale: "en", timezone: "UTC" };

function errorsFor(input: Record<string, unknown>) {
  const result = profileSchema.safeParse(input);
  if (result.success) throw new Error("expected a validation error");
  return profileFieldErrors(result.error);
}

describe("profileSchema", () => {
  it("trims the name, lowercases the handle and normalises the timezone", () => {
    expect(
      profileSchema.parse({
        displayName: "  Ana  ",
        handle: " Ana-Ruiz ",
        locale: "en",
        timezone: "utc",
      }),
    ).toEqual({ displayName: "Ana", handle: "ana-ruiz", locale: "en", timezone: "UTC" });
  });

  it("ignores unknown fields such as next", () => {
    expect(profileSchema.parse({ ...valid, next: "/customers" })).toEqual(valid);
  });

  it.each([
    [{ displayName: "   " }, { displayName: "displayNameRequired" }],
    [{ displayName: "x".repeat(81) }, { displayName: "displayNameTooLong" }],
    [{ handle: "admin" }, { handle: "reserved" }],
    [{ handle: "ab" }, { handle: "tooShort" }],
    [{ handle: "a_b_c" }, { handle: "format" }],
    [{ locale: "xx" }, { locale: "localeInvalid" }],
    [{ timezone: "Mars/Base" }, { timezone: "timezoneInvalid" }],
  ])("maps %j to %j", (override, expected) => {
    expect(errorsFor({ ...valid, ...override })).toEqual(expected);
  });

  it("falls back to a known error code for missing fields", () => {
    expect(errorsFor({})).toEqual({
      displayName: "displayNameRequired",
      handle: "format",
      locale: "localeInvalid",
      timezone: "timezoneInvalid",
    });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test src/server`
Expected: FAIL, cannot resolve `./schemas`.

- [ ] **Step 3: Implement the schema**

`src/server/physios/schemas.ts`:

```ts
import { z } from "zod";

import { locales } from "@/i18n/config";
import { handleProblem, type HandleProblem } from "@/lib/handles";
import { normalizeTimeZone } from "@/lib/timezones";

/** Profile fields edited in onboarding and settings. Messages are i18n keys (ProfileForm.*). */
export const profileSchema = z.object({
  displayName: z.string().trim().min(1, "displayNameRequired").max(80, "displayNameTooLong"),
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .superRefine((value, ctx) => {
      const problem = handleProblem(value);
      if (problem) ctx.addIssue({ code: "custom", message: problem });
    }),
  locale: z.enum(locales, { error: "localeInvalid" }),
  timezone: z.string().transform((value, ctx) => {
    const zone = normalizeTimeZone(value);
    if (zone) return zone;
    ctx.addIssue({ code: "custom", message: "timezoneInvalid" });
    return z.NEVER;
  }),
});

export type ProfileInput = z.output<typeof profileSchema>;

export type ProfileFieldErrors = {
  displayName?: "displayNameRequired" | "displayNameTooLong";
  handle?: HandleProblem | "taken";
  locale?: "localeInvalid";
  timezone?: "timezoneInvalid";
};

export type ProfileFormState =
  | { status: "idle" }
  | { status: "saved" }
  | {
      status: "error";
      fieldErrors: ProfileFieldErrors;
      /** The handle that was submitted, so the form only shows its error while it is unchanged. */
      submittedHandle: string;
      formError?: "unknown";
    };

type Field = keyof ProfileFieldErrors;

const KNOWN_CODES: Record<Field, readonly string[]> = {
  displayName: ["displayNameRequired", "displayNameTooLong"],
  handle: ["tooShort", "tooLong", "format", "reserved", "taken"],
  locale: ["localeInvalid"],
  timezone: ["timezoneInvalid"],
};

const FALLBACK_CODES: Required<ProfileFieldErrors> = {
  displayName: "displayNameRequired",
  handle: "format",
  locale: "localeInvalid",
  timezone: "timezoneInvalid",
};

/** First error per field as an i18n key; unexpected messages (e.g. a missing field) map to a fallback. */
export function profileFieldErrors(error: z.ZodError): ProfileFieldErrors {
  const flattened = z.flattenError(error).fieldErrors as Partial<Record<Field, string[]>>;
  const result: Record<string, string> = {};
  for (const field of Object.keys(FALLBACK_CODES) as Field[]) {
    const message = flattened[field]?.[0];
    if (message === undefined) continue;
    result[field] = KNOWN_CODES[field].includes(message) ? message : FALLBACK_CODES[field];
  }
  return result as ProfileFieldErrors;
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm test src/server`
Expected: PASS.

- [ ] **Step 5: Write the failing integration tests for queries and mutations**

`src/server/physios/profile.int.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { runAsPhysio } from "@/db/rls";
import { physios } from "@/db/schema";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

import { completeOnboarding, updateProfile } from "./mutations";
import { getProfile, isHandleAvailable, suggestHandle } from "./queries";
import type { ProfileInput } from "./schemas";

describe("physio profile", () => {
  let maria: TestPhysio;
  let other: TestPhysio;
  let otherHandle: string;

  const input = (overrides: Partial<ProfileInput> = {}): ProfileInput => ({
    displayName: "Maria Lopez",
    handle: `maria-${maria.id.slice(0, 8)}`,
    locale: "en",
    timezone: "Europe/Madrid",
    ...overrides,
  });

  beforeAll(async () => {
    [maria, other] = await Promise.all([
      createTestPhysio({ userMetadata: { full_name: "Maria Int" } }),
      createTestPhysio({ onboarded: true }),
    ]);
    const [row] = await db.select().from(physios).where(eq(physios.id, other.id));
    otherHandle = row.handle;
  });

  afterAll(() => deleteTestPhysios(maria, other));

  it("reads the physio's own profile", async () => {
    const profile = await runAsPhysio(maria.claims, (tx, id) => getProfile(tx, id));
    expect(profile).toMatchObject({ id: maria.id, displayName: "Maria Int", onboardedAt: null });
  });

  it("returns null for another physio's profile", async () => {
    expect(await runAsPhysio(maria.claims, (tx) => getProfile(tx, other.id))).toBeNull();
  });

  it("completes onboarding", async () => {
    const result = await runAsPhysio(maria.claims, (tx, id) => completeOnboarding(tx, id, input()));
    expect(result).toMatchObject({
      ok: true,
      data: { displayName: "Maria Lopez", timezone: "Europe/Madrid", handle: input().handle },
    });
    expect(result.ok && result.data.onboardedAt).toBeInstanceOf(Date);
  });

  it("updates the profile and keeps onboarded_at", async () => {
    const before = await runAsPhysio(maria.claims, (tx, id) => getProfile(tx, id));
    const result = await runAsPhysio(maria.claims, (tx, id) =>
      updateProfile(tx, id, input({ displayName: "María López" })),
    );
    expect(result).toMatchObject({ ok: true, data: { displayName: "María López" } });
    expect(result.ok && result.data.onboardedAt).toEqual(before?.onboardedAt);
  });

  it("reports a taken handle instead of throwing", async () => {
    const result = await runAsPhysio(maria.claims, (tx, id) =>
      updateProfile(tx, id, input({ handle: otherHandle })),
    );
    expect(result).toEqual({ ok: false, error: "handleTaken" });
  });

  it("keeps the transaction usable after a taken handle", async () => {
    const profile = await runAsPhysio(maria.claims, async (tx, id) => {
      await updateProfile(tx, id, input({ handle: otherHandle }));
      return getProfile(tx, id);
    });
    expect(profile?.id).toBe(maria.id);
  });

  it("cannot update another physio's profile", async () => {
    const result = await runAsPhysio(maria.claims, (tx) => updateProfile(tx, other.id, input()));
    expect(result).toEqual({ ok: false, error: "notFound" });
  });

  it("checks handle availability", async () => {
    const check = (handle: string) =>
      runAsPhysio(maria.claims, (tx) => isHandleAvailable(tx, handle));
    expect(await check(otherHandle)).toBe(false);
    expect(await check(`free-${crypto.randomUUID().slice(0, 8)}`)).toBe(true);
  });

  it("suggests the first free handle for a name", async () => {
    const base = `sugg-${maria.id.slice(0, 8)}`;
    const taker = await createTestPhysio({ handle: base });
    try {
      const suggestion = await runAsPhysio(maria.claims, (tx) => suggestHandle(tx, base));
      expect(suggestion).toBe(`${base}-2`);
    } finally {
      await deleteTestPhysios(taker);
    }
  });
});
```

- [ ] **Step 6: Run them to see them fail**

Run: `pnpm test:int src/server`
Expected: FAIL, cannot resolve `./mutations` / `./queries`.

- [ ] **Step 7: Implement queries and mutations**

`src/server/physios/queries.ts`:

```ts
import "server-only";

import { eq, sql } from "drizzle-orm";

import type { Tx } from "@/db/rls";
import { physios, type Physio } from "@/db/schema";
import { handleCandidates } from "@/lib/handles";

export async function getProfile(tx: Tx, physioId: string): Promise<Physio | null> {
  const [row] = await tx.select().from(physios).where(eq(physios.id, physioId));
  return row ?? null;
}

export async function isHandleAvailable(tx: Tx, handle: string): Promise<boolean> {
  const [row] = await tx.execute<{ available: boolean }>(
    sql`select public.is_handle_available(${handle}) as available`,
  );
  return row?.available === true;
}

/** First free handle derived from the name ("maria-lopez", "maria-lopez-2", …), or null. */
export async function suggestHandle(tx: Tx, displayName: string): Promise<string | null> {
  const candidates = handleCandidates(displayName);
  const list = sql.join(
    candidates.map((candidate) => sql`${candidate}`),
    sql`, `,
  );
  const [row] = await tx.execute<{ handle: string }>(sql`
    select candidate.handle
    from unnest(array[${list}]::text[]) with ordinality as candidate(handle, position)
    where public.is_handle_available(candidate.handle)
    order by candidate.position
    limit 1`);
  return row?.handle ?? null;
}
```

`src/server/physios/mutations.ts`:

```ts
import "server-only";

import { eq, sql } from "drizzle-orm";

import { isUniqueViolation } from "@/db/errors";
import type { Tx } from "@/db/rls";
import { physios, type Physio } from "@/db/schema";

import type { ProfileInput } from "./schemas";

export type ProfileResult =
  { ok: true; data: Physio } | { ok: false; error: "handleTaken" | "notFound" };

export function completeOnboarding(tx: Tx, physioId: string, input: ProfileInput) {
  return saveProfile(tx, physioId, input, { onboard: true });
}

export function updateProfile(tx: Tx, physioId: string, input: ProfileInput) {
  return saveProfile(tx, physioId, input, { onboard: false });
}

async function saveProfile(
  tx: Tx,
  physioId: string,
  input: ProfileInput,
  { onboard }: { onboard: boolean },
): Promise<ProfileResult> {
  try {
    // A savepoint, so a unique violation does not abort the caller's transaction.
    const [row] = await tx.transaction((savepoint) =>
      savepoint
        .update(physios)
        .set({
          ...input,
          ...(onboard ? { onboardedAt: sql`coalesce(${physios.onboardedAt}, now())` } : {}),
        })
        .where(eq(physios.id, physioId))
        .returning(),
    );
    return row ? { ok: true, data: row } : { ok: false, error: "notFound" };
  } catch (error) {
    if (isUniqueViolation(error, "physios_handle_unique"))
      return { ok: false, error: "handleTaken" };
    throw error;
  }
}
```

- [ ] **Step 8: Run them to see them pass**

Run: `pnpm test:int src/server`
Expected: PASS.

- [ ] **Step 9: Verify and commit**

Run: `pnpm format && pnpm check && pnpm test:int`

```bash
git add src/server/physios
git commit -m "Add profile schema, queries and mutations for physios

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Session helpers, auth callbacks, workspace gate and the e2e sign-in fixture

**Files:**

- Create: `src/server/auth/session.ts`, `src/server/auth/post-sign-in.ts`,
  `src/server/i18n/locale-cookie.ts`
- Create: `src/app/auth/confirm/route.ts`, `src/app/auth/callback/route.ts`
- Modify: `src/app/(app)/layout.tsx` (call `requirePhysio()`)
- Create: `e2e/helpers/auth.ts`, `e2e/auth.spec.ts`
- Modify: `playwright.config.ts`, `e2e/smoke.spec.ts`, `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: `runAsPhysio`, `Tx` (Task 5), `getProfile` (Task 6), `safeNextPath` (Task 1),
  `localeCookieName` (`src/i18n/config.ts`), `createClient` (`src/lib/supabase/server.ts`).
- Produces:
  - `type SessionPhysio = { physioId: string; claims: JwtPayload }`
  - `getSessionPhysio(): Promise<SessionPhysio | null>` (cached per request)
  - `withPhysio<T>(fn: (tx: Tx, physioId: string) => Promise<T>): Promise<T>` (redirects to `/login` without a session)
  - `requirePhysio(): Promise<{ physioId: string; profile: Physio }>` (redirects to `/login` or `/onboarding`)
  - `setLocaleCookie(locale: string): Promise<void>`
  - `postSignInPath(supabase: SupabaseClient, accessToken: string, next: string): Promise<string>`
  - e2e: `type E2EPhysio = { id: string; email: string; displayName: string; handle: string }`,
    `createPhysio(options?: { onboarded?: boolean; displayName?: string; handle?: string }): Promise<E2EPhysio>`,
    `deletePhysio(physio: E2EPhysio): Promise<void>`, `deleteUserByEmail(email: string): Promise<void>`,
    `signIn(page: Page, physio: E2EPhysio, next?: string): Promise<void>`,
    `test` (with `physio` and `physioPage` fixtures) and `expect`

- [ ] **Step 1: Point Playwright at `.env.local` and the e2e port**

In `playwright.config.ts`, add at the top:

```ts
import { config } from "dotenv";

// E2E helpers talk to local Supabase with the keys in .env.local (`pnpm db:start`).
config({ path: [".env.local", ".env"], quiet: true });
```

and in `webServer` add:

```ts
    // Links in emails and OAuth redirects must point at the e2e server, not :3000.
    env: { NEXT_PUBLIC_APP_URL: baseURL },
```

- [ ] **Step 2: Write the e2e helpers**

`e2e/helpers/auth.ts`:

```ts
import { test as base, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set: run pnpm db:start and fill .env.local`);
  return value;
}

const admin = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SECRET_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const sql = postgres(requireEnv("DATABASE_URL"), { prepare: false, max: 2 });

export type E2EPhysio = { id: string; email: string; displayName: string; handle: string };

/** Creates a physio through the admin API (no email). Onboarded physios get a known handle. */
export async function createPhysio(
  options: { onboarded?: boolean; displayName?: string; handle?: string } = {},
): Promise<E2EPhysio> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const email = `e2e-${suffix}@example.test`;
  const displayName = options.displayName ?? `E2E Physio ${suffix}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: displayName },
  });
  if (error) throw error;
  const id = data.user.id;

  if (options.onboarded || options.handle) {
    const handle = options.handle ?? `e2e-${suffix}`;
    await sql`
      update public.physios
      set handle = ${handle}, onboarded_at = ${options.onboarded ? sql`now()` : null}
      where id = ${id}`;
    return { id, email, displayName, handle };
  }
  const [row] = await sql<{ handle: string }[]>`select handle from public.physios where id = ${id}`;
  return { id, email, displayName, handle: row.handle };
}

export async function deletePhysio(physio: E2EPhysio): Promise<void> {
  await admin.auth.admin.deleteUser(physio.id);
}

/** Cleanup for users created through the real sign-up flow. */
export async function deleteUserByEmail(email: string): Promise<void> {
  await sql`delete from auth.users where email = ${email}`;
}

/** Signs in without email: same /auth/confirm route the magic link uses. */
export async function signIn(page: Page, physio: E2EPhysio, next = "/dashboard"): Promise<void> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: physio.email,
  });
  if (error) throw error;
  const params = new URLSearchParams({
    token_hash: data.properties.hashed_token,
    type: "email",
    next,
  });
  await page.goto(`/auth/confirm?${params}`);
}

/**
 * `physio`: an onboarded physio, deleted after the test.
 * `physioPage`: `page` signed in as that physio, on /dashboard.
 */
export const test = base.extend<{ physio: E2EPhysio; physioPage: Page }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright requires object destructuring here.
  physio: async ({}, use) => {
    const physio = await createPhysio({ onboarded: true });
    await use(physio);
    await deletePhysio(physio);
  },
  physioPage: async ({ page, physio }, use) => {
    await signIn(page, physio);
    await expect(page).toHaveURL(/\/dashboard$/);
    await use(page);
  },
});

export { expect };
```

- [ ] **Step 3: Write the failing e2e tests**

`e2e/auth.spec.ts`:

```ts
import { createPhysio, deletePhysio, expect, signIn, test } from "./helpers/auth";

test("signed-out visits return to the requested page after sign-in", async ({ page, physio }) => {
  await page.goto("/customers");
  await expect(page).toHaveURL(/\/login\?next=%2Fcustomers$/);
  const next = new URL(page.url()).searchParams.get("next") ?? "";
  await signIn(page, physio, next);
  await expect(page).toHaveURL(/\/customers$/);
});

test("a new physio is sent to onboarding, keeping next", async ({ page }) => {
  const physio = await createPhysio();
  try {
    await signIn(page, physio, "/customers");
    await expect(page).toHaveURL(/\/onboarding\?next=%2Fcustomers$/);
  } finally {
    await deletePhysio(physio);
  }
});

test("an unsafe next param falls back to the dashboard", async ({ page, physio }) => {
  await signIn(page, physio, "//evil.example");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("signed-in physios skip the login page", async ({ physioPage: page }) => {
  await page.goto("/login");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("an invalid sign-in link goes back to login with an error", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=not-a-token&type=email");
  await expect(page).toHaveURL(/\/login\?error=linkInvalid$/);
});
```

In `e2e/smoke.spec.ts`, change the import to use the fixtures and restore the signed-in
navigation test (keep the signed-out redirect test from Task 2 and the other tests):

```ts
import { expect, test } from "./helpers/auth";
```

```ts
test("physio workspace shows navigation", async ({ physioPage: page }) => {
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  const nav = page.getByRole("navigation").filter({ visible: true }).first();
  await nav.getByRole("link", { name: "Customers" }).click();
  await expect(page).toHaveURL(/\/customers$/);
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
});
```

- [ ] **Step 4: Run them to see them fail**

Run: `pnpm test:e2e e2e/auth.spec.ts e2e/smoke.spec.ts`
Expected: FAIL: `/auth/confirm` returns 404, so no test reaches the expected URL.

- [ ] **Step 5: Implement the session helpers and the locale cookie**

`src/server/i18n/locale-cookie.ts`:

```ts
import "server-only";

import { cookies } from "next/headers";

import { localeCookieName } from "@/i18n/config";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Remembers the physio's UI language (read by src/i18n/request.ts). Actions and route handlers only. */
export async function setLocaleCookie(locale: string): Promise<void> {
  (await cookies()).set(localeCookieName, locale, {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
  });
}
```

`src/server/auth/session.ts`:

```ts
import "server-only";

import type { JwtPayload } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";

import { runAsPhysio, type Tx } from "@/db/rls";
import type { Physio } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/server/physios/queries";

export type SessionPhysio = { physioId: string; claims: JwtPayload };

/** The verified session (JWT checked by getClaims), or null. No database access. */
export const getSessionPhysio = cache(async (): Promise<SessionPhysio | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data || data.claims.role !== "authenticated") return null;
  return { physioId: data.claims.sub, claims: data.claims };
});

/**
 * Runs `fn` under RLS as the signed-in physio. Requires a session (redirects to /login),
 * not onboarding. Every physio-facing query and mutation goes through this.
 */
export async function withPhysio<T>(fn: (tx: Tx, physioId: string) => Promise<T>): Promise<T> {
  const session = await getSessionPhysio();
  if (!session) redirect("/login");
  return runAsPhysio(session.claims, fn);
}

/** The signed-in, onboarded physio. Redirects to /login or /onboarding otherwise. */
export const requirePhysio = cache(async (): Promise<{ physioId: string; profile: Physio }> => {
  const profile = await withPhysio((tx, physioId) => getProfile(tx, physioId));
  if (!profile) redirect("/login");
  if (!profile.onboardedAt) redirect("/onboarding");
  return { physioId: profile.id, profile };
});
```

`src/server/auth/post-sign-in.ts`:

```ts
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { runAsPhysio } from "@/db/rls";
import { setLocaleCookie } from "@/server/i18n/locale-cookie";
import { getProfile } from "@/server/physios/queries";

/**
 * Where to send a physio right after a session was created, and remembers their language.
 * New physios go through onboarding first, keeping `next`.
 */
export async function postSignInPath(
  supabase: SupabaseClient,
  accessToken: string,
  next: string,
): Promise<string> {
  const { data, error } = await supabase.auth.getClaims(accessToken);
  if (error || !data) return "/login?error=unknown";

  const profile = await runAsPhysio(data.claims, (tx, physioId) => getProfile(tx, physioId));
  if (!profile) return "/login?error=unknown";

  await setLocaleCookie(profile.locale);
  return profile.onboardedAt ? next : `/onboarding?${new URLSearchParams({ next })}`;
}
```

- [ ] **Step 6: Implement the route handlers**

`src/app/auth/confirm/route.ts`:

```ts
import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { safeNextPath } from "@/lib/redirects";
import { createClient } from "@/lib/supabase/server";
import { postSignInPath } from "@/server/auth/post-sign-in";

/** Magic-link landing: verifies the email token (works on any device), then redirects. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const next = safeNextPath(params.get("next"));
  if (!tokenHash || !type) redirect("/login?error=linkInvalid");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error || !data.session) redirect("/login?error=linkInvalid");

  redirect(await postSignInPath(supabase, data.session.access_token, next));
}
```

`src/app/auth/callback/route.ts`:

```ts
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { safeNextPath } from "@/lib/redirects";
import { createClient } from "@/lib/supabase/server";
import { postSignInPath } from "@/server/auth/post-sign-in";

/** OAuth (Google) landing: exchanges the PKCE code for a session, then redirects. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const next = safeNextPath(params.get("next"));
  if (!code) redirect("/login?error=oauthFailed");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) redirect("/login?error=oauthFailed");

  redirect(await postSignInPath(supabase, data.session.access_token, next));
}
```

- [ ] **Step 7: Gate the workspace layout**

In `src/app/(app)/layout.tsx`: make the component `async`, import
`import { requirePhysio } from "@/server/auth/session";`, call
`await requirePhysio();` as the first line of the function body, and change the doc comment to
`Physio workspace shell. Requires a signed-in, onboarded physio.` (Task 10 uses the returned
profile for the account menu.)

- [ ] **Step 8: Run the e2e tests to see them pass**

Run: `pnpm test:e2e e2e/auth.spec.ts e2e/smoke.spec.ts`
Expected: PASS on desktop and mobile. (The onboarding page itself is built in Task 9; this
task only asserts the URL.)

- [ ] **Step 9: Run e2e in CI against local Supabase**

In `.github/workflows/ci.yml`, in the `e2e` job, after `pnpm install --frozen-lockfile` add the
same two steps as the `integration` job:

```yaml
- name: Start Supabase
  run: pnpm exec supabase start -x studio,imgproxy,vector,logflare,edge-runtime,realtime
- name: Export Supabase keys
  run: |
    pnpm exec supabase status -o env \
      | sed -n -e 's/^PUBLISHABLE_KEY=/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=/p' \
               -e 's/^SECRET_KEY=/SUPABASE_SECRET_KEY=/p' \
      | tr -d '"' >> "$GITHUB_ENV"
```

(Mailpit is part of the default services and stays on for Task 8's email test.)

- [ ] **Step 10: Verify and commit**

Run: `pnpm format && pnpm check && pnpm test:int && pnpm test:e2e`

```bash
git add src/server/auth src/server/i18n src/app/auth "src/app/(app)/layout.tsx" e2e \
  playwright.config.ts .github/workflows/ci.yml
git commit -m "Add session helpers, auth callbacks and e2e sign-in fixture

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Login page with magic link and env-gated Google

**Files:**

- Create: `src/lib/auth/login-errors.ts`, `src/lib/auth/login-errors.test.ts`
- Create: `src/server/auth/schemas.ts`, `src/server/auth/actions.ts`
- Create: `src/components/ui/alert.tsx`, `src/components/auth/login-form.tsx`
- Modify: `src/app/(auth)/login/page.tsx`, `messages/en.json`
- Create: `e2e/helpers/mailpit.ts`; Modify: `e2e/auth.spec.ts`

**Interfaces:**

- Consumes: `safeNextPath`, `firstParam` (Task 1), `env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED`
  (Task 3), `createClient` (`src/lib/supabase/server.ts`), e2e helpers (Task 7).
- Produces:
  - `LOGIN_ERRORS`, `type LoginError = "linkInvalid" | "oauthFailed" | "unknown"`,
    `parseLoginError(value: string | undefined): LoginError | null`
  - `type MagicLinkState = { status: "idle" } | { status: "sent"; email: string } | { status: "error"; error: "emailInvalid" | "sendFailed" }`
  - Server Actions: `sendMagicLink(state: MagicLinkState, formData: FormData): Promise<MagicLinkState>`,
    `signInWithGoogle(formData: FormData): Promise<void>`, `signOut(): Promise<void>`
  - `Alert`, `AlertTitle`, `AlertDescription`
  - `latestEmailLink(email: string): Promise<string>`

- [ ] **Step 1: Write the failing unit test**

`src/lib/auth/login-errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { parseLoginError } from "./login-errors";

describe("parseLoginError", () => {
  it.each(["linkInvalid", "oauthFailed", "unknown"] as const)("accepts %s", (code) => {
    expect(parseLoginError(code)).toBe(code);
  });

  it.each([undefined, "", "<script>", "toString"])("ignores %j", (value) => {
    expect(parseLoginError(value)).toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing e2e tests**

`e2e/helpers/mailpit.ts`:

```ts
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

/** The first link in the newest email to `email`, polling Mailpit for up to 10 seconds. */
export async function latestEmailLink(email: string): Promise<string> {
  const query = encodeURIComponent(`to:"${email}"`);
  for (let attempt = 0; attempt < 20; attempt++) {
    const search = (await (await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`)).json()) as {
      messages: { ID: string }[];
    };
    if (search.messages.length > 0) {
      const message = (await (
        await fetch(`${MAILPIT_URL}/api/v1/message/${search.messages[0].ID}`)
      ).json()) as { HTML: string };
      const href = message.HTML.match(/href="([^"]+)"/)?.[1];
      if (href) return href.replaceAll("&amp;", "&");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No sign-in email for ${email}`);
}
```

Add to `e2e/auth.spec.ts` (and add `deleteUserByEmail` to the helper import, plus
`import { latestEmailLink } from "./helpers/mailpit";`):

```ts
test("a new physio signs in with an emailed link opened in another browser", async ({
  page,
  browser,
}) => {
  const email = `e2e-link-${crypto.randomUUID().slice(0, 8)}@example.test`;
  try {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send link" }).click();
    await expect(page.getByText("Check your inbox")).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();

    // A fresh context has none of the first browser's cookies (like opening it on a phone).
    const otherBrowser = await browser.newContext();
    const otherPage = await otherBrowser.newPage();
    await otherPage.goto(await latestEmailLink(email));
    await expect(otherPage).toHaveURL(/\/onboarding\?next=%2Fdashboard$/);
    await otherBrowser.close();
  } finally {
    await deleteUserByEmail(email);
  }
});

test("the login form rejects an invalid email", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Send link" }).click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
});

test("Google sign-in is hidden when it is not enabled", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Send link" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toHaveCount(0);
});
```

Extend the existing `"an invalid sign-in link goes back to login with an error"` test with:

```ts
await expect(
  page.getByText("That sign-in link has expired or was already used. Request a new one."),
).toBeVisible();
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `pnpm test src/lib/auth && pnpm test:e2e e2e/auth.spec.ts`
Expected: FAIL: `./login-errors` missing; the login page is still the placeholder (no Email
field).

- [ ] **Step 4: Implement login errors and the auth actions**

`src/lib/auth/login-errors.ts`:

```ts
/** Error codes /login shows from its `error` search param (see Auth.errors in messages). */
export const LOGIN_ERRORS = ["linkInvalid", "oauthFailed", "unknown"] as const;
export type LoginError = (typeof LOGIN_ERRORS)[number];

export function parseLoginError(value: string | undefined): LoginError | null {
  return (LOGIN_ERRORS as readonly string[]).includes(value ?? "") ? (value as LoginError) : null;
}
```

`src/server/auth/schemas.ts`:

```ts
export type MagicLinkState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; error: "emailInvalid" | "sendFailed" };
```

`src/server/auth/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { env } from "@/env";
import { safeNextPath } from "@/lib/redirects";
import { createClient } from "@/lib/supabase/server";

import type { MagicLinkState } from "./schemas";

function authUrl(path: "/auth/confirm" | "/auth/callback", next: string): string {
  return `${env.NEXT_PUBLIC_APP_URL}${path}?${new URLSearchParams({ next })}`;
}

/** Emails a sign-in link (creates the account on first use). */
export async function sendMagicLink(
  _state: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const email = z.email().safeParse(
    String(formData.get("email") ?? "")
      .trim()
      .toLowerCase(),
  );
  if (!email.success) return { status: "error", error: "emailInvalid" };

  const next = safeNextPath(formData.get("next")?.toString());
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { emailRedirectTo: authUrl("/auth/confirm", next) },
  });
  if (error) return { status: "error", error: "sendFailed" };
  return { status: "sent", email: email.data };
}

/** Starts the Google OAuth flow (PKCE); Google returns to /auth/callback. */
export async function signInWithGoogle(formData: FormData): Promise<void> {
  const next = safeNextPath(formData.get("next")?.toString());
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: authUrl("/auth/callback", next) },
  });
  if (error || !data.url) redirect("/login?error=oauthFailed");
  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
```

- [ ] **Step 5: Add the Alert primitive**

Run `pnpm dlx shadcn@latest add alert`. If the registry is unreachable, create
`src/components/ui/alert.tsx` by hand:

```tsx
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        destructive:
          "text-destructive bg-card *:data-[slot=alert-description]:text-destructive/90 [&>svg]:text-current",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight", className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-muted-foreground col-start-2 grid justify-items-start gap-1 text-sm [&_p]:leading-relaxed",
        className,
      )}
      {...props}
    />
  );
}

export { Alert, AlertDescription, AlertTitle };
```

- [ ] **Step 6: Add the copy**

In `messages/en.json`, replace the `"Login"` object and add `"Auth"` after it:

```json
  "Login": {
    "title": "Sign in",
    "description": "We'll email you a link. No password needed.",
    "emailLabel": "Email",
    "emailPlaceholder": "you@clinic.com",
    "sendLink": "Send link",
    "sending": "Sending…",
    "or": "or",
    "google": "Continue with Google",
    "checkInboxTitle": "Check your inbox",
    "checkInboxDescription": "We sent a sign-in link to {email}. You can open it on any device.",
    "useDifferentEmail": "Use a different email",
    "back": "Back to home"
  },
  "Auth": {
    "errors": {
      "linkInvalid": "That sign-in link has expired or was already used. Request a new one.",
      "oauthFailed": "Google sign-in didn't finish. Try again or use an email link.",
      "unknown": "Something went wrong while signing you in. Try again.",
      "emailInvalid": "Enter a valid email address.",
      "sendFailed": "We couldn't send the link. Wait a moment and try again."
    }
  },
```

- [ ] **Step 7: Build the login form and page**

`src/components/auth/login-form.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LoginError } from "@/lib/auth/login-errors";
import { sendMagicLink, signInWithGoogle } from "@/server/auth/actions";
import type { MagicLinkState } from "@/server/auth/schemas";

const initialState: MagicLinkState = { status: "idle" };

export function LoginForm({
  next,
  googleEnabled,
  error,
}: {
  next: string;
  googleEnabled: boolean;
  error: LoginError | null;
}) {
  const t = useTranslations("Login");
  const tErrors = useTranslations("Auth.errors");
  const [state, formAction, pending] = useActionState(sendMagicLink, initialState);
  // "Use a different email" hides the confirmation until the next successful send.
  const [dismissed, setDismissed] = useState<MagicLinkState | null>(null);

  if (state.status === "sent" && dismissed !== state) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("checkInboxTitle")}</CardTitle>
          <CardDescription>{t("checkInboxDescription", { email: state.email })}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" className="w-full" onClick={() => setDismissed(state)}>
            {t("useDifferentEmail")}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const formError = state.status === "error" ? state.error : null;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{tErrors(error)}</AlertDescription>
          </Alert>
        ) : null}
        {googleEnabled ? (
          <>
            <form action={signInWithGoogle}>
              <input type="hidden" name="next" value={next} />
              <Button type="submit" variant="outline" className="w-full">
                {t("google")}
              </Button>
            </form>
            <div className="text-muted-foreground flex items-center gap-3 text-xs uppercase">
              <span className="bg-border h-px flex-1" />
              {t("or")}
              <span className="bg-border h-px flex-1" />
            </div>
          </>
        ) : null}
        <form action={formAction} className="grid gap-3" noValidate>
          <input type="hidden" name="next" value={next} />
          <div className="grid gap-2">
            <Label htmlFor="email">{t("emailLabel")}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder={t("emailPlaceholder")}
              defaultValue={dismissed?.status === "sent" ? dismissed.email : undefined}
              aria-invalid={formError === "emailInvalid"}
              aria-describedby={formError ? "email-error" : undefined}
            />
            {formError ? (
              <p id="email-error" role="alert" className="text-destructive text-sm">
                {tErrors(formError)}
              </p>
            ) : null}
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? t("sending") : t("sendLink")}
          </Button>
        </form>
      </CardContent>
      <CardFooter>
        <Button asChild variant="ghost" className="w-full">
          <Link href="/">{t("back")}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
```

Replace `src/app/(auth)/login/page.tsx` with:

```tsx
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { LoginForm } from "@/components/auth/login-form";
import { Logo } from "@/components/logo";
import { env } from "@/env";
import { parseLoginError } from "@/lib/auth/login-errors";
import { safeNextPath } from "@/lib/redirects";
import { firstParam } from "@/lib/search-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Login");
  return { title: t("title") };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <Logo />
      <LoginForm
        next={safeNextPath(firstParam(params.next))}
        googleEnabled={env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED}
        error={parseLoginError(firstParam(params.error))}
      />
    </main>
  );
}
```

- [ ] **Step 8: Run the tests to see them pass**

Run: `pnpm test src/lib/auth && pnpm test:e2e e2e/auth.spec.ts`
Expected: PASS (desktop and mobile).

- [ ] **Step 9: Check the Google button manually**

Set `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true` in `.env.local`, run `pnpm dev`, open
`http://localhost:3000/login`: "Continue with Google" and the "or" separator render above the
email form. Clicking it redirects to Supabase's `/auth/v1/authorize?provider=google…`
(it errors there while the local provider is disabled, which is expected). Set the flag back to
`false`.

- [ ] **Step 10: Verify and commit**

Run: `pnpm format && pnpm check && pnpm test:e2e e2e/auth.spec.ts`

```bash
git add src/lib/auth src/server/auth src/components/ui/alert.tsx src/components/auth \
  "src/app/(auth)/login/page.tsx" messages/en.json e2e
git commit -m "Build the login page with magic link and env-gated Google sign-in

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Profile form and onboarding

**Files:**

- Modify: `src/i18n/config.ts`; Create: `src/i18n/config.test.ts`
- Create: `src/server/physios/actions.ts`, `src/server/physios/form-options.ts`
- Create: `src/components/physios/profile-form.tsx`, `src/components/physios/profile-form.test.tsx`
- Create: `src/app/(auth)/onboarding/page.tsx`
- Modify: `messages/en.json`
- Create: `e2e/onboarding.spec.ts`

**Interfaces:**

- Consumes: `handleProblem`, `handleFromName`, `HANDLE_MAX_LENGTH`, `isPlaceholderHandle`,
  `safeNextPath`, `firstParam`, `normalizeTimeZone`, `timeZoneOptions`, `TimeZoneOption`
  (Task 1); `profileSchema`, `profileFieldErrors`, `ProfileFormState`, `ProfileInput`,
  `getProfile`, `isHandleAvailable`, `suggestHandle`, `completeOnboarding`, `updateProfile`,
  `ProfileResult` (Task 6); `withPhysio` (Task 7); `setLocaleCookie` (Task 7); `Alert` (Task 8);
  e2e helpers (Task 7).
- Produces:
  - `languageOptions(displayLocale: Locale): { value: Locale; label: string }[]`
  - Server Actions: `completeOnboardingAction(state: ProfileFormState, formData: FormData): Promise<ProfileFormState>`,
    `updateProfileAction(state, formData): Promise<ProfileFormState>`,
    `checkHandleAction(handle: string): Promise<boolean>`
  - `profileFormOptions(displayLocale: Locale): { linkBase: string; timeZones: TimeZoneOption[]; languages: { value: string; label: string }[] }`
  - `ProfileForm` props: `{ mode: "onboarding" | "settings"; action; checkHandle: (handle: string) => Promise<boolean>; defaults: ProfileFormValues; savedHandle: string; linkBase: string; timeZones: TimeZoneOption[]; languages: { value: string; label: string }[]; next?: string }`
  - `type ProfileFormValues = { displayName: string; handle: string; locale: string; timezone: string }`

- [ ] **Step 1: Add the copy**

In `messages/en.json`, add after `"Auth"`:

```json
  "ProfileForm": {
    "displayName": "Display name",
    "displayNameHint": "Shown to your patients.",
    "handle": "Handle",
    "handleHint": "Appears in the links you share with patients.",
    "linkPreview": "Patient links will look like {url}",
    "language": "Language",
    "timezone": "Timezone",
    "handleStatus": {
      "checking": "Checking availability…",
      "available": "Available",
      "taken": "That handle is already taken.",
      "reserved": "That handle is reserved. Pick another.",
      "tooShort": "Use at least 3 characters.",
      "tooLong": "Use at most 30 characters.",
      "format": "Use lowercase letters, numbers and single hyphens, not at the start or end."
    },
    "errors": {
      "displayNameRequired": "Enter your name.",
      "displayNameTooLong": "Use at most 80 characters.",
      "localeInvalid": "Pick a language from the list.",
      "timezoneInvalid": "Pick a timezone from the list.",
      "unknown": "Something went wrong. Try again."
    },
    "submitOnboarding": "Continue",
    "submitSettings": "Save changes",
    "saving": "Saving…",
    "saved": "Saved",
    "handleChangeNotice": "Links you already shared keep working and will show your new handle."
  },
  "Onboarding": {
    "title": "Set up your profile",
    "description": "This is how you appear to patients. You can change it later in Settings."
  },
```

- [ ] **Step 2: Write the failing unit tests**

`src/i18n/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { languageOptions } from "./config";

describe("languageOptions", () => {
  it("names every supported locale in the display language", () => {
    expect(languageOptions("en")).toEqual([{ value: "en", label: "English" }]);
  });
});
```

`src/components/physios/profile-form.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";

import { ProfileForm } from "./profile-form";

type Props = ComponentProps<typeof ProfileForm>;

function renderForm(overrides: Partial<Props> = {}) {
  const checkHandle = vi.fn(async () => true);
  const props: Props = {
    mode: "onboarding",
    action: vi.fn(async () => ({ status: "idle" as const })),
    checkHandle,
    defaults: { displayName: "Maria Lopez", handle: "maria-lopez", locale: "en", timezone: "UTC" },
    savedHandle: "physio-1a2b3c4d",
    linkBase: "physiotrainer.app",
    timeZones: [
      { value: "UTC", label: "UTC (GMT)" },
      { value: "Europe/Madrid", label: "Europe/Madrid (GMT+1)" },
    ],
    languages: [{ value: "en", label: "English" }],
    ...overrides,
  };
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <ProfileForm {...props} />
    </NextIntlClientProvider>,
  );
  return { checkHandle: props.checkHandle as typeof checkHandle };
}

describe("ProfileForm", () => {
  it("derives the handle from the name until the handle is edited (onboarding)", async () => {
    const user = userEvent.setup();
    renderForm();
    const name = screen.getByLabelText("Display name");
    const handle = screen.getByLabelText("Handle");

    await user.clear(name);
    await user.type(name, "Ana Ruiz");
    expect(handle).toHaveValue("ana-ruiz");

    await user.clear(handle);
    await user.type(handle, "ana-physio");
    await user.type(name, "z");
    expect(handle).toHaveValue("ana-physio");
  });

  it("keeps the suggested handle when the name has no Latin letters", async () => {
    const user = userEvent.setup();
    renderForm();
    const name = screen.getByLabelText("Display name");
    await user.clear(name);
    await user.type(name, "李伟");
    expect(screen.getByLabelText("Handle")).toHaveValue("maria-lopez");
  });

  it("does not follow the name in settings", async () => {
    const user = userEvent.setup();
    renderForm({ mode: "settings", savedHandle: "maria-lopez" });
    await user.type(screen.getByLabelText("Display name"), " Garcia");
    expect(screen.getByLabelText("Handle")).toHaveValue("maria-lopez");
  });

  it("explains unusable handles without asking the server", async () => {
    const user = userEvent.setup();
    const { checkHandle } = renderForm({
      defaults: { displayName: "", handle: "", locale: "en", timezone: "UTC" },
    });
    const handle = screen.getByLabelText("Handle");

    await user.type(handle, "Dashboard");
    expect(handle).toHaveValue("dashboard");
    expect(screen.getByText("That handle is reserved. Pick another.")).toBeInTheDocument();

    await user.clear(handle);
    await user.type(handle, "ab");
    expect(screen.getByText("Use at least 3 characters.")).toBeInTheDocument();
    expect(checkHandle).not.toHaveBeenCalled();
  });

  it("checks availability once typing stops", async () => {
    const user = userEvent.setup();
    const checkHandle = vi.fn(async (value: string) => value !== "taken-one");
    renderForm({ checkHandle });
    const handle = screen.getByLabelText("Handle");

    await user.clear(handle);
    await user.type(handle, "taken-one");
    expect(screen.getByText("Checking availability…")).toBeInTheDocument();
    expect(await screen.findByText("That handle is already taken.")).toBeInTheDocument();
    expect(checkHandle).toHaveBeenLastCalledWith("taken-one");
    expect(checkHandle).not.toHaveBeenCalledWith("t");

    await user.clear(handle);
    await user.type(handle, "free-one");
    expect(await screen.findByText("Available")).toBeInTheDocument();
  });

  it("shows the link preview with the current handle", () => {
    renderForm();
    expect(
      screen.getByText("Patient links will look like physiotrainer.app/maria-lopez/ana-7k2m9qpx"),
    ).toBeInTheDocument();
  });

  it("warns about changing the handle only in settings", async () => {
    const user = userEvent.setup();
    renderForm({ mode: "settings", savedHandle: "maria-lopez" });
    const notice = "Links you already shared keep working and will show your new handle.";
    expect(screen.queryByText(notice)).not.toBeInTheDocument();

    const handle = screen.getByLabelText("Handle");
    await user.clear(handle);
    await user.type(handle, "maria-physio");
    expect(screen.getByText(notice)).toBeInTheDocument();
  });

  it("shows a server-side 'taken' error for the submitted handle", async () => {
    const action = vi.fn(async () => ({
      status: "error" as const,
      fieldErrors: { handle: "taken" as const },
      submittedHandle: "maria-lopez",
    }));
    const user = userEvent.setup();
    renderForm({ action });
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(screen.getByText("That handle is already taken.")).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm test src/i18n src/components`
Expected: FAIL: `languageOptions` not exported; `./profile-form` missing.

- [ ] **Step 4: Implement `languageOptions`, form options and the actions**

Append to `src/i18n/config.ts`:

```ts
/** Language <select> options, each named in the physio's current UI language. */
export function languageOptions(displayLocale: Locale): { value: Locale; label: string }[] {
  const names = new Intl.DisplayNames([displayLocale], { type: "language" });
  return locales.map((value) => ({ value, label: names.of(value) ?? value }));
}
```

`src/server/physios/form-options.ts`:

```ts
import "server-only";

import { env } from "@/env";
import { languageOptions, type Locale } from "@/i18n/config";
import { timeZoneOptions } from "@/lib/timezones";

/** Serialisable options ProfileForm needs, built on the server. */
export function profileFormOptions(displayLocale: Locale) {
  return {
    linkBase: new URL(env.NEXT_PUBLIC_APP_URL).host,
    timeZones: timeZoneOptions(),
    languages: languageOptions(displayLocale),
  };
}
```

`src/server/physios/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { Tx } from "@/db/rls";
import { handleProblem } from "@/lib/handles";
import { safeNextPath } from "@/lib/redirects";
import { withPhysio } from "@/server/auth/session";
import { setLocaleCookie } from "@/server/i18n/locale-cookie";

import { completeOnboarding, updateProfile, type ProfileResult } from "./mutations";
import { isHandleAvailable } from "./queries";
import {
  profileFieldErrors,
  profileSchema,
  type ProfileFormState,
  type ProfileInput,
} from "./schemas";

type ProfileMutation = (tx: Tx, physioId: string, input: ProfileInput) => Promise<ProfileResult>;

export async function completeOnboardingAction(
  _state: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const result = await saveProfile(formData, completeOnboarding);
  if (result.status !== "saved") return result;
  redirect(safeNextPath(formData.get("next")?.toString()));
}

export async function updateProfileAction(
  _state: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const result = await saveProfile(formData, updateProfile);
  if (result.status === "saved") revalidatePath("/", "layout");
  return result;
}

/** Live availability check for the handle field; invalid handles are never available. */
export async function checkHandleAction(handle: string): Promise<boolean> {
  const normalized = handle.trim().toLowerCase();
  if (handleProblem(normalized)) return false;
  return withPhysio((tx) => isHandleAvailable(tx, normalized));
}

async function saveProfile(
  formData: FormData,
  mutation: ProfileMutation,
): Promise<ProfileFormState> {
  const submittedHandle = String(formData.get("handle") ?? "")
    .trim()
    .toLowerCase();
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: profileFieldErrors(parsed.error), submittedHandle };
  }

  const result = await withPhysio((tx, physioId) => mutation(tx, physioId, parsed.data));
  if (!result.ok) {
    return result.error === "handleTaken"
      ? { status: "error", fieldErrors: { handle: "taken" }, submittedHandle }
      : { status: "error", fieldErrors: {}, submittedHandle, formError: "unknown" };
  }

  await setLocaleCookie(result.data.locale);
  return { status: "saved" };
}
```

- [ ] **Step 5: Implement `ProfileForm`**

`src/components/physios/profile-form.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState, useSyncExternalStore } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  HANDLE_MAX_LENGTH,
  handleFromName,
  handleProblem,
  type HandleProblem,
} from "@/lib/handles";
import { normalizeTimeZone, type TimeZoneOption } from "@/lib/timezones";
import { cn } from "@/lib/utils";
import type { ProfileFormState } from "@/server/physios/schemas";

export type ProfileFormValues = {
  displayName: string;
  handle: string;
  locale: string;
  timezone: string;
};

type HandleMessage = HandleProblem | "taken" | "available" | "checking";

const initialState: ProfileFormState = { status: "idle" };
const CHECK_DELAY_MS = 400;
const PREVIEW_SLUG = "ana-7k2m9qpx";

const selectClassName =
  "border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm";

// The browser's zone is only known on the client; the server snapshot is null.
const subscribeNever = () => () => {};
const readBrowserTimeZone = () =>
  normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);

export function ProfileForm({
  mode,
  action,
  checkHandle,
  defaults,
  savedHandle,
  linkBase,
  timeZones,
  languages,
  next,
}: {
  mode: "onboarding" | "settings";
  action: (state: ProfileFormState, formData: FormData) => Promise<ProfileFormState>;
  checkHandle: (handle: string) => Promise<boolean>;
  defaults: ProfileFormValues;
  savedHandle: string;
  linkBase: string;
  timeZones: TimeZoneOption[];
  languages: { value: string; label: string }[];
  next?: string;
}) {
  const t = useTranslations("ProfileForm");
  const [state, formAction, pending] = useActionState(action, initialState);

  const [displayName, setDisplayName] = useState(defaults.displayName);
  const [handle, setHandle] = useState(defaults.handle);
  const [handleEdited, setHandleEdited] = useState(mode === "settings");
  const [locale, setLocale] = useState(defaults.locale);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [remote, setRemote] = useState<{ handle: string; available: boolean } | null>(null);
  const browserTimeZone = useSyncExternalStore(subscribeNever, readBrowserTimeZone, () => null);

  const localProblem = handleProblem(handle);
  const unchanged = handle === savedHandle;

  useEffect(() => {
    if (localProblem || unchanged) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const available = await checkHandle(handle);
      if (!cancelled) setRemote({ handle, available });
    }, CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [handle, localProblem, unchanged, checkHandle]);

  const errors = state.status === "error" ? state.fieldErrors : {};
  const serverHandleError =
    state.status === "error" && state.submittedHandle === handle ? errors.handle : undefined;
  const handleMessage: HandleMessage | undefined =
    serverHandleError ??
    localProblem ??
    (unchanged
      ? undefined
      : remote?.handle === handle
        ? remote.available
          ? "available"
          : "taken"
        : "checking");
  const handleInvalid =
    handleMessage !== undefined && !["available", "checking"].includes(handleMessage);

  const browserZoneListed =
    browserTimeZone !== null && timeZones.some((zone) => zone.value === browserTimeZone);
  const effectiveTimezone =
    timezone ?? (mode === "onboarding" && browserZoneListed ? browserTimeZone : defaults.timezone);

  function onDisplayNameChange(value: string) {
    setDisplayName(value);
    if (handleEdited) return;
    const derived = handleFromName(value);
    if (derived) setHandle(derived);
  }

  return (
    <form action={formAction} className="grid gap-6" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="grid gap-2">
        <Label htmlFor="displayName">{t("displayName")}</Label>
        <Input
          id="displayName"
          name="displayName"
          value={displayName}
          maxLength={80}
          autoComplete="name"
          required
          aria-invalid={errors.displayName !== undefined}
          aria-describedby="displayName-message"
          onChange={(event) => onDisplayNameChange(event.target.value)}
        />
        <p
          id="displayName-message"
          className={cn(
            "text-sm",
            errors.displayName ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {errors.displayName ? t(`errors.${errors.displayName}`) : t("displayNameHint")}
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="handle">{t("handle")}</Label>
        <Input
          id="handle"
          name="handle"
          value={handle}
          maxLength={HANDLE_MAX_LENGTH}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          aria-invalid={handleInvalid}
          aria-describedby="handle-status handle-preview"
          onChange={(event) => {
            setHandle(event.target.value.toLowerCase());
            setHandleEdited(true);
          }}
        />
        <p
          id="handle-status"
          aria-live="polite"
          className={cn("text-sm", handleInvalid ? "text-destructive" : "text-muted-foreground")}
        >
          {handleMessage ? t(`handleStatus.${handleMessage}`) : t("handleHint")}
        </p>
        <p id="handle-preview" className="text-muted-foreground text-sm break-all">
          {t("linkPreview", { url: `${linkBase}/${handle}/${PREVIEW_SLUG}` })}
        </p>
      </div>

      {mode === "settings" && !unchanged ? (
        <Alert>
          <AlertDescription>{t("handleChangeNotice")}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="locale">{t("language")}</Label>
          <select
            id="locale"
            name="locale"
            value={locale}
            onChange={(event) => setLocale(event.target.value)}
            className={selectClassName}
          >
            {languages.map((language) => (
              <option key={language.value} value={language.value}>
                {language.label}
              </option>
            ))}
          </select>
          {errors.locale ? (
            <p className="text-destructive text-sm">{t(`errors.${errors.locale}`)}</p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="timezone">{t("timezone")}</Label>
          <select
            id="timezone"
            name="timezone"
            value={effectiveTimezone}
            onChange={(event) => setTimezone(event.target.value)}
            className={selectClassName}
          >
            {timeZones.map((zone) => (
              <option key={zone.value} value={zone.value}>
                {zone.label}
              </option>
            ))}
          </select>
          {errors.timezone ? (
            <p className="text-destructive text-sm">{t(`errors.${errors.timezone}`)}</p>
          ) : null}
        </div>
      </div>

      {state.status === "error" && state.formError ? (
        <Alert variant="destructive">
          <AlertDescription>{t("errors.unknown")}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t(mode === "onboarding" ? "submitOnboarding" : "submitSettings")}
        </Button>
        {state.status === "saved" && !pending ? (
          <p role="status" className="text-muted-foreground text-sm">
            {t("saved")}
          </p>
        ) : null}
      </div>
    </form>
  );
}
```

- [ ] **Step 6: Run the unit tests to see them pass**

Run: `pnpm test src/i18n src/components`
Expected: PASS. If `react-hooks` lint rules complain in `pnpm check`, keep state updates inside
the timeout callback (never synchronously in the effect body) as written above.

- [ ] **Step 7: Write the failing onboarding e2e test**

`e2e/onboarding.spec.ts`:

```ts
import { createPhysio, deletePhysio, expect, signIn, test } from "./helpers/auth";

test("a new physio picks a handle and reaches the dashboard", async ({ page }) => {
  const suffix = crypto.randomUUID().slice(0, 6);
  const physio = await createPhysio({ displayName: `Nora Test ${suffix}` });
  const other = await createPhysio({ onboarded: true, handle: `taken-${suffix}` });
  try {
    await signIn(page, physio);
    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByRole("heading", { name: "Set up your profile" })).toBeVisible();

    const handle = page.getByLabel("Handle");
    await expect(handle).toHaveValue(`nora-test-${suffix}`);
    await expect(page.getByText("Available", { exact: true })).toBeVisible();

    await handle.fill("dashboard");
    await expect(page.getByText("That handle is reserved. Pick another.")).toBeVisible();
    await handle.fill("ab");
    await expect(page.getByText("Use at least 3 characters.")).toBeVisible();
    await handle.fill(`taken-${suffix}`);
    await expect(page.getByText("That handle is already taken.")).toBeVisible();

    await handle.fill(`nora-${suffix}`);
    await expect(page.getByText("Available", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  } finally {
    await Promise.all([deletePhysio(physio), deletePhysio(other)]);
  }
});

test("onboarded physios are sent on from the onboarding page", async ({ physioPage: page }) => {
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/dashboard$/);
});
```

- [ ] **Step 8: Run it to see it fail**

Run: `pnpm test:e2e e2e/onboarding.spec.ts`
Expected: FAIL: `/onboarding` is a 404, no "Set up your profile" heading.

- [ ] **Step 9: Build the onboarding page**

`src/app/(auth)/onboarding/page.tsx`:

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { Logo } from "@/components/logo";
import { ProfileForm } from "@/components/physios/profile-form";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { isPlaceholderHandle } from "@/lib/handles";
import { safeNextPath } from "@/lib/redirects";
import { firstParam } from "@/lib/search-params";
import { withPhysio } from "@/server/auth/session";
import { checkHandleAction, completeOnboardingAction } from "@/server/physios/actions";
import { profileFormOptions } from "@/server/physios/form-options";
import { getProfile, suggestHandle } from "@/server/physios/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Onboarding");
  return { title: t("title") };
}

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const next = safeNextPath(firstParam((await searchParams).next));
  const { profile, suggestion } = await withPhysio(async (tx, physioId) => {
    const profile = await getProfile(tx, physioId);
    const suggestion =
      profile && isPlaceholderHandle(profile.handle)
        ? await suggestHandle(tx, profile.displayName)
        : null;
    return { profile, suggestion };
  });
  if (!profile) redirect("/login");
  if (profile.onboardedAt) redirect(next);

  const t = await getTranslations("Onboarding");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <Logo />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <h1 className="leading-none font-semibold">{t("title")}</h1>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            mode="onboarding"
            action={completeOnboardingAction}
            checkHandle={checkHandleAction}
            defaults={{
              displayName: profile.displayName,
              handle: suggestion ?? profile.handle,
              locale: profile.locale,
              timezone: profile.timezone,
            }}
            savedHandle={profile.handle}
            next={next}
            {...profileFormOptions(await getLocale())}
          />
        </CardContent>
      </Card>
    </main>
  );
}
```

(`CardTitle` renders a `div`, so the page uses an `h1` with the same styles: the e2e test and
screen readers need a heading.)

- [ ] **Step 10: Run the tests to see them pass**

Run: `pnpm test:e2e e2e/onboarding.spec.ts e2e/auth.spec.ts`
Expected: PASS on desktop and mobile.

- [ ] **Step 11: Verify and commit**

Run: `pnpm format && pnpm check && pnpm test:int && pnpm test:e2e`

```bash
git add src/i18n src/server/physios src/components/physios "src/app/(auth)/onboarding" \
  messages/en.json e2e/onboarding.spec.ts
git commit -m "Add profile form and onboarding with live handle checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Settings page, account menu and landing CTA

**Files:**

- Create: `src/components/user-menu.tsx`
- Modify: `src/app/(app)/layout.tsx`, `src/app/(app)/settings/page.tsx`,
  `src/app/(marketing)/page.tsx`, `messages/en.json`
- Create: `e2e/settings.spec.ts`; Modify: `e2e/smoke.spec.ts`, `e2e/onboarding.spec.ts`

**Interfaces:**

- Consumes: `requirePhysio`, `getSessionPhysio` (Task 7), `signOut` (Task 8), `ProfileForm`,
  `updateProfileAction`, `checkHandleAction`, `profileFormOptions` (Task 9), `PageHeader`.
- Produces: `UserMenu({ name, email, compact?, className? })` (client component).

- [ ] **Step 1: Add the copy**

In `messages/en.json`: in `"Landing"` replace `"secondaryCta": "Open dashboard"` with
`"dashboardCta": "Open dashboard"`, and add:

```json
  "Settings": {
    "title": "Settings",
    "profile": {
      "title": "Profile",
      "description": "Your name, handle, language and timezone."
    },
    "account": {
      "title": "Account",
      "description": "You sign in with this email.",
      "email": "Email",
      "signOut": "Sign out"
    }
  },
  "UserMenu": {
    "trigger": "Account menu",
    "settings": "Settings",
    "signOut": "Sign out"
  },
```

- [ ] **Step 2: Write the failing e2e tests**

`e2e/settings.spec.ts`:

```ts
import { expect, test } from "./helpers/auth";

test("a physio updates their profile", async ({ physioPage: page, physio }) => {
  await page.goto("/settings");
  await page.getByLabel("Display name").fill("Renamed Physio");
  const newHandle = `renamed-${physio.id.slice(0, 8)}`;
  await page.getByLabel("Handle").fill(newHandle);
  await expect(
    page.getByText("Links you already shared keep working and will show your new handle."),
  ).toBeVisible();
  await expect(page.getByText("Available", { exact: true })).toBeVisible();
  await page.getByLabel("Timezone").selectOption("Europe/Madrid");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");

  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue("Renamed Physio");
  await expect(page.getByLabel("Handle")).toHaveValue(newHandle);
  await expect(page.getByLabel("Timezone")).toHaveValue("Europe/Madrid");
  await expect(page.getByRole("main").getByText(physio.email)).toBeVisible();
});

test("a physio signs out from the account menu", async ({ physioPage: page }) => {
  await page.getByRole("button", { name: "Account menu" }).filter({ visible: true }).click();
  await expect(page.getByRole("menu")).toContainText("E2E Physio");
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByRole("link", { name: "Get started" })).toBeVisible();
});

test("after signing out, protected pages send you to login", async ({ physioPage: page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings$/);
});

test("the landing page offers the dashboard to signed-in physios", async ({ physioPage: page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Open dashboard" })).toHaveAttribute(
    "href",
    "/dashboard",
  );
});
```

At the end of the first test in `e2e/onboarding.spec.ts` (after the `/dashboard` assertion)
add:

```ts
await page.getByRole("button", { name: "Account menu" }).filter({ visible: true }).click();
await expect(page.getByRole("menu")).toContainText(`Nora Test ${suffix}`);
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm test:e2e e2e/settings.spec.ts e2e/onboarding.spec.ts`
Expected: FAIL: settings is still the placeholder; there is no "Account menu".

- [ ] **Step 4: Build the account menu**

`src/components/user-menu.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { signOut } from "@/server/auth/actions";

export function UserMenu({
  name,
  email,
  compact = false,
  className,
}: {
  name: string;
  email: string;
  /** Avatar-only trigger for the mobile header. */
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations("UserMenu");
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          aria-label={t("trigger")}
          className={cn(
            compact ? "size-9 rounded-full p-0" : "h-auto min-w-0 justify-start gap-3 px-2 py-2",
            className,
          )}
        >
          <span
            aria-hidden
            className="bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
          >
            {initial}
          </span>
          {compact ? null : (
            <span className="grid min-w-0 text-left">
              <span className="truncate text-sm font-medium">{name}</span>
              <span className="text-muted-foreground truncate text-xs">{email}</span>
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="grid">
          <span className="truncate">{name}</span>
          <span className="text-muted-foreground truncate text-xs font-normal">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">{t("settings")}</Link>
        </DropdownMenuItem>
        {/* Call the action directly: a <form> inside the menu unmounts before it can submit. */}
        <DropdownMenuItem onSelect={() => void signOut()}>{t("signOut")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 5: Use it in the workspace shell**

In `src/app/(app)/layout.tsx`:

- `const { profile } = await requirePhysio();` (replacing the bare `await requirePhysio();`).
- Import `UserMenu` from `@/components/user-menu`.
- In the sidebar footer, replace `<AppNav group="secondary" className="flex-1" />` with
  `<UserMenu name={profile.displayName} email={profile.email} className="flex-1" />`.
- In the mobile header, replace the lone `<ThemeToggle />` with:

```tsx
<div className="flex items-center gap-1">
  <ThemeToggle />
  <UserMenu name={profile.displayName} email={profile.email} compact />
</div>
```

- [ ] **Step 6: Build the settings page**

Replace `src/app/(app)/settings/page.tsx` with:

```tsx
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { ProfileForm } from "@/components/physios/profile-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signOut } from "@/server/auth/actions";
import { requirePhysio } from "@/server/auth/session";
import { checkHandleAction, updateProfileAction } from "@/server/physios/actions";
import { profileFormOptions } from "@/server/physios/form-options";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Settings");
  return { title: t("title") };
}

export default async function SettingsPage() {
  const { profile } = await requirePhysio();
  const t = await getTranslations("Settings");

  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} />
      <Card>
        <CardHeader>
          <CardTitle>{t("profile.title")}</CardTitle>
          <CardDescription>{t("profile.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            mode="settings"
            action={updateProfileAction}
            checkHandle={checkHandleAction}
            defaults={{
              displayName: profile.displayName,
              handle: profile.handle,
              locale: profile.locale,
              timezone: profile.timezone,
            }}
            savedHandle={profile.handle}
            {...profileFormOptions(await getLocale())}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("account.title")}</CardTitle>
          <CardDescription>{t("account.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            <span className="text-muted-foreground">{t("account.email")}: </span>
            {profile.email}
          </p>
          <form action={signOut}>
            <Button type="submit" variant="outline">
              {t("account.signOut")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 7: Switch the landing CTA on the session**

Replace `src/app/(marketing)/page.tsx`'s component with an async one that reads the session:

```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { getSessionPhysio } from "@/server/auth/session";

export default async function LandingPage() {
  const t = await getTranslations("Landing");
  const session = await getSessionPhysio();

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <Logo />
        <ThemeToggle />
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 px-6 pb-24 text-center">
        <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          {t("eyebrow")}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {t("headline")}
        </h1>
        <p className="text-muted-foreground max-w-xl text-lg text-pretty">{t("subheadline")}</p>
        <Button asChild size="lg">
          {session ? (
            <Link href="/dashboard">{t("dashboardCta")}</Link>
          ) : (
            <Link href="/login">{t("primaryCta")}</Link>
          )}
        </Button>
      </main>
    </div>
  );
}
```

- [ ] **Step 8: Run the tests to see them pass**

Run: `pnpm test:e2e`
Expected: every e2e file PASSES on desktop and mobile (including `smoke.spec.ts`'s
"Get started" test).

- [ ] **Step 9: Verify and commit**

Run: `pnpm format && pnpm check && pnpm test:int && pnpm test:e2e`

```bash
git add src/components/user-menu.tsx "src/app/(app)" "src/app/(marketing)/page.tsx" \
  messages/en.json e2e
git commit -m "Add settings page, account menu and signed-in landing CTA

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Docs and final verification

**Files:**

- Modify: `README.md`, `CLAUDE.md`, `docs/specs/01-auth-and-physio-profile.md`,
  `docs/specs/README.md`

- [ ] **Step 1: Update the README**

In `README.md`:

- Status line: `> **Status:** sign-in, onboarding and profile (spec 01) are built. Features are
specified in [`docs/specs/`](docs/specs/README.md) and built one per session.`
- Getting started: requirement `Node 24 (see .nvmrc)`; replace the setup block with:

````md
```bash
pnpm install
pnpm db:start            # local Supabase in Docker
cp .env.example .env.local
# Copy PUBLISHABLE_KEY and SECRET_KEY from `pnpm exec supabase status -o env` into
# NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY in .env.local
pnpm dev                 # http://localhost:3000, sign-in emails land in Mailpit (http://127.0.0.1:54324)
```
````

- Scripts table: add a row `| \`pnpm test:int\` | Integration tests against local Supabase (RLS, triggers, queries) |`.
- Add a section before "Project docs":

```md
## Hosted Supabase setup

Local config lives in `supabase/config.toml`; a hosted project needs the same settings in the
dashboard:

1. **Data API**: disable it (Project Settings → Data API). The app only talks to Postgres
   through Drizzle on the server.
2. **Auth → URL configuration**: Site URL = the app URL; add `<app URL>/auth/**` to the
   redirect URLs. A missing redirect URL breaks magic links (they fall back to the Site URL).
3. **Auth → Email templates**: paste `supabase/templates/magic_link.html` into both "Magic
   Link" and "Confirm signup".
4. **Auth → SMTP**: configure a real SMTP provider before launch; the built-in sender is
   rate-limited.
5. **Google** (optional): enable the provider with the Google Cloud client id/secret, then set
   `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true` in the app's environment.
```

- [ ] **Step 2: Update CLAUDE.md**

In the `## Commands` block, add after `pnpm test`:

```bash
pnpm test:int        # integration tests against local Supabase (needs pnpm db:start)
```

- [ ] **Step 3: Close out the spec**

In `docs/specs/01-auth-and-physio-profile.md`: set **Status** to `Done`, tick every acceptance
criterion that is verified, and replace "(Fill in while building.)" under **Decisions made
during implementation** with a bullet per deviation found while building (at minimum: any
generated constraint name that differed, any API that behaved differently from this plan).
In `docs/specs/README.md`, set spec 01's status to `Done`.

- [ ] **Step 4: Full verification**

Run, with local Supabase running:

```bash
pnpm check
pnpm test:int
pnpm test:e2e
pnpm db:generate && git diff --exit-code supabase/migrations
```

Expected: all green; `db:generate` reports no schema changes.

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md docs/specs
git commit -m "Document auth setup and mark spec 01 done

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

After this, follow CLAUDE.md step 4: `superpowers:requesting-code-review`, then
`superpowers:finishing-a-development-branch`.
