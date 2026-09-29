# Customers and Cases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Physios create, search, edit and archive customers, and keep injury cases (open/close/reopen) per customer, with a URL-tabbed customer hub.

**Architecture:** Two new tables (`customers`, `cases`) with composite `(physio_id, …)` FKs and RLS, following spec 03's patterns. Server layer `src/server/customers/{schemas,queries,mutations,hooks,actions}.ts` (mutations take `(tx, physioId, …)`, actions are thin). Pages are Server Components; forms are client components using `useActionState` with the `onSubmit` dispatch trick from `ExerciseForm`. Tabs are link-based (`?tab=`).

**Tech Stack:** Next.js 16, Drizzle + Supabase Postgres, zod v4, next-intl, shadcn/ui, Vitest, Playwright.

**Spec:** `docs/specs/04-customers-and-cases.md` (answers recorded there). Architecture: `docs/architecture.md`.

## Global Constraints

- Every physio-owned table: `physio_id` FK to `physios` on delete cascade, RLS `ownRows` policy, index on `physio_id`, `set_updated_at` trigger (`schema-conventions` int test enforces).
- Queries/mutations run inside `withPhysio` (actions) / `runAsPhysio` (tests) **and** filter by `physio_id` explicitly.
- Cross-row references are composite `(physio_id, id)` so a row can never point at another physio's row.
- Every user-visible string lives in **both** `messages/en.json` and `messages/es.json` in the same commit (Spanish is Rioplatense voseo: "ingresá", "elegí"). No hard-coded copy. Dates/ages via next-intl formatters (`useFormatter`/`getFormatter`), never hard-coded `en-US`.
- Colours: design tokens only (`bg-muted`, `text-muted-foreground`, `bg-primary`, `text-destructive`). Never hard-code colours.
- Don't pass functions (incl. lucide icons) from Server to Client Components.
- Next.js 16: `params`/`searchParams` async; use `PageProps<"/customers/[customerId]">`; check `node_modules/next/dist/docs/` before using an unfamiliar API.
- Node: prefix shell commands with `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"`.
- No new top-level route (only `/customers/...`), so `RESERVED_HANDLES` is untouched.
- Hard delete of customers/cases from the UI is not offered (archive only). Cases die only via customer cascade.
- Commit after every task; commit messages Conventional Commits, ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

Inputs the spec implies but that need explicit tests (each is pinned in the owning task):

1. Search with accents/case and LIKE wildcards: `jose` finds "José", `50%` and `a_b` match literally (Task 3).
2. Customer/case ids belonging to another physio, or malformed ids, passed to actions/queries → `notFound`, never a crash or a leak (Tasks 2, 3, 4).
3. Free-text phone: garbage or `javascript:` strings never yield a `tel:`/WhatsApp href; WhatsApp only for international numbers (`+…`/`00…`, 7–15 digits) (Task 1).
4. Age around birthdays, Feb 29 and timezone day boundaries; future or invalid DOB never crashes (Task 1).
5. Closing a case before its `opened_on`, closing an already-closed case, reopening an open case (Tasks 3, 9).
6. Invalid `?tab=`, `?sort=`, `?archived=` and unknown/other-tenant `customerId` in the URL → sensible default or 404 (Tasks 1, 6, 8).
7. Names with a single letter, no last name, or non-Latin/emoji first characters render initials without breaking (Task 1).

---

## File Structure

| File                                                                | Responsibility                                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `src/lib/customers.ts`                                              | Constants (sexes, case statuses, tabs, limits) shared by DB/zod/UI |
| `src/lib/calendar-date.ts`                                          | `todayIn`, `isCalendarDate`, `ageInYears`                          |
| `src/lib/phone.ts`                                                  | `telHref`, `whatsappHref`                                          |
| `src/lib/initials.ts`                                               | `initials(first, last)`                                            |
| `src/lib/customer-params.ts`                                        | `/customers` URL filters + `customersHref`, tab parsing            |
| `src/db/schema/customers.ts` (+ `enums.ts`, `index.ts`)             | `customers`, `cases` tables and enums                              |
| `supabase/migrations/*_customers*.sql`                              | Generated migration + custom extras (trigram index, triggers)      |
| `src/server/customers/schemas.ts`                                   | zod schemas, form parsing, field-error mapping, `Result`           |
| `src/server/customers/hooks.ts`                                     | `onCustomerArchived` (spec 10 will revoke links here)              |
| `src/server/customers/queries.ts`                                   | list/get/hasAny                                                    |
| `src/server/customers/mutations.ts`                                 | customer + case mutations                                          |
| `src/server/customers/actions.ts`                                   | Server Actions                                                     |
| `src/components/customers/*`                                        | Avatar, toolbar, results, forms, header, tabs, overview, case UI   |
| `src/app/(app)/customers/{page,new/page,[customerId]/{page,edit/page}}.tsx` | Routes                                                     |
| `messages/{en,es}.json`                                             | `Customers`, `Cases` namespaces                                    |
| `e2e/customers.spec.ts`                                             | Critical flow                                                      |

---

### Task 1: Pure helpers and constants

**Files:**
- Create: `src/lib/customers.ts`, `src/lib/calendar-date.ts`, `src/lib/phone.ts`, `src/lib/initials.ts`, `src/lib/customer-params.ts`
- Test: `src/lib/calendar-date.test.ts`, `src/lib/phone.test.ts`, `src/lib/initials.test.ts`, `src/lib/customer-params.test.ts`

**Interfaces:**
- Produces:
  - `customers.ts`: `CUSTOMER_SEXES = ["female","male","other","undisclosed"] as const`, `type CustomerSex`, `CASE_STATUSES = ["open","closed"] as const`, `type CaseStatus`, `CUSTOMER_TABS = ["overview","routines","plans","activity","notes"] as const`, `type CustomerTab`, `parseCustomerTab(value: string | undefined): CustomerTab` (invalid → `"overview"`), limits: `FIRST_NAME_MAX=60, LAST_NAME_MAX=60, EMAIL_MAX=254, PHONE_MAX=30, OCCUPATION_MAX=100, ACTIVITY_MAX=200, MEDICAL_HISTORY_MAX=5000, CASE_TITLE_MAX=120, DIAGNOSIS_MAX=500, PRECAUTIONS_MAX=2000, GOALS_MAX=2000, CASE_NOTES_MAX=5000`.
  - `calendar-date.ts`: `todayIn(timeZone: string, now?: Date): string` (`YYYY-MM-DD`), `isCalendarDate(value: string): boolean` (strict, real calendar day, year ≥ 1900), `ageInYears(dob: string, timeZone: string, now?: Date): number | null` (null when invalid or in the future).
  - `phone.ts`: `telHref(phone: string): string | null`, `whatsappHref(phone: string): string | null`.
  - `initials.ts`: `initials(firstName: string, lastName: string | null): string`.
  - `customer-params.ts`: `type CustomerSort = "name" | "recent"`, `type CustomerFilters = { q: string; archived: boolean; sort: CustomerSort }`, `DEFAULT_CUSTOMER_FILTERS`, `CUSTOMER_SEARCH_MAX_LENGTH = 100`, `parseCustomerParams(params): CustomerFilters`, `hasActiveCustomerFilters(f): boolean`, `customersHref(f, changes?): Route`.

- [ ] **Step 1: Write failing tests**

`src/lib/calendar-date.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { ageInYears, isCalendarDate, todayIn } from "./calendar-date";

describe("todayIn", () => {
  it("uses the given time zone's calendar day", () => {
    const now = new Date("2026-09-29T02:30:00Z");
    expect(todayIn("UTC", now)).toBe("2026-09-29");
    expect(todayIn("America/Montevideo", now)).toBe("2026-09-28"); // UTC-3
    expect(todayIn("Pacific/Auckland", now)).toBe("2026-09-29"); // UTC+13
  });
});

describe("isCalendarDate", () => {
  it.each(["2000-02-29", "1990-12-31", "1900-01-01"])("accepts %s", (v) =>
    expect(isCalendarDate(v)).toBe(true),
  );
  it.each(["2001-02-29", "2026-13-01", "2026-00-10", "2026-04-31", "1899-12-31", "26-01-01", "", "2026-1-1", "abc"])(
    "rejects %s",
    (v) => expect(isCalendarDate(v)).toBe(false),
  );
});

describe("ageInYears", () => {
  const now = new Date("2026-09-29T12:00:00Z");
  it("counts completed years", () => {
    expect(ageInYears("1990-09-29", "UTC", now)).toBe(36); // birthday today
    expect(ageInYears("1990-09-30", "UTC", now)).toBe(35); // birthday tomorrow
    expect(ageInYears("1990-09-28", "UTC", now)).toBe(36);
  });
  it("handles Feb 29 birthdays (birthday reached on Mar 1 in common years)", () => {
    expect(ageInYears("2000-02-29", "UTC", new Date("2026-02-28T12:00:00Z"))).toBe(25);
    expect(ageInYears("2000-02-29", "UTC", new Date("2026-03-01T12:00:00Z"))).toBe(26);
  });
  it("uses the time zone's day, not UTC's", () => {
    const edge = new Date("2026-09-29T02:00:00Z"); // still Sep 28 in Montevideo
    expect(ageInYears("1990-09-29", "UTC", edge)).toBe(36);
    expect(ageInYears("1990-09-29", "America/Montevideo", edge)).toBe(35);
  });
  it("returns null for invalid or future dates", () => {
    expect(ageInYears("nope", "UTC", now)).toBeNull();
    expect(ageInYears("2030-01-01", "UTC", now)).toBeNull();
  });
});
```

`src/lib/phone.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { telHref, whatsappHref } from "./phone";

describe("telHref", () => {
  it("keeps only digits and a leading +", () => {
    expect(telHref("+598 99 123 456")).toBe("tel:+59899123456");
    expect(telHref("(099) 123-456")).toBe("tel:099123456");
  });
  it("never builds a link from text that is not phone-like", () => {
    expect(telHref("")).toBeNull();
    expect(telHref("no phone")).toBeNull();
    expect(telHref("javascript:alert(1)")).toBeNull();
    expect(telHref("123;evil")).toBeNull();
  });
});

describe("whatsappHref", () => {
  it("needs an international number", () => {
    expect(whatsappHref("+598 99 123 456")).toBe("https://wa.me/59899123456");
    expect(whatsappHref("00598 99 123 456")).toBe("https://wa.me/59899123456");
    expect(whatsappHref("099 123 456")).toBeNull();
  });
  it("rejects lengths outside 7-15 digits", () => {
    expect(whatsappHref("+12345")).toBeNull();
    expect(whatsappHref("+1234567890123456")).toBeNull();
  });
  it("rejects junk", () => {
    expect(whatsappHref("javascript:alert(1)")).toBeNull();
  });
});
```

`src/lib/initials.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { initials } from "./initials";

describe("initials", () => {
  it("uses first letters of first and last name, uppercased", () => {
    expect(initials("ana", "garcía")).toBe("AG");
  });
  it("works without a last name or with a single letter", () => {
    expect(initials("Ana", null)).toBe("A");
    expect(initials("a", "")).toBe("A");
  });
  it("is unicode-safe", () => {
    expect(initials("Ñandú", "Öz")).toBe("ÑÖ");
    expect(initials("😀 Sam", null)).toBe("😀");
  });
  it("never returns an empty string for a non-empty name", () => {
    expect(initials("  ", null)).toBe("?");
  });
});
```

`src/lib/customer-params.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { customersHref, DEFAULT_CUSTOMER_FILTERS, hasActiveCustomerFilters, parseCustomerParams } from "./customer-params";
import { parseCustomerTab } from "./customers";

describe("parseCustomerParams", () => {
  it("defaults", () => {
    expect(parseCustomerParams({})).toEqual(DEFAULT_CUSTOMER_FILTERS);
  });
  it("parses q, archived and sort; ignores junk", () => {
    expect(parseCustomerParams({ q: "  ana ", archived: "1", sort: "recent" })).toEqual({
      q: "ana",
      archived: true,
      sort: "recent",
    });
    expect(parseCustomerParams({ archived: "yes", sort: "bogus" })).toEqual(DEFAULT_CUSTOMER_FILTERS);
    expect(parseCustomerParams({ q: ["a", "b"] }).q).toBe("a");
    expect(parseCustomerParams({ q: "x".repeat(300) }).q).toHaveLength(100);
  });
});

describe("customersHref / hasActiveCustomerFilters", () => {
  it("omits defaults", () => {
    expect(customersHref(DEFAULT_CUSTOMER_FILTERS)).toBe("/customers");
    expect(customersHref(DEFAULT_CUSTOMER_FILTERS, { q: "ana", archived: true, sort: "recent" })).toBe(
      "/customers?q=ana&archived=1&sort=recent",
    );
  });
  it("flags active filters", () => {
    expect(hasActiveCustomerFilters(DEFAULT_CUSTOMER_FILTERS)).toBe(false);
    expect(hasActiveCustomerFilters({ ...DEFAULT_CUSTOMER_FILTERS, q: "a" })).toBe(true);
    expect(hasActiveCustomerFilters({ ...DEFAULT_CUSTOMER_FILTERS, archived: true })).toBe(true);
  });
});

describe("parseCustomerTab", () => {
  it("falls back to overview", () => {
    expect(parseCustomerTab("routines")).toBe("routines");
    expect(parseCustomerTab("nope")).toBe("overview");
    expect(parseCustomerTab(undefined)).toBe("overview");
  });
});
```

Sort `"name"` is the default and omitted from the URL.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/lib/calendar-date.test.ts src/lib/phone.test.ts src/lib/initials.test.ts src/lib/customer-params.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/lib/customers.ts`:

```ts
/** Customer and case constants shared by the schema, zod and UI (spec 04). */
export const CUSTOMER_SEXES = ["female", "male", "other", "undisclosed"] as const;
export type CustomerSex = (typeof CUSTOMER_SEXES)[number];

export const CASE_STATUSES = ["open", "closed"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

/** Customer hub tabs, addressed as `?tab=`. */
export const CUSTOMER_TABS = ["overview", "routines", "plans", "activity", "notes"] as const;
export type CustomerTab = (typeof CUSTOMER_TABS)[number];

export function parseCustomerTab(value: string | undefined): CustomerTab {
  return (CUSTOMER_TABS as readonly string[]).includes(value ?? "")
    ? (value as CustomerTab)
    : "overview";
}

export const FIRST_NAME_MAX = 60;
export const LAST_NAME_MAX = 60;
export const EMAIL_MAX = 254;
export const PHONE_MAX = 30;
export const OCCUPATION_MAX = 100;
export const ACTIVITY_MAX = 200;
export const MEDICAL_HISTORY_MAX = 5000;
export const CASE_TITLE_MAX = 120;
export const DIAGNOSIS_MAX = 500;
export const PRECAUTIONS_MAX = 2000;
export const GOALS_MAX = 2000;
export const CASE_NOTES_MAX = 5000;
```

`src/lib/calendar-date.ts`:

```ts
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Calendar day (`YYYY-MM-DD`) of `now` in `timeZone`. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** A real calendar day written `YYYY-MM-DD`, year 1900 or later. */
export function isCalendarDate(value: string): boolean {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 1900) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** Completed years between `dob` and today in `timeZone`; null if `dob` is invalid or in the future. */
export function ageInYears(dob: string, timeZone: string, now: Date = new Date()): number | null {
  if (!isCalendarDate(dob)) return null;
  const today = todayIn(timeZone, now);
  if (dob > today) return null;
  const [by, bm, bd] = dob.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  // Compare (month, day) lexicographically: Feb 29 birthdays are reached on Mar 1 in common years.
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}
```

`src/lib/phone.ts`:

```ts
/** Only phone-like text (digits, spaces, + ( ) . -) may become a link. */
const PHONE_LIKE = /^[\d\s+().-]+$/;
const INTERNATIONAL = /^\s*(\+|00)/;

/** `tel:` link built only from digits (and a leading +); null when the text is not phone-like. */
export function telHref(phone: string): string | null {
  if (!PHONE_LIKE.test(phone)) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  return `tel:${phone.trim().startsWith("+") ? "+" : ""}${digits}`;
}

/** wa.me link for an international number (`+…` or `00…`, 7–15 digits); null otherwise. */
export function whatsappHref(phone: string): string | null {
  if (!PHONE_LIKE.test(phone) || !INTERNATIONAL.test(phone)) return null;
  const digits = phone.replace(/\D/g, "").replace(/^00/, "");
  return digits.length >= 7 && digits.length <= 15 ? `https://wa.me/${digits}` : null;
}
```

`src/lib/initials.ts`:

```ts
const firstChar = (value: string) => Array.from(value.trim())[0] ?? "";

/** Up to two initials (first letter of first and last name), uppercased; "?" if there is none. */
export function initials(firstName: string, lastName: string | null): string {
  const result = (firstChar(firstName) + firstChar(lastName ?? "")).toLocaleUpperCase();
  return result || "?";
}
```

`src/lib/customer-params.ts`:

```ts
import type { Route } from "next";

import { firstParam } from "./search-params";

export type CustomerSort = "name" | "recent";
/** /customers filters, all reflected in the URL (`?q=&archived=1&sort=recent`). */
export type CustomerFilters = { q: string; archived: boolean; sort: CustomerSort };

export const CUSTOMER_SEARCH_MAX_LENGTH = 100;
export const DEFAULT_CUSTOMER_FILTERS: CustomerFilters = { q: "", archived: false, sort: "name" };

type Params = Record<string, string | string[] | undefined>;

export function parseCustomerParams(params: Params): CustomerFilters {
  return {
    q: (firstParam(params.q) ?? "").trim().slice(0, CUSTOMER_SEARCH_MAX_LENGTH),
    archived: firstParam(params.archived) === "1",
    sort: firstParam(params.sort) === "recent" ? "recent" : "name",
  };
}

export function hasActiveCustomerFilters(filters: CustomerFilters): boolean {
  return filters.q !== "" || filters.archived;
}

export function customersHref(
  filters: CustomerFilters,
  changes: Partial<CustomerFilters> = {},
): Route {
  const next = { ...filters, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.archived) params.set("archived", "1");
  if (next.sort !== "name") params.set("sort", next.sort);
  const query = params.toString();
  return (query ? `/customers?${query}` : "/customers") as Route;
}
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `pnpm exec vitest run src/lib/calendar-date.test.ts src/lib/phone.test.ts src/lib/initials.test.ts src/lib/customer-params.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib && git commit -m "feat(customers): pure helpers for dates, phones, initials and list params"
```

---

### Task 2: Schema, migrations, RLS

**Files:**
- Create: `src/db/schema/customers.ts`, custom migration, `src/db/customers.int.test.ts`
- Modify: `src/db/schema/enums.ts`, `src/db/schema/index.ts`
- Generated: `supabase/migrations/*`

**Interfaces:**
- Consumes: `CUSTOMER_SEXES`, `CASE_STATUSES` and limits (Task 1); `bodyAreaEnum`, `bodySideEnum`, `timestamps`, `physios`.
- Produces: tables `customers`, `cases`; types `Customer`, `NewCustomer`, `Case`, `NewCase`; enums `customerSexEnum`, `caseStatusEnum`. SQL index `customers_name_search_idx` on `public.f_unaccent(lower(first_name || ' ' || coalesce(last_name, '')))`.

- [ ] **Step 1: Add enums** to `src/db/schema/enums.ts` (relative imports only):

```ts
import { CASE_STATUSES, CUSTOMER_SEXES } from "../../lib/customers";

export const customerSexEnum = pgEnum("customer_sex", CUSTOMER_SEXES);
export const caseStatusEnum = pgEnum("case_status", CASE_STATUSES);
```

- [ ] **Step 2: Write `src/db/schema/customers.ts`.** Mirror `library.ts` (`ownRows`, `physioId()` helpers are file-local there: copy them, or extract to `_columns.ts`/`_policies.ts` if you prefer; do not break `library.ts`). Relative imports for `../../lib/customers` limits. Definition:

```ts
export const customers = pgTable(
  "customers",
  {
    id: uuid().primaryKey().defaultRandom(),
    physioId: physioId(),
    firstName: text().notNull(),
    lastName: text(),
    email: text(),
    phone: text(),
    dateOfBirth: date({ mode: "string" }),
    sex: customerSexEnum(),
    occupation: text(),
    activity: text(),
    medicalHistory: text(),
    locale: text().notNull(),
    archivedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("customers_physio_id_id_unique").on(t.physioId, t.id),
    index("customers_physio_id_archived_at_idx").on(t.physioId, t.archivedAt),
    check("customers_first_name_length", sql`char_length(${t.firstName}) between 1 and ${sql.raw(String(FIRST_NAME_MAX))}`),
    check("customers_last_name_length", sql`char_length(${t.lastName}) <= ${sql.raw(String(LAST_NAME_MAX))}`),
    check("customers_email_length", sql`char_length(${t.email}) <= ${sql.raw(String(EMAIL_MAX))}`),
    check("customers_phone_length", sql`char_length(${t.phone}) <= ${sql.raw(String(PHONE_MAX))}`),
    check("customers_occupation_length", sql`char_length(${t.occupation}) <= ${sql.raw(String(OCCUPATION_MAX))}`),
    check("customers_activity_length", sql`char_length(${t.activity}) <= ${sql.raw(String(ACTIVITY_MAX))}`),
    check("customers_medical_history_length", sql`char_length(${t.medicalHistory}) <= ${sql.raw(String(MEDICAL_HISTORY_MAX))}`),
    ownRows("customers_own", t.physioId),
  ],
);

export const cases = pgTable(
  "cases",
  {
    id: uuid().primaryKey().defaultRandom(),
    physioId: physioId(),
    customerId: uuid().notNull(),
    title: text().notNull(),
    diagnosis: text(),
    bodyArea: bodyAreaEnum(),
    side: bodySideEnum(),
    injuryOn: date({ mode: "string" }),
    surgeryOn: date({ mode: "string" }),
    precautions: text(),
    goals: text(),
    initialPain: smallint(),
    notes: text(),
    status: caseStatusEnum().notNull().default("open"),
    openedOn: date({ mode: "string" }).notNull().default(sql`current_date`),
    closedOn: date({ mode: "string" }),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: "cases_customer_fk",
      columns: [t.physioId, t.customerId],
      foreignColumns: [customers.physioId, customers.id],
    }).onDelete("cascade"),
    index("cases_customer_id_idx").on(t.physioId, t.customerId, t.status),
    check("cases_title_length", sql`char_length(${t.title}) between 1 and ${sql.raw(String(CASE_TITLE_MAX))}`),
    check("cases_diagnosis_length", sql`char_length(${t.diagnosis}) <= ${sql.raw(String(DIAGNOSIS_MAX))}`),
    check("cases_precautions_length", sql`char_length(${t.precautions}) <= ${sql.raw(String(PRECAUTIONS_MAX))}`),
    check("cases_goals_length", sql`char_length(${t.goals}) <= ${sql.raw(String(GOALS_MAX))}`),
    check("cases_notes_length", sql`char_length(${t.notes}) <= ${sql.raw(String(CASE_NOTES_MAX))}`),
    check("cases_initial_pain_range", sql`${t.initialPain} between 0 and 10`),
    check("cases_area_not_full_body", sql`${t.bodyArea} <> 'full_body'`),
    check("cases_side_needs_area", sql`${t.side} is null or ${t.bodyArea} is not null`),
    check("cases_closed_on_matches_status", sql`(${t.status} = 'closed') = (${t.closedOn} is not null)`),
    check("cases_closed_not_before_opened", sql`${t.closedOn} >= ${t.openedOn}`),
    ownRows("cases_own", t.physioId),
  ],
);
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type Case = typeof cases.$inferSelect;
export type NewCase = typeof cases.$inferInsert;
```

Add `export * from "./customers";` to `schema/index.ts`.

- [ ] **Step 3: Generate the migration**

```bash
pnpm db:generate --name=customers-and-cases
pnpm exec drizzle-kit generate --custom --name=customers-extras
```

Edit the custom (empty) `*_customers-extras.sql`:

```sql
-- Customers and cases extras (spec 04): things Drizzle can't express.

-- Accent-insensitive partial name search (same recipe as exercises_name_search_idx).
create index customers_name_search_idx on public.customers
  using gin (public.f_unaccent(lower(first_name || ' ' || coalesce(last_name, ''))) extensions.gin_trgm_ops);

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

create trigger cases_set_updated_at
  before update on public.cases
  for each row execute function public.set_updated_at();
```

Inspect the generated SQL: enums, composite FK `on delete cascade`, RLS enabled, policies present.

- [ ] **Step 4: Write the failing int test** `src/db/customers.int.test.ts` (needs the DB from Task 0; mirror `src/db/library.int.test.ts` structure: `createTestPhysio`, `runAsPhysio`, cleanup with `deleteTestPhysios`). Cases:
  - physio B `select` from `customers`/`cases` sees 0 of A's rows; B `update`/`delete` on A's rows affect 0 rows.
  - B inserting a customer with `physioId = A.id` fails (RLS `withCheck`).
  - B inserting a case with `physioId = B.id, customerId = <A's customer>` fails with FK violation `cases_customer_fk` (`isForeignKeyViolation`), because of the composite FK. Use a savepoint (`tx.transaction`) around the failing statement.
  - Deleting a customer cascades its cases.
  - Check constraints: `initialPain` 11 → `cases_initial_pain_range`; `bodyArea: "full_body"` → `cases_area_not_full_body`; `status: "closed"` without `closedOn` → `cases_closed_on_matches_status`; `closedOn` earlier than `openedOn` → `cases_closed_not_before_opened`; `side: "left"` without area → `cases_side_needs_area`; empty `firstName` → `customers_first_name_length`.
  - `updated_at` advances on update (trigger) for both tables (insert, wait 5 ms via `await new Promise(r => setTimeout(r, 5))`, update, compare).
  Use `isCheckViolation(error, "<constraint>")` from `@/db/errors`, wrapping failing statements in `tx.transaction(...)` savepoints as `library.int.test.ts`/`mutations.ts` do.

- [ ] **Step 5: Run.** `pnpm db:reset` then `pnpm test:int` (with the env from Task 0). Expected: new tests pass, `schema-conventions` still passes.

- [ ] **Step 6: Commit**

```bash
git add src/db supabase && git commit -m "feat(customers): customers and cases tables with RLS"
```

---

### Task 3: Server schemas, queries, mutations

**Files:**
- Create: `src/server/customers/schemas.ts`, `hooks.ts`, `queries.ts`, `mutations.ts`
- Test: `src/server/customers/schemas.test.ts` (unit), `src/server/customers/customers.int.test.ts` (int), `src/server/customers/hooks.int.test.ts` (int)

**Interfaces:**
- Consumes: Task 1 helpers, Task 2 tables, `Tx`, `escapeLike`, `caseBodyAreaSchema`/`bodySideSchema` from `@/lib/body-areas`, `locales`/`isLocale` from `@/i18n/config`.
- Produces (exact signatures later tasks use):

```ts
// schemas.ts
export type Result<T, E extends string> = { ok: true; data: T } | { ok: false; error: E };
export const idSchema = z.uuid();
export const customerSchema;      // z.output → CustomerInput
export type CustomerInput = {
  firstName: string; lastName: string | null; email: string | null; phone: string | null;
  dateOfBirth: string | null; sex: CustomerSex | null; occupation: string | null;
  activity: string | null; medicalHistory: string | null; locale: Locale | null;
};
export const caseSchema;          // → CaseInput
export type CaseInput = {
  title: string; diagnosis: string | null; bodyArea: CaseBodyArea | null; side: BodySide | null;
  injuryOn: string | null; surgeryOn: string | null; precautions: string | null; goals: string | null;
  initialPain: number | null; notes: string | null; openedOn: string | null;
};
export const closeCaseSchema;     // { id: uuid, closedOn: string | null } → CloseCaseInput
export type CustomerField = keyof CustomerInput;  export type CaseField = keyof CaseInput;
export type CustomerFieldErrors = Partial<Record<CustomerField, string>>;
export type CaseFieldErrors = Partial<Record<CaseField | "closedOn", string>>;
export type CustomerFormState =
  | { status: "idle" } | { status: "saved" }
  | { status: "error"; fieldErrors: CustomerFieldErrors; formError?: "notFound" | "unknown" };
export type CaseFormState = same shape with CaseFieldErrors; also formError "customerNotFound".
export function formValues(formData: FormData): Record<string, unknown>;      // FormData → object (drops "id"/"customerId")
export function customerFieldErrors(e: z.ZodError): CustomerFieldErrors;
export function caseFieldErrors(e: z.ZodError): CaseFieldErrors;

// hooks.ts
export async function onCustomerArchived(tx: Tx, physioId: string, customerId: string): Promise<void>;

// queries.ts
export const LIST_LIMIT = 500;
export type CustomerSummary = { id: string; firstName: string; lastName: string | null; archivedAt: Date | null; createdAt: Date; activeCase: { title: string; bodyArea: BodyArea | null; side: BodySide | null } | null };
export async function listCustomers(tx, physioId, filters: CustomerFilters, limit = LIST_LIMIT): Promise<{ customers: CustomerSummary[]; truncated: boolean }>;
export async function hasAnyCustomers(tx, physioId): Promise<boolean>;   // archived included
export type CustomerDetail = Customer & { cases: Case[] };   // open first (opened_on desc, created_at desc), then closed (closed_on desc)
export async function getCustomer(tx, physioId, id): Promise<CustomerDetail | null>;

// mutations.ts
export async function createCustomer(tx, physioId, input: CustomerInput): Promise<Result<{ id: string }, never>>;   // locale null → physio's locale
export async function updateCustomer(tx, physioId, id, input): Promise<Result<null, "notFound">>;
export async function setCustomerArchived(tx, physioId, id, archived: boolean): Promise<Result<null, "notFound">>; // archiving calls onCustomerArchived
export async function createCase(tx, physioId, customerId, input: CaseInput, today: string): Promise<Result<{ id: string }, "customerNotFound">>; // openedOn null → today
export async function updateCase(tx, physioId, id, input: CaseInput): Promise<Result<null, "notFound" | "openedAfterClosed">>;
export async function closeCase(tx, physioId, id, closedOn: string): Promise<Result<null, "notFound" | "notOpen" | "closedBeforeOpened">>;
export async function reopenCase(tx, physioId, id): Promise<Result<null, "notFound" | "notClosed">>;
```

- [ ] **Step 1: Failing unit tests** `schemas.test.ts` covering: first name required/trimmed/≤60 (`nameRequired`, `nameTooLong`); blanks in optional fields become `null`; email invalid → `emailInvalid`, valid trimmed & lower-cased kept; phone > 30 → `phoneTooLong`; DOB `2001-02-29` → `dateInvalid`, `""` → null; `sex` outside enum → `sexInvalid`; `locale` outside `locales` → `localeInvalid`, `""` → null; medical history > 5000 → `tooLong`; case: title required; `initialPain` `"11"` → `painOutOfRange`, `"abc"` → `painOutOfRange`, `""` → null, `"0"` → 0; `bodyArea: "full_body"` → `bodyAreaInvalid`; side without area → `sideNeedsArea`; empty `openedOn` → null; `closeCaseSchema` accepts `closedOn: ""` (→ null) and rejects `"2026-02-30"` (`dateInvalid`); `customerFieldErrors` maps unknown codes to `"invalid"`; `formValues` drops `id`/`customerId`.

Schema notes: all optional text fields use a shared helper `optionalText(max, code)` = `z.preprocess(v => v ?? "", z.string()).transform(trim).pipe(z.string().max(max, code)).transform(v => v || null)`. `initialPain`: `z.preprocess(v => v === "" || v == null ? null : v, z.union([z.null(), z.coerce.number().int().min(0).max(10)]))` with error code `painOutOfRange` (use `error:` param on each). Dates: `optionalDate` = preprocess `""→null`, then `z.string().refine(isCalendarDate, "dateInvalid").nullable()`. Case `superRefine`: side present and bodyArea null → issue at `["side"]` message `sideNeedsArea`.

- [ ] **Step 2: Run, verify FAIL**, then **implement `schemas.ts`**, run again → PASS.

- [ ] **Step 3: Failing int tests** `customers.int.test.ts` (pattern: `library.int.test.ts`; two physios A and B created `onboarded: true`; helper `asA`/`asB`). Tests:
  - `createCustomer` with `locale: null` stores physio's locale (`es` after updating A's profile locale); explicit locale wins.
  - `listCustomers`: default sort by name is case/accent-insensitive (`ángel`, `Ana`, `beto` → Ana, ángel, beto? Use `lower(first_name)`, so assert the concrete order your query yields: names compared with `f_unaccent(lower(...))` — use that in `order by` so `ángel` sorts with `a`); `sort: "recent"` newest first; archived filter shows only archived (and default hides them); only own rows.
  - Search: `"jose"` finds `"José García"`; `"garcia"` finds it; `"GARC"` finds it; `"jose garcia"` finds it; `"50%"` and `"a_b"` match literally (create customers `"50% Off"`, `"aXb"` and `"a_b"` and assert only the right ones match); term of only spaces is treated as no filter (already trimmed by params).
  - `activeCase`: most recent open case (by `opened_on` desc) is returned; closed-only customer → `null`.
  - `truncated` true when limit + 1 rows exist (call with `limit = 2` and 3 customers).
  - `hasAnyCustomers`: false for empty, true when only archived exist, per-physio.
  - `getCustomer` returns cases ordered open first; returns `null` for another physio's id and for a random UUID.
  - `updateCustomer` / `setCustomerArchived` on another physio's id → `notFound` and row unchanged; archive sets `archivedAt`, restore clears it; restoring does nothing else.
  - `createCase`: `openedOn` null → `today` arg; another physio's customer id → `customerNotFound` (RLS hides it; FK fails under savepoint); random uuid → `customerNotFound`.
  - `updateCase` cannot change status/closedOn; another physio's case → `notFound`; changing `openedOn` to after an existing `closedOn` → `openedAfterClosed`.
  - `closeCase`: sets `status closed`, `closedOn`; `closedOn` before `openedOn` → `closedBeforeOpened` and nothing changed; already closed → `notOpen`; other physio → `notFound`. `reopenCase`: clears `closedOn`, status `open`; on open case → `notClosed`.
  - Two concurrent `closeCase` on the same case: exactly one `ok`, the other `notOpen` (mutation must use `update … where status = 'open'` and inspect the returned rows, not read-then-write).
  `hooks.int.test.ts`: `vi.mock("./hooks", () => ({ onCustomerArchived: vi.fn(async () => {}) }))`; assert archive calls it once with `(tx, physioId, customerId)`, restore and failed archive (`notFound`) do not.

- [ ] **Step 4: Implement `hooks.ts`, `queries.ts`, `mutations.ts`.**

`hooks.ts`:

```ts
import "server-only";

import type { Tx } from "@/db/rls";

/**
 * Called after a customer is archived. Spec 10 (sharing) revokes the customer's share links
 * here; restoring a customer never re-enables them.
 */
export async function onCustomerArchived(
  _tx: Tx,
  _physioId: string,
  _customerId: string,
): Promise<void> {
  // TODO(spec 10): revoke the customer's share links.
}
```

`queries.ts` key parts:

```ts
const fullName = sql`(${customers.firstName} || ' ' || coalesce(${customers.lastName}, ''))`;
const searchKey = sql`public.f_unaccent(lower(${fullName}))`;   // must equal the index expression
// where: eq(customers.physioId, physioId); archived ? isNotNull(archivedAt) : isNull(archivedAt);
// q: sql`${searchKey} like public.f_unaccent(lower(${`%${escapeLike(q)}%`}))`
// order: sort === "recent" ? [desc(customers.createdAt), asc(customers.id)]
//                          : [sql`public.f_unaccent(lower(${customers.firstName}))`, sql`public.f_unaccent(lower(coalesce(${customers.lastName}, '')))`, asc(customers.id)]
// limit + 1 rows → truncated
// then one query: cases where physioId, customerId in ids, status = 'open',
//   order by opened_on desc, created_at desc → first per customer becomes activeCase (skip the
//   query when the page is empty).
```

Match `f_unaccent(lower(first_name || ' ' || coalesce(last_name, '')))` exactly as in the migration so the trigram index is usable. `getCustomer`: select customer (physio + id), then cases ordered `case when status = 'open' then 0 else 1 end, opened_on desc / closed_on desc nulls last, created_at desc`.

`mutations.ts` follow `src/server/library/mutations.ts` style (`ok`/`fail` helpers, savepoints via `tx.transaction` around statements that can raise a constraint violation):
- `createCustomer`: `locale = input.locale ?? (select physios.locale)`; insert with `physioId` and returning id.
- `updateCustomer`/`setCustomerArchived`: `update … where physio_id = $1 and id = $2 returning id`; `[]` → `notFound`. Archive: `archivedAt = new Date()`, then `await onCustomerArchived(tx, physioId, id)` only when `archived === true` and a row was updated. Restore: `archivedAt = null`.
- `createCase`: `openedOn = input.openedOn ?? today`; wrap insert in savepoint; `isForeignKeyViolation(e, "cases_customer_fk")` → `customerNotFound`. Verify the customer first with a select (RLS + explicit filter) and return `customerNotFound` before inserting.
- `updateCase`: update only content fields (never status/closedOn); catch `isCheckViolation(e, "cases_closed_not_before_opened")` → `openedAfterClosed`.
- `closeCase`: `update cases set status='closed', closed_on = $closedOn where physio_id=$1 and id=$2 and status='open' returning id` in a savepoint catching `cases_closed_not_before_opened` → `closedBeforeOpened`. If no row: select the case; missing → `notFound`, else `notOpen`.
- `reopenCase`: `update … set status='open', closed_on=null where … and status='closed' returning id`; else select → `notFound` / `notClosed`.

- [ ] **Step 5: Run** `pnpm exec vitest run src/server/customers/schemas.test.ts` and `pnpm test:int` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/customers && git commit -m "feat(customers): server schemas, queries and mutations"
```

---

### Task 4: Server Actions

**Files:**
- Create: `src/server/customers/actions.ts`, `src/server/customers/actions.test.ts`

**Interfaces:**
- Consumes: Task 3 exports, `withPhysio`, `getProfile` (`@/server/physios/queries`), `todayIn`.
- Produces:

```ts
export async function saveCustomerAction(state: CustomerFormState, formData: FormData): Promise<CustomerFormState>;
  // formData "id" present → update, else create then redirect(`/customers/${id}`)
export async function setCustomerArchivedAction(id: string, archived: boolean): Promise<Result<null, "notFound">>;
export async function saveCaseAction(state: CaseFormState, formData: FormData): Promise<CaseFormState>;
  // "customerId" (create) or "id" (update) in formData; never redirects; revalidates
export async function closeCaseAction(id: string, closedOn: string | null): Promise<Result<null, "notFound" | "notOpen" | "closedBeforeOpened" | "dateInvalid">>;
export async function reopenCaseAction(id: string): Promise<Result<null, "notFound" | "notClosed">>;
```

Behaviour: validate ids with `idSchema` (malformed → `notFound`); parse with the zod schemas; `today` = `todayIn(profile.timezone)` computed inside `withPhysio` from `getProfile`; `closedOn` null → today; `revalidatePath("/customers", "layout")` on success. `saveCaseAction` maps `customerNotFound`/`notFound` to `formError`, `openedAfterClosed` to `fieldErrors.openedOn = "openedAfterClosed"`.

- [ ] **Step 1: Failing test** `actions.test.ts` mirroring `src/server/library/actions.test.ts` (mock `@/server/auth/session` `withPhysio`, `next/cache`, `next/navigation`, and `./mutations`): assert malformed id → `notFound` without calling mutations; invalid input returns `fieldErrors` without calling mutations; create redirects to `/customers/<id>`; update returns `{status:"saved"}` and revalidates; `closeCaseAction(id, null)` passes today's date in the physio timezone (mock `getProfile` to return `{ timezone: "Pacific/Auckland" }` and fake timers/`vi.setSystemTime`); `closeCaseAction(id, "2026-02-30")` → `dateInvalid`; mutation `closedBeforeOpened` bubbles up.
- [ ] **Step 2: Run → FAIL. Step 3: Implement. Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(customers): server actions`.

---

### Task 5: i18n messages and shared presentational bits

**Files:**
- Modify: `messages/en.json`, `messages/es.json`
- Create: `src/components/customers/customer-avatar.tsx`, `customer-avatar.test.tsx`

**Interfaces:**
- Produces: message namespaces used by Tasks 6–9. Define the full key tree now so later tasks only consume it; if a later task needs a key, it adds it to **both** files.
- `CustomerAvatar({ firstName, lastName, size?: "sm" | "md" | "lg" })` renders `<span aria-hidden>` initials in `bg-muted text-muted-foreground` circle (server-safe, no hooks).

Key tree (English; Spanish voseo counterparts written by the implementer):

```jsonc
"Customers": {
  "title": "Customers", "description": "Your patients and their injury cases.",
  "new": "New customer", "searchLabel": "Search customers", "searchPlaceholder": "Search by name",
  "showArchived": "Show archived", "sortLabel": "Sort by", "sortName": "Name", "sortRecent": "Recently added",
  "archivedBadge": "Archived", "noActiveCase": "No open case", "lastActivity": "Last activity",
  "lastActivityNone": "—", "name": "Name", "activeCase": "Open case",
  "truncated": "Showing the first {count, number}. Refine your search to see more.",
  "empty": { "title": "Add your first customer", "body": "Customers hold their injury cases, routines and plans.", "cta": "New customer" },
  "noResults": { "title": "No customers match", "body": "Try a different name or clear the filters." , "clear": "Clear filters"},
  "form": { "newTitle": "New customer", "editTitle": "Edit customer", "firstName": "First name", "lastName": "Last name",
    "email": "Email", "phone": "Phone", "phoneHint": "Include the country code (+598…) to enable WhatsApp.",
    "moreDetails": "More details", "dateOfBirth": "Date of birth", "sex": "Sex", "sexNone": "Not set",
    "occupation": "Occupation", "activity": "Sport / activity", "medicalHistory": "Medical history",
    "medicalHistoryHint": "General history, medication, allergies.", "locale": "Patient language",
    "create": "Create customer", "save": "Save changes", "saving": "Saving…", "saved": "Saved", "back": "Back to customers", "cancel": "Cancel",
    "sexes": { "female": "Female", "male": "Male", "other": "Other", "undisclosed": "Prefer not to say" },
    "errors": { "nameRequired": "Enter a first name.", "nameTooLong": "Use at most {max, number} characters.", "emailInvalid": "Enter a valid email.",
      "phoneTooLong": "Use at most {max, number} characters.", "dateInvalid": "Enter a valid date.", "sexInvalid": "Choose from the list.",
      "localeInvalid": "Choose from the list.", "tooLong": "Use at most {max, number} characters.", "invalid": "Check this field.",
      "notFound": "This customer no longer exists.", "unknown": "Something went wrong. Try again." } },
  "detail": { "age": "{age, number} years old", "call": "Call", "email": "Email", "whatsapp": "WhatsApp", "edit": "Edit",
    "archive": "Archive", "restore": "Restore", "archivedNotice": "This customer is archived. They're hidden from your list and their share links are disabled. Restoring does not re-enable links.",
    "archiveTitle": "Archive {name}?", "archiveBody": "They'll be hidden from your list and their share links will stop working. You can restore them later.", "archiveConfirm": "Archive" },
  "tabs": { "label": "Customer sections", "overview": "Overview", "routines": "Routines", "plans": "Plans", "activity": "Activity", "notes": "Notes" },
  "tabEmpty": { "routines": "Routines for this customer will appear here.", "plans": "…", "activity": "…", "notes": "…" },
  "overview": { "basicInfo": "Basic information", "notSet": "Not set", "openCases": "Open cases", "closedCases": "Closed cases",
    "noOpenCases": "No open cases", "noCasesBody": "Open a case to record a diagnosis, precautions and goals.", "medicalHistory": "Medical history" }
},
"Cases": {
  "new": "New case", "edit": "Edit case", "sheetDescription": "Injury episode for {name}.",
  "precautions": "Precautions", "precautionsHeading": "Precautions", "diagnosis": "Diagnosis", "title": "Title", "titleHint": "e.g. Right ACL reconstruction",
  "bodyArea": "Body area", "injuryOn": "Injury date", "surgeryOn": "Surgery date", "goals": "Goals", "initialPain": "Initial pain (0–10)", "notes": "Notes", "openedOn": "Opened on",
  "status": { "open": "Open", "closed": "Closed" }, "closedOn": "Closed on {date}",
  "close": "Close case", "closeTitle": "Close this case?", "closeBody": "Routines linked to it stay as they are.", "closedOnLabel": "Closing date", "closeConfirm": "Close case", "reopen": "Reopen case",
  "create": "Create case", "save": "Save case", "saving": "Saving…", "cancel": "Cancel",
  "errors": { "…": "one string per code listed below" }
}
```

Errors under `Cases.errors` must cover every code emitted by the case schema/actions: `nameRequired` (title empty), `nameTooLong`, `tooLong`, `dateInvalid`, `painOutOfRange` ("Enter a whole number from 0 to 10."), `bodyAreaInvalid`, `sideNeedsArea`, `openedAfterClosed`, `closedBeforeOpened`, `notOpen`, `notClosed`, `notFound`, `customerNotFound`, `invalid`, `unknown`. Keep the code names in Task 3's schema and these keys identical.

- [ ] **Step 1:** write failing `customer-avatar.test.tsx` (renders initials, `aria-hidden`, falls back to "?").
- [ ] **Step 2:** run → FAIL; implement `customer-avatar.tsx`; run → PASS.
- [ ] **Step 3:** add both namespaces to `messages/en.json` and `messages/es.json` (Rioplatense voseo: "Ingresá…", "Elegí…", "Volvé…"). Run `pnpm exec vitest run src/i18n/messages.test.ts` → PASS.
- [ ] **Step 4: Commit** `feat(customers): translations and avatar`.

---

### Task 6: Customers list page

**Files:**
- Create: `src/components/customers/customer-toolbar.tsx`, `customer-results.tsx`, `empty-customers.tsx` (+ `.test.tsx` for toolbar and results)
- Modify: `src/app/(app)/customers/page.tsx`

**Interfaces:**
- Consumes: `listCustomers`, `hasAnyCustomers`, `parseCustomerParams`, `customersHref`, `CustomerSummary`, `CustomerAvatar`, `BodyAreaBadge` (check its props in `src/components/body-areas/body-area-badge.tsx`).
- Produces: page at `/customers`.

Behaviour:
- `CustomerToolbar` (client; pattern `LibraryToolbar`): search input (debounced 300 ms, `router.replace(customersHref(filters, {q}))`, `aria-label` = `Customers.searchLabel`), "Show archived" checkbox (link/`router.replace`), sort `<select>` (`selectClassName` from prescription-fields). Props: `filters: CustomerFilters`. Search text is kept in local state and re-synced when `filters.q` changes.
- `CustomerResults` (server-safe): desktop `<table>` (`hidden md:table`): avatar+name link to `/customers/{id}`, open case title with `BodyAreaBadge` when set (else muted "No open case"), last activity "—"; mobile cards (`md:hidden`) with the same info. Archived rows show an "Archived" `Badge variant="secondary"`. Names wrap/truncate (`min-w-0`, `truncate`) so long names cause no horizontal overflow. Truncated hint from `Customers.truncated`.
- `EmptyCustomers`: shown only when `!anyCustomers && !filtersActive` (full-page empty state with New customer CTA). Otherwise, no rows → "No customers match" with a clear-filters link.
- Page: `PageHeader` with "New customer" `Button asChild` → `/customers/new`; metadata title from `Customers.title`; uses `withPhysio` to load `{list, anyCustomers}` in one transaction (pattern `library/page.tsx`).

- [ ] **Step 1: Failing component tests.** `customer-results.test.tsx` (wrap in `NextIntlClientProvider` like other component tests — copy the helper usage from `exercise-results.test.tsx`): renders name links with correct hrefs; shows open-case title and area badge; shows "Archived" badge; shows truncated hint; a name of 60+ chars has `truncate` class. `customer-toolbar.test.tsx`: typing updates the URL after debounce (mock `next/navigation` `useRouter` + fake timers), toggling archived and changing sort call `router.replace` with `customersHref` output; input value re-syncs when `filters.q` prop changes.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement components and page. **Step 4:** run → PASS (`pnpm exec vitest run src/components/customers`).
- [ ] **Step 5:** `pnpm lint && pnpm typecheck`. Commit `feat(customers): customers list with search and sorting`.

---

### Task 7: Customer forms (new and edit)

**Files:**
- Create: `src/components/customers/customer-form.tsx`, `customer-form.test.tsx`, `src/app/(app)/customers/new/page.tsx`, `src/app/(app)/customers/[customerId]/edit/page.tsx`

**Interfaces:**
- Consumes: `saveCustomerAction`, `CustomerFormState`, `CustomerFieldErrors`, `languageOptions` (`@/i18n/config`), `selectClassName`, limits from `@/lib/customers`.
- Produces: `CustomerForm({ action, defaults }: { action: (s: CustomerFormState, f: FormData) => Promise<CustomerFormState>; defaults: CustomerFormValues })` with `CustomerFormValues = { id?: string; firstName: string; lastName: string | null; email: string | null; phone: string | null; dateOfBirth: string | null; sex: CustomerSex | null; occupation: string | null; activity: string | null; medicalHistory: string | null; locale: Locale }`.

Behaviour: mirror `ExerciseForm` exactly for structure: `useActionState`, `onSubmit` dispatch with `startTransition` (so the form is not reset), `noValidate`, error `<p id>` + `aria-describedby`/`aria-invalid`, hidden `id` input when editing, saving/saved states. First name required at the top; email, phone (with hint) next; the rest under a "More details" disclosure (`<details>`; open by default when editing or when any of those fields has a value/error). `type="date"` for DOB (`max` = nothing; server validates), sex `<select>` with empty "Not set" option, locale `<select>` from `languageOptions()`. Submit button label: create vs save. Pages: `/customers/new` defaults `locale` = physio profile locale (`getProfile`); `/customers/[customerId]/edit` loads via `getCustomer` (`idSchema` first; `notFound()` on invalid/missing; same `cache` pattern as the library detail page).

- [ ] **Step 1: Failing tests** `customer-form.test.tsx` (pattern `exercise-form.test.tsx`): first name field required marker; submitting with the action mocked returning `{status:"error", fieldErrors:{firstName:"nameRequired", email:"emailInvalid"}}` shows both messages and sets `aria-invalid`; typed values persist after an error; `saved` state shows "Saved"; "More details" is closed for a new customer with no data and open when editing with `occupation` set or with an error in it; hidden `id` input present only when editing; locale select defaults to `defaults.locale`.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5:** lint/typecheck; commit `feat(customers): create and edit customer forms`.

---

### Task 8: Customer detail hub (header, tabs, overview, archive)

**Files:**
- Create: `src/components/customers/customer-header.tsx`, `customer-tabs.tsx`, `customer-overview.tsx`, `customer-archive-button.tsx`, `case-card.tsx`, `tab-empty.tsx` (+ tests for header, tabs, overview, archive)
- Create: `src/app/(app)/customers/[customerId]/page.tsx`

**Interfaces:**
- Consumes: `getCustomer`, `CustomerDetail`, `ageInYears`, `telHref`, `whatsappHref`, `parseCustomerTab`, `CUSTOMER_TABS`, `setCustomerArchivedAction`, `CustomerAvatar`, `BodyAreaBadge`, `Alert`.
- Produces: `CaseCard({ case: Case; customerName: string })` (server-safe display; Task 9 wraps it with actions), page at `/customers/[customerId]`.

Behaviour:
- Page: async `params` + `searchParams`; `idSchema` → `notFound()`; `getCustomer` null → `notFound()`; `tab = parseCustomerTab(firstParam(sp.tab))`; physio timezone from `getProfile` for age; breadcrumb link back to `/customers`; `generateMetadata` uses the customer's name.
- `CustomerHeader`: avatar (lg), full name (`h1`), age (`Customers.detail.age`, hidden when null) and contact quick actions: Call (`telHref`), Email (`mailto:` only when present, `encodeURIComponent` not needed for plain addresses but never build from unvalidated text — email is zod-validated), WhatsApp (`whatsappHref`; `target="_blank" rel="noopener noreferrer"`). Buttons omitted when the value is missing/unsupported. Edit link → `/customers/{id}/edit`. Archive/Restore button.
- `CustomerTabs`: `<nav aria-label>` with links `?tab=<t>` (overview → `/customers/{id}` without param), `aria-current="page"` on the active one; horizontally scrollable on mobile (`overflow-x-auto`).
- Overview: **precautions `Alert`** listing each open case's precautions at the top (case title bold, precautions text with `whitespace-pre-line`; only open cases with precautions); basic info definition list (email, phone, DOB formatted with `useFormatter`/`getFormatter` `dateTime`, sex, occupation, activity, locale; unset values show "Not set"); medical history block (`whitespace-pre-line`); "Open cases" list of `CaseCard`s; "Closed cases" inside a `<details>`; empty case state with text from `Customers.overview.noCasesBody`. Other tabs render `TabEmpty` with `Customers.tabEmpty.<tab>`.
- Archived customer: `Alert` with `Customers.detail.archivedNotice`.
- `CustomerArchiveButton` (client; pattern `ExerciseActions`): archive opens an `AlertDialog` confirmation, restore is immediate; calls `setCustomerArchivedAction`, `router.refresh()`, shows an error `Alert` on failure.
- The "New case" button and case actions are added in Task 9 (`CustomerOverview` is a Server Component and may render Task 9's client components directly). In this task render `CaseCard` only.

- [ ] **Step 1: Failing tests:** header (call/email/WhatsApp presence rules incl. phone `"099 123 456"` → no WhatsApp; `+598 99 123 456` → `https://wa.me/59899123456`; no age when DOB missing), tabs (correct hrefs, `aria-current`), overview (precautions alert lists only open cases with precautions, closed cases in details, unset values "Not set", no cases → empty state), archive button (archive requires confirm and calls action; restore does not confirm; error message on `{ok:false}`). Server components with async translations: render via `NextIntlClientProvider` if written as sync components taking `messages`-free props; if a component must use `getTranslations`, make it a sync component using `useTranslations` (works in Server Components in next-intl) so it is testable with the provider.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5:** lint/typecheck; commit `feat(customers): customer hub with tabs and overview`.

---

### Task 9: Case create/edit sheet, close and reopen

**Files:**
- Create: `src/components/customers/case-form.tsx`, `case-sheet.tsx`, `close-case-dialog.tsx`, `case-actions.tsx` (+ tests for case-form, case-sheet, close-case-dialog)
- Modify: `src/components/customers/customer-overview.tsx`, `case-card.tsx`, page from Task 8 (add "New case" button)

**Interfaces:**
- Consumes: `saveCaseAction`, `closeCaseAction`, `reopenCaseAction`, `CaseFormState`, `BodyAreaPicker` (`mode="single"`, `withSide`, `name="bodyArea"`, `sideName="side"`; the picker already excludes `full_body` in single mode — verify in `body-area-picker.tsx` and its test), `Sheet*` components, `AlertDialog`/`Dialog`, `Input type="date"`.
- Produces: `CaseSheet({ customerId, customerName, case? })` — trigger button ("New case" or "Edit"), sheet with `CaseForm`, closes itself and calls `router.refresh()` when the action returns `saved`. `CaseActions({ caseId, status })` — Close (opens `CloseCaseDialog`) or Reopen.

Behaviour:
- `CaseForm` mirrors `CustomerForm` (onSubmit dispatch, error ids). Fields: title (required), diagnosis, `BodyAreaPicker` single with side, injury date, surgery date, precautions (textarea, hint that it is shown prominently), goals, initial pain (`inputMode="numeric"`), opened on (edit only shows existing; create defaults empty → server uses today), notes. Hidden `customerId` (create) or `id` (edit). Precautions label uses `Cases.precautions`.
- `CloseCaseDialog`: date input defaulting to the physio's today — pass `today: string` from the page (computed server-side with `todayIn(profile.timezone)`) as a prop so the client never guesses the timezone; submitting calls `closeCaseAction(id, closedOn)`; error codes mapped to `Cases.errors.*`.
- Reopen: immediate action, `router.refresh()`.
- Overview: each `CaseCard` shows the actions; closed cases show `Cases.closedOn` with formatted date.

- [ ] **Step 1: Failing tests:** case-form (title required error shown; field errors for `painOutOfRange`, `sideNeedsArea` shown; hidden `customerId` vs `id`; typed values persist; picker submits `bodyArea` and `side` form values), case-sheet (opens on trigger click; closes and refreshes on `saved`; stays open with errors), close-case-dialog (default date = `today` prop; error message for `closedBeforeOpened`; success closes and refreshes), case-actions (Reopen calls action; shows error on `{ok:false,error:"notClosed"}`). Mock the actions and `next/navigation`.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5:** lint/typecheck; commit `feat(cases): create, edit, close and reopen cases`.

---

### Task 10: End-to-end test

**Files:**
- Create: `e2e/customers.spec.ts`

Uses `import { expect, test } from "./helpers/auth"` (`physioPage`, `isMobile`).

- [ ] **Step 1: Write the spec** with these tests (desktop + mobile projects both run them):
  1. **Create → case → overview:** empty state visible at `/customers` ("Add your first customer"); New customer → fill first name "José", last name "García", phone "+598 99 123 456", open "More details", fill occupation → Create; land on `/customers/<uuid>`; heading "José García"; WhatsApp link `href` = `https://wa.me/59899123456`; New case → title "Right ACL reconstruction", precautions "No deep flexion past 90°", pick a body area (knee) + side → Create; the overview shows the precautions in a prominent alert; case card visible.
  2. **Tabs are URL-addressable:** click "Routines" → URL has `?tab=routines`, empty state; reload keeps the tab; `?tab=bogus` shows overview.
  3. **Close and reopen:** Close case → confirm → case moves under "Closed cases", precautions alert gone; Reopen → back.
  4. **Search (accent-insensitive):** create a second customer "Ana"; on `/customers` type `jose` → only José listed; type `garcia` → José; type `zzz` → "No customers match".
  5. **Archive/restore:** archive José via confirmation → disappears from list, appears with "Show archived"; his page shows the archived banner; Restore → back in the default list.
  6. **Mobile layout:** on `isMobile`, `/customers` and a customer page have `document.documentElement.scrollWidth <= clientWidth` (no horizontal overflow) with a 60-character first name customer.
  7. **Tenancy:** a second physio (`createPhysio({onboarded:true})` + `signIn` in a new context) opening the first physio's `/customers/<id>` gets the 404 page; their list is empty.
- [ ] **Step 2:** run with an isolated port/stack (see Task 0 of execution notes): `PORT=<free> pnpm test:e2e e2e/customers.spec.ts`. Fix genuine app bugs found (systematic-debugging), not the test.
- [ ] **Step 3: Commit** `test(customers): e2e for customers and cases`.

---

### Task 11: Docs, verification, review

- [ ] **Step 1:** Update `docs/specs/04-customers-and-cases.md`: Status `Done`, Open-question answers (none extra fields; neutral initials avatar), "Decisions made during implementation" (WhatsApp only for international numbers; tabs as `?tab=`; archived customers remain viewable/editable; search is name-only; multiple open cases allowed; `today` in the physio's timezone; concurrency-safe close; composite FKs; `sort`/`archived` URL params; list capped at 500). Update the index row in `docs/specs/README.md` to `Done`.
- [ ] **Step 2:** `superpowers:verification-before-completion`: run `pnpm check`, `pnpm test:int`, `pnpm test:e2e` (isolated), paste results into the PR.
- [ ] **Step 3:** `superpowers:requesting-code-review` on the branch diff; fix findings.
- [ ] **Step 4:** push branch, open the PR against `main`, enable the CI monitor.
