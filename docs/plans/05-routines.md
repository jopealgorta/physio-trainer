# Routines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Physios build routines (ordered exercises with per-set prescription and supersets) for a customer in a drag-and-drop editor, and prescription defaults disappear from exercises.

**Architecture:** Four new tables (`routines`, `routine_groups`, `routine_items`, `routine_item_sets`) with composite `(physio_id, …)` FKs and RLS. All editor logic is pure state helpers in `src/lib/routine-editor.ts` (blocks of single items or supersets ⇄ a flat save payload). One JSON Server Action saves header + groups + items + sets in one transaction under a row lock (optimistic `version`). Server layer `src/server/routines/{schemas,hooks,queries,mutations,actions}.ts`, components in `src/components/routines/`. Exercises stop using their default-prescription columns in code (columns dropped in a later PR).

**Tech Stack:** Next.js 16, Drizzle + Supabase Postgres, zod v4, next-intl, shadcn/ui, dnd-kit (`SortableList`), Vitest, Playwright.

**Spec:** `docs/specs/05-routines.md` (answers recorded there). Architecture: `docs/architecture.md`. Patterns to copy: `docs/plans/04-customers-and-cases.md` and `src/server/customers/*`, `src/db/schema/customers.ts`.

## Global Constraints

- Every physio-owned table: `physio_id` FK to `physios` on delete cascade, RLS `ownRows` policy, `set_updated_at` trigger (custom migration; `schema-conventions` int test enforces triggers + RLS).
- Cross-row references are composite FKs that include `physio_id`; position uniqueness is scoped `(physio_id, parent, position)`.
- Queries/mutations run inside `withPhysio` (actions) / `runAsPhysio` (tests) **and** filter by `physio_id` explicitly.
- Migrations are expand-only: exercise prescription columns stay in the database; do not drop them here.
- Every user-visible string lives in **both** `messages/en.json` and `messages/es.json` in the same commit (Spanish Rioplatense voseo: "ingresá", "elegí"). No hard-coded copy. Dates/numbers via next-intl formatters.
- Use shadcn primitives from `src/components/ui` (add with `pnpm dlx shadcn@latest add <name>`; if the registry is unreachable write the source by hand in the same style). No bare `<select>`; Radix Select items can't have an empty value: use `toSelectValue`/`fromSelectValue` (`src/lib/select-value.ts`), a hidden `<input name>` for form fields, and make `onValueChange` ignore `""`. Tests choose options with `chooseOption` (`src/test/select.ts`, `e2e/helpers/select.ts`).
- Colours: design tokens only (`bg-muted`, `text-muted-foreground`, `text-destructive`, `bg-primary`).
- Don't pass functions (incl. lucide icons) from Server to Client Components.
- Next.js 16: `params`/`searchParams` async; use `PageProps<"/routines/[routineId]">`; check `node_modules/next/dist/docs/` before using an unfamiliar API. `src/db` and `src/lib/supabase/server.ts` are server-only; read env via `@/env`.
- Node: prefix shell commands with `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"`.
- No new top-level route (`/routines` is already in `RESERVED_HANDLES`).
- Commit after every task; Conventional Commits, ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Run `pnpm check` before each commit that touches code (fix prettier with `pnpm exec prettier --write <files>`).
- Integration tests need local Supabase (`pnpm db:start`, values in `.env.local`). If another worktree's stack is running, isolate with `--workdir` and a separate e2e port (see memory `parallel-worktrees-supabase`).

## Review Focus

Inputs the spec implies but that need explicit tests (each pinned in the owning task):

1. Two tabs save the same routine (stale `version`), and two saves racing: exactly one wins, the other gets `conflict`, and nothing partial is written (Task 6, Task 12).
2. Save payload naming another physio's exercise/case, a case of a different customer, or malformed ids: rejected, nothing written (Task 6, Task 7).
3. Crafted group shapes: group of 1 or 4, non-consecutive members, unequal set counts, empty sets in a group, rest on a grouped item, unknown/unused group keys: rejected (Task 5, Task 6).
4. Archived exercise still renders inside an existing routine; deleting an exercise used by a routine returns `inUse` instead of crashing (Task 2, Task 6, Task 10).
5. Blank or odd prescription combinations (all-blank sets, load only, reps + duration, reps range, 1 vs many sets) never yield empty separators, "undefined" or "0 ×" (Task 1).
6. 0 items saves as draft, activating with 0 items is blocked, 51 items and 21 sets are rejected (Task 6, Task 7).
7. Removing a member so a group drops below 2 dissolves it; keyboard/drag reorder can't split a group (Task 5, Task 10).
8. Unsaved edits: closing the tab or clicking an in-app link warns; saving clears the warning (Task 9).

---

## File Structure

| File                                                                                       | Responsibility                                                            |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `src/lib/prescription.ts`                                                                  | Per-set + per-item zod shapes, `formatPrescription`                       |
| `src/lib/routines.ts`, `src/lib/routine-params.ts`                                         | Constants/limits, `/routines` URL filters                                 |
| `src/lib/routine-structure.ts`                                                             | Pure superset/structure validation shared by editor and server            |
| `src/lib/routine-editor.ts`                                                                | Pure editor state: blocks, add/remove/dup/group/sets, save payload, load  |
| `src/db/schema/routines.ts` (+ `enums.ts`, `index.ts`, `_prescription.ts`, `customers.ts`) | Tables, enum, DB check helpers, `cases` unique                            |
| `supabase/migrations/*routines*.sql`                                                       | Generated migration + custom extras (case FK, triggers)                   |
| `src/server/routines/{schemas,hooks,queries,mutations,actions}.ts`                         | Server layer                                                              |
| `src/server/library/{schemas,mutations}.ts`                                                | Defaults removed; `deleteExercise` → `inUse`                              |
| `src/components/routines/*`                                                                | List, toolbar, new dialog, editor shell, header, block list, item, picker |
| `src/app/(app)/routines/{page,[routineId]/page}.tsx`, customer page tab                    | Routes                                                                    |
| `messages/{en,es}.json`                                                                    | `Routines` namespace, updated `Prescription`                              |
| `e2e/routines.spec.ts`                                                                     | Critical flow                                                             |

---

### Task 1: Per-set / per-item prescription shapes and `formatPrescription`

**Files:**

- Modify: `src/lib/prescription.ts`, `src/lib/prescription.test.ts`

**Interfaces:**

- Consumes: existing builders in `prescription.ts` (`optionalInt`, `optionalText`, `blankToUndefined`), `PRESCRIPTION_LIMITS`, `refinePrescription`.
- Produces (all exported from `@/lib/prescription`; the old `prescriptionShape`/`prescriptionSchema`/`Prescription`/`PRESCRIPTION_FIELDS`/`EMPTY_PRESCRIPTION` stay untouched until Task 2 removes them):
  - `setShape = { reps, repsMax, durationSeconds, load }`, `setSchema = z.object(setShape).superRefine(refinePrescription)`, `type SetPrescription = { reps: number|null; repsMax: number|null; durationSeconds: number|null; load: string|null }`, `EMPTY_SET: SetPrescription`.
  - `itemShape = { holdSeconds, restSeconds, side, notes }`, `itemPrescriptionSchema = z.object(itemShape)`, `type ItemPrescription = { holdSeconds: number|null; restSeconds: number|null; side: PrescriptionSide|null; notes: string|null }`, `EMPTY_ITEM_PRESCRIPTION: ItemPrescription`.
  - `type PrescriptionSummaryKey = "summary.count" | "summary.range" | "summary.seconds" | "summary.sets" | "summary.blank" | "summary.hold" | "summary.rest" | \`sides.${PrescriptionSide}\``.
  - `type PrescriptionTranslate = (key: PrescriptionSummaryKey, values?: Record<string, string | number>) => string`.
  - `formatPrescription(item: { sets: SetPrescription[] } & Pick<ItemPrescription, "holdSeconds" | "restSeconds" | "side">, t: PrescriptionTranslate): string` (empty string when nothing is set). Callers pass `(key, values) => t(key, values)` where `t` is `useTranslations("Prescription")` / `getTranslations("Prescription")`.

Formatting rules (this is the contract for patient page, PDF, Excel, workout mode): parts are joined with `" · "`. Set label = reps (`summary.count`) or range (`summary.range`), then `" / "` + duration (`summary.seconds`) when both are set; duration alone when no reps. Loads: if every set has the same load (or none) it is appended once after the sets; otherwise each set label is `"<base> × <load>"` (load alone if no base). All labels equal and more than one set → `"<n> × <label>"`; all-blank and more than one set → `summary.sets`; a single blank set → nothing; differing sets are listed with `" · "` (a blank one shows `summary.blank`). After sets: `summary.hold`, `summary.rest`, then `sides.<side>`.

- [ ] **Step 1: Write the failing tests** (append to `src/lib/prescription.test.ts`)

```ts
import {
  EMPTY_ITEM_PRESCRIPTION,
  EMPTY_SET,
  formatPrescription,
  itemPrescriptionSchema,
  setSchema,
  type PrescriptionTranslate,
  type SetPrescription,
} from "./prescription";

// A readable fake translator: keeps the structure the real messages produce.
const t: PrescriptionTranslate = (key, values = {}) => {
  switch (key) {
    case "summary.count":
      return String(values.value);
    case "summary.range":
      return `${values.min}–${values.max}`;
    case "summary.seconds":
      return `${values.value} s`;
    case "summary.sets":
      return `${values.count} sets`;
    case "summary.blank":
      return "–";
    case "summary.hold":
      return `hold ${values.value} s`;
    case "summary.rest":
      return `rest ${values.value} s`;
    default:
      return key.replace("sides.", "");
  }
};
const set = (overrides: Partial<SetPrescription> = {}): SetPrescription => ({
  ...EMPTY_SET,
  ...overrides,
});
const item = (
  sets: SetPrescription[],
  extra: Partial<Parameters<typeof formatPrescription>[0]> = {},
) => formatPrescription({ sets, holdSeconds: null, restSeconds: null, side: null, ...extra }, t);

describe("setSchema / itemPrescriptionSchema", () => {
  it("parses blanks to null and keeps the range rule", () => {
    expect(setSchema.parse({ reps: "", repsMax: "", durationSeconds: "", load: " " })).toEqual(
      EMPTY_SET,
    );
    expect(setSchema.safeParse({ reps: "8", repsMax: "12" }).success).toBe(true);
    expect(setSchema.safeParse({ repsMax: "12" }).success).toBe(false);
    expect(setSchema.safeParse({ reps: "12", repsMax: "8" }).success).toBe(false);
    expect(setSchema.safeParse({ reps: "0" }).success).toBe(false);
  });
  it("validates hold, rest, side and notes", () => {
    expect(itemPrescriptionSchema.parse({})).toEqual(EMPTY_ITEM_PRESCRIPTION);
    expect(itemPrescriptionSchema.safeParse({ side: "up" }).success).toBe(false);
    expect(itemPrescriptionSchema.safeParse({ holdSeconds: "5", restSeconds: "60" }).success).toBe(
      true,
    );
  });
});

describe("formatPrescription", () => {
  it("is empty when nothing is set", () => {
    expect(item([])).toBe("");
    expect(item([set()])).toBe("");
  });
  it("collapses identical sets", () => {
    expect(item([set({ reps: 12 }), set({ reps: 12 }), set({ reps: 12 })])).toBe("3 × 12");
    expect(item([set({ reps: 12 })])).toBe("12");
  });
  it("lists differing sets and ranges", () => {
    expect(item([set({ reps: 12 }), set({ reps: 10 }), set({ reps: 8 })])).toBe("12 · 10 · 8");
    expect(item([set({ reps: 8, repsMax: 12 }), set({ reps: 8, repsMax: 12 })])).toBe("2 × 8–12");
  });
  it("shows duration alone or after reps", () => {
    expect(item([set({ durationSeconds: 30 }), set({ durationSeconds: 30 })])).toBe("2 × 30 s");
    expect(item([set({ reps: 10, durationSeconds: 3 })])).toBe("10 / 3 s");
  });
  it("appends a shared load once and repeats differing loads per set", () => {
    expect(
      item([
        set({ reps: 12, load: "5 kg" }),
        set({ reps: 12, load: "5 kg" }),
        set({ reps: 12, load: "5 kg" }),
      ]),
    ).toBe("3 × 12 · 5 kg");
    expect(item([set({ reps: 12, load: "5 kg" }), set({ reps: 10, load: "5 kg" })])).toBe(
      "12 · 10 · 5 kg",
    );
    expect(
      item([
        set({ reps: 12, load: "5 kg" }),
        set({ reps: 10, load: "7 kg" }),
        set({ reps: 8, load: "9 kg" }),
      ]),
    ).toBe("12 × 5 kg · 10 × 7 kg · 8 × 9 kg");
    expect(item([set({ load: "red band" })])).toBe("red band");
    expect(item([set({ load: "5 kg" }), set({ load: "7 kg" })])).toBe("5 kg · 7 kg");
  });
  it("handles blank sets without empty separators", () => {
    expect(item([set(), set(), set()])).toBe("3 sets");
    expect(item([set({ reps: 12 }), set()])).toBe("12 · –");
  });
  it("appends hold, rest and side after the sets", () => {
    expect(
      item([set({ reps: 12 }), set({ reps: 12 }), set({ reps: 12 })], {
        holdSeconds: 5,
        restSeconds: 60,
        side: "left",
      }),
    ).toBe("3 × 12 · hold 5 s · rest 60 s · left");
    expect(item([], { restSeconds: 30 })).toBe("rest 30 s");
    expect(item([set()], { side: "alternating" })).toBe("alternating");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH" && pnpm test src/lib/prescription.test.ts`
Expected: FAIL (`setSchema`/`formatPrescription` not exported).

- [ ] **Step 3: Implement** (append to `src/lib/prescription.ts`, below `EMPTY_PRESCRIPTION`)

```ts
/** Per-set fields (spec 05): one row per set. */
export const setShape = {
  reps: prescriptionShape.reps,
  repsMax: prescriptionShape.repsMax,
  durationSeconds: prescriptionShape.durationSeconds,
  load: prescriptionShape.load,
};
export const setSchema = z.object(setShape).superRefine(refinePrescription);
export type SetPrescription = z.output<typeof setSchema>;
export const EMPTY_SET: SetPrescription = {
  reps: null,
  repsMax: null,
  durationSeconds: null,
  load: null,
};

/** Per-exercise fields of a routine item. */
export const itemShape = {
  holdSeconds: prescriptionShape.holdSeconds,
  restSeconds: prescriptionShape.restSeconds,
  side: prescriptionShape.side,
  notes: prescriptionShape.notes,
};
export const itemPrescriptionSchema = z.object(itemShape);
export type ItemPrescription = z.output<typeof itemPrescriptionSchema>;
export const EMPTY_ITEM_PRESCRIPTION: ItemPrescription = {
  holdSeconds: null,
  restSeconds: null,
  side: null,
  notes: null,
};

export type PrescriptionSummaryKey =
  | "summary.count"
  | "summary.range"
  | "summary.seconds"
  | "summary.sets"
  | "summary.blank"
  | "summary.hold"
  | "summary.rest"
  | `sides.${PrescriptionSide}`;
export type PrescriptionTranslate = (
  key: PrescriptionSummaryKey,
  values?: Record<string, string | number>,
) => string;

const SUMMARY_SEPARATOR = " · ";

function setBase(set: SetPrescription, t: PrescriptionTranslate): string | null {
  const parts: string[] = [];
  if (set.reps !== null) {
    parts.push(
      set.repsMax !== null
        ? t("summary.range", { min: set.reps, max: set.repsMax })
        : t("summary.count", { value: set.reps }),
    );
  }
  if (set.durationSeconds !== null) {
    parts.push(t("summary.seconds", { value: set.durationSeconds }));
  }
  return parts.length ? parts.join(" / ") : null;
}

/**
 * Compact one-line summary of an item's prescription, e.g. "3 × 12 · 5 kg · hold 5 s · left".
 * Pure: the caller supplies the localised strings. Shared by the editor, patient page and exports.
 */
export function formatPrescription(
  item: { sets: SetPrescription[] } & Pick<
    ItemPrescription,
    "holdSeconds" | "restSeconds" | "side"
  >,
  t: PrescriptionTranslate,
): string {
  const { sets } = item;
  const parts: string[] = [];
  const loads = new Set(sets.map((set) => set.load));
  const sharedLoad = loads.size <= 1 ? ([...loads][0] ?? null) : null;
  const perSetLoad = loads.size > 1;
  const labels = sets.map((set) => {
    const base = setBase(set, t);
    if (!perSetLoad || set.load === null) return base;
    return base === null ? set.load : `${base} × ${set.load}`;
  });

  if (labels.length > 0) {
    const first = labels[0];
    const allEqual = labels.every((label) => label === first);
    if (allEqual && labels.length > 1) {
      parts.push(
        first === null
          ? t("summary.sets", { count: labels.length })
          : `${labels.length} × ${first}`,
      );
    } else if (allEqual) {
      if (first !== null) parts.push(first);
    } else {
      parts.push(labels.map((label) => label ?? t("summary.blank")).join(SUMMARY_SEPARATOR));
    }
  }
  if (sharedLoad !== null) parts.push(sharedLoad);
  if (item.holdSeconds !== null) parts.push(t("summary.hold", { value: item.holdSeconds }));
  if (item.restSeconds !== null) parts.push(t("summary.rest", { value: item.restSeconds }));
  if (item.side !== null) parts.push(t(`sides.${item.side}`));
  return parts.join(SUMMARY_SEPARATOR);
}
```

Note: the "5 kg · 7 kg" test case has two blank-base sets with different loads → labels `["5 kg","7 kg"]` (load alone), not all equal → listed. The "red band" single-set case: `loads = {red band}` → shared → labels `[null]` → nothing pushed, then load appended → `"red band"`.

- [ ] **Step 4: Run tests, fix until green**

Run: `pnpm test src/lib/prescription.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/prescription.ts src/lib/prescription.test.ts
git commit -m "feat(prescription): per-set and per-item shapes, formatPrescription"
```

---

### Task 2: Remove prescription defaults from exercises (code and UI)

**Files:**

- Modify: `src/lib/prescription.ts` (delete `prescriptionShape` export use is internal: keep the builders and `refinePrescription`; delete `prescriptionSchema`, `Prescription`, `PRESCRIPTION_FIELDS`, `EMPTY_PRESCRIPTION`, and export nothing named `prescriptionShape` — make `prescriptionShape` a non-exported const used by `setShape`/`itemShape`), `src/lib/prescription.test.ts` (drop tests of removed exports), `src/server/library/schemas.ts` (lines ~88–107: drop `...prescriptionShape`, `.superRefine(refinePrescription)`, `keyof Prescription`), `src/server/library/mutations.ts` (create/update no longer write prescription), `src/components/library/exercise-form.tsx` (drop `PrescriptionFields`, `prescription` default, `prescriptionErrors`), `src/app/(app)/library/[exerciseId]/page.tsx`, `src/app/(app)/library/new/page.tsx`, `src/components/library/exercise-form.test.tsx`, `src/server/library/schemas.test.ts` and `src/server/library/actions.test.ts` (whatever references prescription), `e2e/library.spec.ts` (~line 61: stop filling default prescription), `messages/{en,es}.json`
- Delete: `src/components/prescription/prescription-fields.tsx` and its test (Task 10 builds new item fields)
- Keep: `src/db/schema/_prescription.ts` and the `exercises` columns (dropped later); add a comment on `prescriptionColumns()` saying the exercise defaults are unused and a follow-up chore PR drops them. `src/db/library.int.test.ts` "enforces prescription and media checks" stays (columns still exist).

**Interfaces:**

- Consumes: nothing new.
- Produces: exercise create/update ignore prescription entirely; `Prescription` namespace in messages keeps `sides`, `errors`, unit labels and gains nothing yet (Task 8+ add keys). Remove `legend`, `hint`, `sets`, `repsMaxHint` only if unused after Task 10; **for now delete only the keys the exercise form used exclusively (`legend`, `hint`)**; Task 10 decides on the rest. `src/i18n/messages.test.ts` must stay green.

- [ ] **Step 1: Write the failing test.** In `src/components/library/exercise-form.test.tsx` add:

```tsx
it("has no default prescription fields", () => {
  renderForm(); // use the file's existing render helper
  expect(screen.queryByText(/default prescription/i)).toBeNull();
  expect(screen.queryByLabelText(/^sets$/i)).toBeNull();
  expect(screen.queryByLabelText(/^reps/i)).toBeNull();
});
```

(Adapt `renderForm` to the helper actually used in that file; remove `prescription: EMPTY_PRESCRIPTION` from its defaults.) In `src/server/library/schemas.test.ts` add a test that a form with `sets: "abc"` still parses (the field is ignored) and that parsed output has no `sets` key.

- [ ] **Step 2: Run** `pnpm test src/components/library src/server/library src/lib/prescription.test.ts` → the new tests FAIL.

- [ ] **Step 3: Implement** the removals listed under Files. `exerciseSchema` keeps its non-prescription fields only. Update `exercise-form.tsx`, both pages and the e2e step accordingly. Run `pnpm typecheck` to find every remaining reference (`grep -rn "EMPTY_PRESCRIPTION\|PRESCRIPTION_FIELDS\|prescriptionShape\|PrescriptionFields" src e2e`), fix all.

- [ ] **Step 4: Run** `pnpm check` → PASS. Also run `pnpm test:e2e e2e/library.spec.ts` if the local stack is up (otherwise leave e2e to CI and say so in the report).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(library): stop using default prescription on exercises"
```

---

### Task 3: Routine constants, URL params and structure rules (pure)

**Files:**

- Create: `src/lib/routines.ts`, `src/lib/routine-params.ts`, `src/lib/routine-structure.ts`
- Test: `src/lib/routine-params.test.ts`, `src/lib/routine-structure.test.ts`

**Interfaces:**

- Produces:
  - `routines.ts`: `ROUTINE_STATUSES = ["draft","active","archived"] as const`, `type RoutineStatus`, `ROUTINE_NAME_MAX = 80`, `ROUTINE_NOTES_MAX = 2000`, `MAX_ITEMS = 50`, `MAX_SETS = 20`, `GROUP_MIN = 2`, `GROUP_MAX = 3`, `SESSIONS_PER_WEEK = { min: 1, max: 14 }`, `SESSIONS_PER_DAY = { min: 1, max: 5 }`, `ROUTINE_SEARCH_MAX_LENGTH = 100`, `ROUTINES_LIST_LIMIT = 500`.
  - `routine-params.ts`: `type RoutineFilters = { q: string; status: RoutineStatus | "all"; customerId: string | null }`, `DEFAULT_ROUTINE_FILTERS = { q: "", status: "all", customerId: null }`, `parseRoutineParams(params: Record<string, string | string[] | undefined>): RoutineFilters` (params `q`, `status`, `customer`; invalid values fall back to defaults; customer must be a uuid; q trimmed and cut to `ROUTINE_SEARCH_MAX_LENGTH`), `hasActiveRoutineFilters(f): boolean`, `routinesHref(f, changes?): Route` (omits defaults).
  - `routine-structure.ts`: `type StructureGroup = { key: string; restSeconds: number | null }`, `type StructureItem = { groupKey: string | null; restSeconds: number | null; setCount: number }`, `type StructureIssue = "unknownGroup" | "unusedGroup" | "duplicateGroup" | "groupSize" | "groupNotConsecutive" | "groupSetsMismatch" | "groupNeedsSets" | "groupItemRest"`, `validateStructure(groups: StructureGroup[], items: StructureItem[]): StructureIssue[]` (empty array = valid, no duplicates in the result).

- [ ] **Step 1: Write failing tests**

`src/lib/routine-structure.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { validateStructure, type StructureItem } from "./routine-structure";

const single = (setCount = 1): StructureItem => ({ groupKey: null, restSeconds: null, setCount });
const member = (
  groupKey: string,
  setCount = 3,
  restSeconds: number | null = null,
): StructureItem => ({
  groupKey,
  restSeconds,
  setCount,
});
const g = (key: string) => ({ key, restSeconds: 60 });

describe("validateStructure", () => {
  it("accepts a flat list and a well-formed superset", () => {
    expect(validateStructure([], [single(0), single(3)])).toEqual([]);
    expect(validateStructure([g("a")], [single(), member("a"), member("a"), single()])).toEqual([]);
    expect(validateStructure([g("a")], [member("a"), member("a"), member("a")])).toEqual([]);
  });
  it("rejects groups of one or four", () => {
    expect(validateStructure([g("a")], [member("a")])).toContain("groupSize");
    expect(
      validateStructure(
        [g("a")],
        [1, 2, 3, 4].map(() => member("a")),
      ),
    ).toContain("groupSize");
  });
  it("rejects non-consecutive members", () => {
    expect(validateStructure([g("a")], [member("a"), single(), member("a")])).toContain(
      "groupNotConsecutive",
    );
  });
  it("rejects unequal or empty set counts", () => {
    expect(validateStructure([g("a")], [member("a", 3), member("a", 2)])).toContain(
      "groupSetsMismatch",
    );
    expect(validateStructure([g("a")], [member("a", 0), member("a", 0)])).toContain(
      "groupNeedsSets",
    );
  });
  it("rejects rest on grouped items", () => {
    expect(validateStructure([g("a")], [member("a", 3, 30), member("a")])).toContain(
      "groupItemRest",
    );
  });
  it("rejects unknown, unused and duplicate group keys", () => {
    expect(validateStructure([], [member("x"), member("x")])).toContain("unknownGroup");
    expect(validateStructure([g("a")], [single()])).toContain("unusedGroup");
    expect(validateStructure([g("a"), g("a")], [member("a"), member("a")])).toContain(
      "duplicateGroup",
    );
  });
});
```

`src/lib/routine-params.test.ts` (cover: defaults; valid status/customer/q; invalid status → `"all"`; non-uuid customer → null; q trimmed and capped at 100; `routinesHref` omits defaults, `/routines?q=knee&status=active&customer=<uuid>`; `hasActiveRoutineFilters`).

- [ ] **Step 2: Run** `pnpm test src/lib/routine` → FAIL (modules missing).

- [ ] **Step 3: Implement.** `routine-structure.ts`:

```ts
export type StructureGroup = { key: string; restSeconds: number | null };
export type StructureItem = {
  groupKey: string | null;
  restSeconds: number | null;
  setCount: number;
};
export type StructureIssue =
  | "unknownGroup"
  | "unusedGroup"
  | "duplicateGroup"
  | "groupSize"
  | "groupNotConsecutive"
  | "groupSetsMismatch"
  | "groupNeedsSets"
  | "groupItemRest";

import { GROUP_MAX, GROUP_MIN } from "./routines";

/** Superset rules (spec 05): the editor keeps them true, the save action re-checks them. */
export function validateStructure(
  groups: StructureGroup[],
  items: StructureItem[],
): StructureIssue[] {
  const issues = new Set<StructureIssue>();
  const keys = new Set<string>();
  for (const group of groups) {
    if (keys.has(group.key)) issues.add("duplicateGroup");
    keys.add(group.key);
  }
  const positions = new Map<string, number[]>();
  items.forEach((item, index) => {
    if (item.groupKey === null) return;
    if (!keys.has(item.groupKey)) return void issues.add("unknownGroup");
    positions.set(item.groupKey, [...(positions.get(item.groupKey) ?? []), index]);
    if (item.restSeconds !== null) issues.add("groupItemRest");
  });
  for (const key of keys) {
    const at = positions.get(key);
    if (!at) {
      issues.add("unusedGroup");
      continue;
    }
    if (at.length < GROUP_MIN || at.length > GROUP_MAX) issues.add("groupSize");
    if (at[at.length - 1] - at[0] !== at.length - 1) issues.add("groupNotConsecutive");
    const counts = at.map((index) => items[index].setCount);
    if (counts.some((count) => count === 0)) issues.add("groupNeedsSets");
    else if (new Set(counts).size > 1) issues.add("groupSetsMismatch");
  }
  return [...issues];
}
```

(Move the import to the top of the file.) `routines.ts` as specified; `routine-params.ts` modelled on `src/lib/customer-params.ts` (read it and mirror `firstParam` use and `Route` typing).

- [ ] **Step 4: Run** `pnpm test src/lib` → PASS. `pnpm check`.

- [ ] **Step 5: Commit**

```bash
git add src/lib
git commit -m "feat(routines): constants, URL params and superset structure rules"
```

---

### Task 4: Database schema and migrations

**Files:**

- Create: `src/db/schema/routines.ts`, `src/db/routines.int.test.ts`, migrations under `supabase/migrations/` (generated + custom extras)
- Modify: `src/db/schema/enums.ts` (add `routineStatusEnum`), `src/db/schema/index.ts` (`export * from "./routines"`), `src/db/schema/_prescription.ts` (new helpers), `src/db/schema/customers.ts` (`cases` unique)

**Interfaces:**

- Consumes: `customers`, `cases`, `exercises` tables; constants from Task 3 (import relatively: `../../lib/routines`).
- Produces (Drizzle, exported from `@/db/schema`): `routines`, `routineGroups`, `routineItems`, `routineItemSets`, types `Routine`, `RoutineGroup`, `RoutineItem`, `RoutineItemSet`; `routineStatusEnum`.

- [ ] **Step 1: Write the failing int test** `src/db/routines.int.test.ts`. Follow `src/db/customers.int.test.ts` and `src/db/library.int.test.ts` (read both first) for helpers (`createTestPhysio`, `runAsPhysio`, owner `db`). Tests:

  1. **RLS**: physio A inserts a customer, routine, group, two items (with an exercise), sets via `runAsPhysio`; physio B `select` from each of the four tables returns 0 rows; B `update`/`delete` affect 0 rows; B inserting a row with A's `physio_id` fails (RLS with-check).
  2. **Composite FKs**: with the owner `db`, inserting a routine whose `(physio_id, customer_id)` belongs to another physio fails (`routines_customer_fk`); routine item pointing at another physio's exercise fails (`routine_items_exercise_fk`); item whose `group_id` belongs to another routine of the same physio fails (`routine_items_group_fk`); set pointing at another physio's item fails.
  3. **Case must belong to the customer**: routine with `case_id` of a different customer of the same physio fails (`routines_case_fk`); deleting the case sets `case_id` null and leaves `physio_id`/`customer_id` intact.
  4. **Exercise restrict**: deleting an exercise used by an item fails with FK violation (`isForeignKeyViolation(error, "routine_items_exercise_fk")`).
  5. **Cascade**: deleting the routine deletes its groups, items and sets; deleting the customer deletes routines.
  6. **Checks**: name length 0 and 81, `sessions_per_week` 0 and 15, `sessions_per_day` 6, `version` 0, `rest_seconds` on a grouped item, `reps_max <= reps`, `reps_max` without `reps`, `load` longer than 40 → check violations (`isCheckViolation`); `position` duplicates rejected (unique).
  7. `schema-conventions.int.test.ts` keeps passing (RLS on, `set_updated_at` on every table with `updated_at`).

- [ ] **Step 2: Run** `pnpm test:int src/db/routines.int.test.ts` → FAIL (no tables).

- [ ] **Step 3: Implement the schema.**

`enums.ts`:

```ts
import { ROUTINE_STATUSES } from "../../lib/routines";
export const routineStatusEnum = pgEnum("routine_status", ROUTINE_STATUSES);
```

`_prescription.ts`: extract the range helper and add (keep `prescriptionColumns`/`prescriptionChecks` for the still-existing exercise columns):

```ts
const rangeCheck = (
  table: string,
  name: string,
  column: AnyPgColumn,
  { min, max }: { min: number; max: number },
) =>
  check(
    `${table}_${name}_range`,
    sql`${column} between ${sql.raw(String(min))} and ${sql.raw(String(max))}`,
  );

/** Per-exercise fields of a routine item (spec 05). */
export function itemPrescriptionColumns() {
  return {
    holdSeconds: smallint(),
    restSeconds: smallint(),
    side: prescriptionSideEnum(),
    notes: text(),
  };
}
/** Per-set fields (spec 05). */
export function setPrescriptionColumns() {
  return { reps: smallint(), repsMax: smallint(), durationSeconds: integer(), load: text() };
}
export function itemPrescriptionChecks(
  table: string,
  c: Pick<PrescriptionColumns, "holdSeconds" | "restSeconds" | "notes">,
) {
  return [
    rangeCheck(table, "hold_seconds", c.holdSeconds, PRESCRIPTION_LIMITS.holdSeconds),
    rangeCheck(table, "rest_seconds", c.restSeconds, PRESCRIPTION_LIMITS.restSeconds),
    check(
      `${table}_notes_length`,
      sql`char_length(${c.notes}) <= ${sql.raw(String(PRESCRIPTION_NOTES_MAX_LENGTH))}`,
    ),
  ];
}
export function setPrescriptionChecks(
  table: string,
  c: Pick<PrescriptionColumns, "reps" | "repsMax" | "durationSeconds" | "load">,
) {
  return [
    rangeCheck(table, "reps", c.reps, PRESCRIPTION_LIMITS.reps),
    rangeCheck(table, "reps_max", c.repsMax, PRESCRIPTION_LIMITS.repsMax),
    rangeCheck(table, "duration_seconds", c.durationSeconds, PRESCRIPTION_LIMITS.durationSeconds),
    check(
      `${table}_reps_range_order`,
      sql`${c.repsMax} is null or (${c.reps} is not null and ${c.repsMax} > ${c.reps})`,
    ),
    check(
      `${table}_load_length`,
      sql`char_length(${c.load}) <= ${sql.raw(String(LOAD_MAX_LENGTH))}`,
    ),
  ];
}
```

(Make the existing `prescriptionChecks` use `rangeCheck` too; `_prescription.test.ts` must stay green. Add a comment above `prescriptionColumns()`: "Exercise defaults are no longer used by the app (spec 05); a follow-up chore PR drops these columns.")

`customers.ts` — in the `cases` table callback add `unique("cases_physio_customer_id_unique").on(t.physioId, t.customerId, t.id)` (target of the routines case FK).

`routines.ts` — copy the local `ownRows`/`physioId` helpers from `customers.ts`, then:

```ts
export const routines = pgTable(
  "routines",
  {
    id: uuid().primaryKey().defaultRandom(),
    physioId: physioId(),
    customerId: uuid().notNull(),
    caseId: uuid(),
    name: text().notNull(),
    notes: text(),
    isStandalone: boolean().notNull().default(true),
    sessionsPerWeek: smallint(),
    sessionsPerDay: smallint(),
    status: routineStatusEnum().notNull().default("draft"),
    version: integer().notNull().default(1),
    ...timestamps,
  },
  (t) => [
    unique("routines_physio_id_id_unique").on(t.physioId, t.id),
    foreignKey({
      name: "routines_customer_fk",
      columns: [t.physioId, t.customerId],
      foreignColumns: [customers.physioId, customers.id],
    }).onDelete("cascade"),
    index("routines_customer_idx").on(t.physioId, t.customerId, t.status),
    check(
      "routines_name_length",
      sql`char_length(${t.name}) between 1 and ${sql.raw(String(ROUTINE_NAME_MAX))}`,
    ),
    check(
      "routines_notes_length",
      sql`char_length(${t.notes}) <= ${sql.raw(String(ROUTINE_NOTES_MAX))}`,
    ),
    check("routines_sessions_per_week", sql`${t.sessionsPerWeek} between 1 and 14`),
    check("routines_sessions_per_day", sql`${t.sessionsPerDay} between 1 and 5`),
    check("routines_version_positive", sql`${t.version} >= 1`),
    ownRows("routines_own", t.physioId),
  ],
);
```

`routineGroups` (`id`, `physioId`, `routineId` notNull, `restSeconds smallint`, timestamps): unique `routine_groups_physio_routine_id_unique` on `(physioId, routineId, id)`, FK `routine_groups_routine_fk` `(physioId, routineId)` → `routines(physioId, id)` cascade, index `(physioId, routineId)`, check rest range via `PRESCRIPTION_LIMITS.restSeconds`, `ownRows`.

`routineItems` (`id`, `physioId`, `routineId` notNull, `exerciseId` notNull, `position integer notNull`, `groupId uuid`, `...itemPrescriptionColumns()`, timestamps): unique `routine_items_physio_id_id_unique` `(physioId, id)`, unique `routine_items_position_unique` `(physioId, routineId, position)`, FK `routine_items_routine_fk` cascade, FK `routine_items_exercise_fk` `(physioId, exerciseId)` → `exercises(physioId, id)` `.onDelete("restrict")`, FK `routine_items_group_fk` `(physioId, routineId, groupId)` → `routineGroups(physioId, routineId, id)` (default no action; null `group_id` skips it), checks `routine_items_position` (`>= 0`), `routine_items_group_no_rest` (`group_id is null or rest_seconds is null`), `...itemPrescriptionChecks("routine_items", t)`, `ownRows`.

`routineItemSets` (`id`, `physioId`, `routineItemId` notNull, `position integer notNull`, `...setPrescriptionColumns()`, timestamps): unique `routine_item_sets_position_unique` `(physioId, routineItemId, position)`, FK `routine_item_sets_item_fk` `(physioId, routineItemId)` → `routineItems(physioId, id)` cascade, check `routine_item_sets_position` (`between 0 and 19`), `...setPrescriptionChecks("routine_item_sets", t)`, `ownRows`.

Export `Routine`, `RoutineGroup`, `RoutineItem`, `RoutineItemSet` (`$inferSelect`).

- [ ] **Step 4: Generate migrations.** `pnpm db:generate` (creates the schema migration incl. the `cases` unique). Then create the custom migration the same way `20260929122643_customers-extras.sql` was made (`pnpm exec drizzle-kit generate --custom --name=routines-extras`) with:

```sql
-- Routines extras (spec 05): things Drizzle can't express.

-- A routine's case must belong to the routine's customer; deleting the case clears only case_id
-- (a plain composite SET NULL would also null physio_id and customer_id).
alter table public.routines
  add constraint routines_case_fk
  foreign key (physio_id, customer_id, case_id)
  references public.cases (physio_id, customer_id, id)
  on delete set null (case_id);

create trigger routines_set_updated_at
  before update on public.routines
  for each row execute function public.set_updated_at();
create trigger routine_groups_set_updated_at
  before update on public.routine_groups
  for each row execute function public.set_updated_at();
create trigger routine_items_set_updated_at
  before update on public.routine_items
  for each row execute function public.set_updated_at();
create trigger routine_item_sets_set_updated_at
  before update on public.routine_item_sets
  for each row execute function public.set_updated_at();
```

- [ ] **Step 5: Apply and test.** `pnpm db:reset` (or `pnpm db:start` first), then `pnpm test:int` → PASS (including `schema-conventions` and `routines.int.test.ts`). `pnpm check`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(routines): routines, groups, items and sets tables"
```

---

### Task 5: Editor state helpers (pure)

**Files:**

- Create: `src/lib/routine-editor.ts`
- Test: `src/lib/routine-editor.test.ts`

**Interfaces:**

- Consumes: `EMPTY_SET`, `EMPTY_ITEM_PRESCRIPTION`, `SetPrescription`, `ItemPrescription` (Task 1); `MAX_ITEMS`, `MAX_SETS`, `GROUP_MIN`, `GROUP_MAX` (Task 3); `validateStructure` (Task 3).
- Produces (all exported from `@/lib/routine-editor`):

```ts
export type EditorSet = SetPrescription & { key: string };
export type ExerciseRef = {
  id: string; name: string; archived: boolean; cover: { videoId: string; isShort: boolean } | null;
};
export type EditorItem = ItemPrescription & {
  key: string; exerciseId: string; exerciseName: string; exerciseArchived: boolean;
  cover: { videoId: string; isShort: boolean } | null; sets: EditorSet[];
};
export type EditorBlock =
  | { kind: "single"; key: string; item: EditorItem }
  | { kind: "group"; key: string; restSeconds: number | null; items: EditorItem[] };
export type NewKey = () => string;

// save payload (sent to the server action; keys are client-only, the server assigns ids)
export type SaveSet = SetPrescription;
export type SaveItem = ItemPrescription & { exerciseId: string; groupKey: string | null; sets: SaveSet[] };
export type SaveGroup = { key: string; restSeconds: number | null };
export type SaveBlocks = { groups: SaveGroup[]; items: SaveItem[] };

// loaded shape from the query (Task 6 `getRoutine`)
export type LoadedItem = ItemPrescription & {
  id: string; exerciseId: string; exerciseName: string; exerciseArchived: boolean;
  cover: { videoId: string; isShort: boolean } | null; groupId: string | null;
  sets: SetPrescription[];
};
export type LoadedGroup = { id: string; restSeconds: number | null };

flatItems(blocks): EditorItem[];   itemCount(blocks): number;   canAddItem(blocks): boolean;
newItem(exercise: ExerciseRef, newKey: NewKey): EditorItem;     // one empty set, empty item prescription
addItem(blocks, item): EditorBlock[];                           // appends a single; no-op at MAX_ITEMS
removeItem(blocks, itemKey): EditorBlock[];                     // group < GROUP_MIN dissolves; survivor gets the group's rest
duplicateItem(blocks, itemKey, newKey): EditorBlock[];          // copy (new keys) as a single right after the source's block; no-op at MAX_ITEMS
updateItem(blocks, itemKey, patch: Partial<ItemPrescription>): EditorBlock[];   // restSeconds ignored for grouped items
updateSet(blocks, itemKey, setKey, patch: Partial<SetPrescription>): EditorBlock[];
canAddSet(blocks, itemKey): boolean;   addSet(blocks, itemKey, newKey): EditorBlock[];        // copy of the last set; in a group every member gets one
canRemoveSet(blocks, itemKey): boolean; removeSet(blocks, itemKey, setKey): EditorBlock[];    // group: same index removed from every member; a group member keeps >= 1 set
updateGroupRest(blocks, groupKey, restSeconds: number | null): EditorBlock[];
reorderGroupItems(blocks, groupKey, items: EditorItem[]): EditorBlock[];
canGroupWithNext(blocks, blockKey): boolean;   groupWithNext(blocks, blockKey, newKey): EditorBlock[];
ungroup(blocks, groupKey): EditorBlock[];                       // members become singles, each inheriting the group's rest
toSaveBlocks(blocks): SaveBlocks;
fromLoaded(items: LoadedItem[], groups: LoadedGroup[], newKey: NewKey): EditorBlock[];   // items ordered by position; consecutive items sharing groupId form one group block (block key = group id)
```

Rules for `groupWithNext(blocks, blockKey, newKey)`: `blockKey` is a block key; the block after it is merged. Allowed only if the merged member count ≤ `GROUP_MAX`. Merged group key = the left block's key if it is already a group, else `newKey()`. Group rest = first non-null of (left group rest or left single's item rest, right group rest or right single's item rest); every member's own `restSeconds` becomes null. Set counts sync to `max(1, max member count)`, padding shorter members with copies of their own last set (or an empty set).

- [ ] **Step 1: Write failing tests** `src/lib/routine-editor.test.ts` with a deterministic `newKey` (`let n = 0; const nk = () => \`k${++n}\``) and a `mk(exerciseName, sets)`builder. Cover, each as its own`it`:

  - `newItem` has exactly one empty set; `addItem` appends a single and stops at `MAX_ITEMS` (50) (build 50, add one more → unchanged).
  - `removeItem` from a single; from a group of 3 keeps a group of 2; from a group of 2 dissolves into one single carrying the group's rest.
  - `duplicateItem` inserts a single after the block with fresh keys and copied sets; duplicating a member of a group leaves the group intact and puts the copy after the group.
  - `updateItem` patches hold/side/notes; ignores `restSeconds` for a grouped item but applies it for a single.
  - `addSet` copies the previous set's values, respects `MAX_SETS` (20), and in a group adds a set to every member; `canAddSet` false at 20.
  - `removeSet` on a single can remove down to zero sets; in a group removes the same index from all members and `canRemoveSet` is false when members have 1 set.
  - `updateSet` patches only that set.
  - `groupWithNext`: two singles → group with one rest (first non-null) and members' rest null; sets padded to the max count; single + group merges into that group's key; refuses when result would exceed 3 (`canGroupWithNext` false; `groupWithNext` returns the same array); refuses for the last block.
  - `ungroup` yields singles in order, each with the group's rest.
  - `reorderGroupItems` replaces member order only.
  - `toSaveBlocks` → flat items in order, `groupKey` set for members, group list in first-appearance order, and `validateStructure` accepts the output for every valid arrangement above (assert `validateStructure(groups, items.map(i => ({ groupKey: i.groupKey, restSeconds: i.restSeconds, setCount: i.sets.length })))` is `[]`).
  - `fromLoaded` groups consecutive items by `groupId`, keeps group rest, and `fromLoaded(...)` then `toSaveBlocks` round-trips the prescription values.

- [ ] **Step 2: Run** `pnpm test src/lib/routine-editor.test.ts` → FAIL.

- [ ] **Step 3: Implement** `src/lib/routine-editor.ts` to the interface above. Guidelines: immutable updates only (never mutate arguments); one private `mapItem(blocks, itemKey, fn)` helper; one private `syncSetCounts(items, newKey)`; the invariants a valid arrangement must satisfy are exactly `validateStructure`'s. Group blocks always have `GROUP_MIN..GROUP_MAX` members (helpers that would violate this dissolve or refuse).

- [ ] **Step 4: Run** `pnpm test src/lib` → PASS. `pnpm check`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/routine-editor.ts src/lib/routine-editor.test.ts
git commit -m "feat(routines): pure editor state helpers for blocks, sets and supersets"
```

---

### Task 6: Server layer (schemas, queries, mutations) and exercise `inUse`

**Files:**

- Create: `src/server/routines/schemas.ts`, `src/server/routines/hooks.ts`, `src/server/routines/queries.ts`, `src/server/routines/mutations.ts`, `src/server/routines/schemas.test.ts`, `src/server/routines/routines.int.test.ts`
- Modify: `src/server/library/mutations.ts` (`deleteExercise`), `src/server/library/library.int.test.ts` (inUse test), and wherever the exercise delete UI maps the result (`src/components/library/exercise-actions.tsx` + `src/server/library/actions.ts` result type) so `inUse` shows a message and the archive option (add `Library.actions.inUse` message in both locales)

**Interfaces:**

- Consumes: Task 3–5 exports, `Tx` from `@/db/rls`, tables from Task 4, `listExercises` cover logic (`parseYouTubeUrl`).
- Produces:

```ts
// schemas.ts
export type Result<T, E extends string> = { ok: true; data: T } | { ok: false; error: E };   // same shape as customers/schemas.ts (re-export if identical there)
export const idSchema = z.uuid();  export const isUuid: (v: string) => boolean;
export const createRoutineSchema: z.ZodType<{ customerId: string; name: string; caseId: string | null }>;
export const saveRoutineSchema;    // { id, version, name, notes, caseId, sessionsPerWeek, sessionsPerDay, status, groups: SaveGroup[], items: SaveItem[] }
export type SaveRoutineInput = z.output<typeof saveRoutineSchema>;
export type SaveRoutineError = "notFound" | "conflict" | "caseNotFound" | "exerciseNotFound" | "needsItems" | "blockedByPlans";
export type CreateRoutineError = "customerNotFound" | "caseNotFound";

// hooks.ts
export async function listPlansUsingRoutine(tx: Tx, physioId: string, routineId: string): Promise<{ id: string; name: string }[]>;   // returns [] until spec 06

// queries.ts
export type RoutineSummary = { id: string; name: string; status: RoutineStatus; customerId: string; customerFirstName: string; customerLastName: string | null; caseTitle: string | null; itemCount: number; sessionsPerWeek: number | null; updatedAt: Date };
export async function listRoutines(tx: Tx, physioId: string, filters: RoutineFilters): Promise<{ routines: RoutineSummary[]; truncated: boolean }>;
export type RoutineDetail = { id: string; version: number; customerId: string; customerFirstName: string; customerLastName: string | null; name: string; notes: string | null; caseId: string | null; sessionsPerWeek: number | null; sessionsPerDay: number | null; status: RoutineStatus; groups: LoadedGroup[]; items: LoadedItem[]; cases: { id: string; title: string; status: "open" | "closed" }[] };
export async function getRoutine(tx: Tx, physioId: string, id: string): Promise<RoutineDetail | null>;   // non-uuid → null
export async function listRecentExercises(tx: Tx, physioId: string, limit?: number): Promise<ExerciseSummary[]>;   // distinct non-archived exercises by most recent routine_items.created_at, default 8

// mutations.ts
export async function createRoutine(tx, physioId, input: CreateRoutineInput): Promise<Result<{ id: string }, CreateRoutineError>>;
export async function saveRoutine(tx, physioId, input: SaveRoutineInput): Promise<Result<{ version: number }, SaveRoutineError>>;

// library/mutations.ts
deleteExercise(...): Promise<Result<null, "notFound" | "inUse">>
```

`saveRoutineSchema` details (error messages are i18n codes): `name` trimmed, required (`nameRequired`), ≤ 80 (`nameTooLong`); `notes` optional trimmed ≤ 2000 (`notesTooLong`), blank → null; `caseId` uuid or null (blank → null); `sessionsPerWeek` int 1–14 or null, `sessionsPerDay` int 1–5 or null (`outOfRange`); `status` one of `ROUTINE_STATUSES`; `version` int ≥ 1; `items` array ≤ `MAX_ITEMS` each `{ exerciseId: uuid, groupKey: string(1..64)|null, sets: z.array(setSchema).max(MAX_SETS), ...itemShape }`; `groups` array ≤ `MAX_ITEMS`, each `{ key: string(1..64), restSeconds: itemShape.restSeconds }`; a `superRefine` maps `validateStructure` issues to zod issues on `["items"]` with the issue code as message.

`saveRoutine` steps (all in the caller's transaction): (1) `select … for update` the routine row (`and(eq(physioId), eq(id))`), missing → `notFound`; (2) `row.version !== input.version` → `conflict`; (3) if `caseId`, require a case with that id, this physio and `customer_id = routine.customerId`, else `caseNotFound`; (4) distinct `exerciseId`s must all exist for this physio (count query), else `exerciseNotFound`; (5) `status === "active"` and no items → `needsItems`; (6) `status === "archived"` and the routine wasn't archived and `listPlansUsingRoutine` non-empty → `blockedByPlans`; (7) delete the routine's items (sets cascade) then its groups; insert groups with `crypto.randomUUID()` ids (map key → id), items with fresh ids and `position = index`, sets with `position = index` (skip inserts for empty arrays: Drizzle rejects empty `values`); (8) update the routine header and `version = version + 1`, `returning version`. Client keys are never stored.

- [ ] **Step 1: Write failing tests.**

`schemas.test.ts` (unit): valid payload parses (blank strings → null); name blank/81 chars; notes 2001; `sessionsPerWeek` 0/15; unknown status; 51 items; 21 sets; each `validateStructure` issue surfaces as a zod issue (group of one, non-consecutive, unequal sets, rest on grouped item, unknown group).

`routines.int.test.ts` (follow `src/server/customers/customers.int.test.ts` structure: two physios, `as(who, fn)` helper, `RANDOM_ID`):

1. `createRoutine` creates a draft (version 1, `isStandalone` true) for own customer; another physio's customer → `customerNotFound`; a case of a different customer → `caseNotFound`; non-uuid ids → not found, no crash.
2. `saveRoutine` happy path: header + 1 group of 2 items + 1 single, sets written with positions; `getRoutine` returns items ordered by position with sets ordered, group rest, `version` 2; saving again with `version: 2` works (→ 3) and **replaces** children (old item ids gone, no orphan rows in any table).
3. Conflict: saving with a stale version → `conflict` and nothing changed; two concurrent `saveRoutine` calls with the same version (`Promise.all` of two `runAsPhysio`) → exactly one `ok`, one `conflict`.
4. Cross-tenant: exercise of physio B → `exerciseNotFound`; case of B → `caseNotFound`; routine id of B → `notFound`; nothing written (row counts unchanged).
5. Rules: activating with 0 items → `needsItems`; saving a draft with 0 items is fine; archiving works (plans hook returns `[]`).
6. Archived exercise still resolves in `getRoutine` (`exerciseArchived: true`).
7. `listRoutines`: filters by status, customer, accent-insensitive partial name search (`q`), LIKE wildcards literal (`50%`), includes `itemCount` and case title, only own rows, `truncated` flag at the limit (use the limit constant/param as `listExercises` does).
8. `listRecentExercises`: most recently added first, distinct, excludes archived, respects limit.
9. Library `deleteExercise`: unused exercise deletes; exercise used by an item → `inUse` and the transaction stays usable afterwards (run another query in the same `runAsPhysio` callback); not found → `notFound`.

- [ ] **Step 2: Run** `pnpm test src/server/routines/schemas.test.ts` and `pnpm test:int src/server/routines src/server/library` → FAIL.

- [ ] **Step 3: Implement.** Mirror `src/server/customers/{schemas,queries,mutations}.ts` (result helpers `ok`/`fail`, explicit `physioId` filters, `isUuid` short-circuits). `deleteExercise`: wrap the delete in `tx.transaction(...)` (savepoint, same technique as `createCase` in `customers/mutations.ts`) and map `isForeignKeyViolation(error, "routine_items_exercise_fk")` to `fail("inUse")`. Update the exercise delete UI: on `inUse` show `t("actions.inUse")` ("This exercise is used in a routine. Archive it instead.") and keep the archive button visible.

- [ ] **Step 4: Run** `pnpm test`, `pnpm test:int` → PASS. `pnpm check`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(routines): routine queries, transactional save with optimistic locking"
```

---

### Task 7: Server Actions

**Files:**

- Create: `src/server/routines/actions.ts`, `src/server/routines/actions.test.ts`

**Interfaces:**

- Consumes: Task 6 schemas/mutations/queries; `withPhysio` (`@/server/auth/session`); `parseLibraryParams` (`@/lib/library-params`); `listExercises`, `ExerciseSummary` (`@/server/library/queries`).
- Produces:

```ts
export type CreateRoutineFormState =
  | { status: "idle" }
  | { status: "error"; fieldErrors: { name?: string }; formError?: CreateRoutineError | "invalid" };
export async function createRoutineAction(
  _state: CreateRoutineFormState,
  formData: FormData,
): Promise<CreateRoutineFormState>;
// fields: customerId, name, caseId (blank → null). On success: revalidatePath("/routines", "layout"), revalidatePath("/customers", "layout"), redirect(`/routines/${id}`).
export type SaveRoutineActionError = SaveRoutineError | "invalid";
export async function saveRoutineAction(
  input: unknown,
): Promise<Result<{ version: number }, SaveRoutineActionError>>;
// zod-parses `input` with saveRoutineSchema (failure → { ok: false, error: "invalid" }), withPhysio(saveRoutine); on ok revalidatePath(`/routines/${id}`), "/routines", and "/customers" (layout).
export async function searchExercisesAction(params: {
  q?: string;
  category?: string;
  area?: string;
}): Promise<ExerciseSummary[]>;
// parseLibraryParams(params) → listExercises(tx, physioId, filters, 60).exercises; never returns archived (default category filter already excludes them).
```

- [ ] **Step 1: Write failing tests** `actions.test.ts`, following `src/server/customers/actions.test.ts` (mock `@/server/auth/session`'s `withPhysio` and `next/cache`/`next/navigation`; read that file first for the exact mocking style). Cover: `createRoutineAction` rejects a blank name with `fieldErrors.name`, rejects a malformed `customerId` (no DB call), redirects to `/routines/<id>` on success; `saveRoutineAction` returns `invalid` for garbage/`null`/oversized input without calling `withPhysio`, passes a valid payload through and revalidates, forwards `conflict`/`notFound`/`needsItems`; `searchExercisesAction` parses `area=nonsense` to no area filter and caps at 60.

- [ ] **Step 2: Run** `pnpm test src/server/routines/actions.test.ts` → FAIL.

- [ ] **Step 3: Implement** (thin: validate → `withPhysio(mutation)` → revalidate → typed result; no business logic).

- [ ] **Step 4: Run** `pnpm check` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/routines
git commit -m "feat(routines): create, save and picker search server actions"
```

---

### Task 8: Routine lists, "New routine" dialog and status badges

**Files:**

- Create: `src/components/routines/{status-badge,new-routine-dialog,routine-list,routines-toolbar,customer-routines}.tsx` and matching `*.test.tsx` for status-badge, new-routine-dialog and routine-list
- Modify: `src/app/(app)/routines/page.tsx` (replace `SpecPlaceholder`), `src/app/(app)/customers/[customerId]/page.tsx` (render `<CustomerRoutines>` for `tab === "routines"`), `src/components/customers/tab-empty.tsx` + `Customers.tabEmpty.routines` message (routines no longer a placeholder: narrow the `Exclude` type and drop the message and its test case), `messages/{en,es}.json`
- Check first: `pnpm dlx shadcn@latest add badge dialog` only if missing (they exist)

**Interfaces:**

- Consumes: `listRoutines`, `RoutineSummary` (Task 6), `createRoutineAction`/`CreateRoutineFormState` (Task 7), `parseRoutineParams`, `routinesHref`, `hasActiveRoutineFilters` (Task 3), `customerName` from `@/lib/customers`, customers list query for the toolbar's customer select (`listCustomers` in `src/server/customers/queries.ts`; pass `{ id, name }[]` as serialisable props).
- Produces:
  - `<StatusBadge status={RoutineStatus} />` (client-safe, uses `Routines.status.*`; `draft` secondary/outline, `active` default, `archived` muted).
  - `<NewRoutineDialog customerId={string} customerName={string} cases={{ id: string; title: string }[]} />` (client): trigger button "New routine"; dialog form (`useActionState(createRoutineAction, …)` with the `onSubmit` dispatch trick from `ExerciseForm`): Name (required, `maxLength` 80), Case select (only rendered when `cases.length > 0`, options "No case" + titles, hidden input `caseId`), hidden `customerId`. Shows `fieldErrors.name` and `formError`.
  - `<RoutineList routines={RoutineSummary[]} showCustomer={boolean} />` (server-renderable): table on `md+`, cards on mobile; row links to `/routines/<id>`; columns: name, customer (when `showCustomer`), case, status badge, items count (ICU plural), sessions/week, updated (formatted with next-intl `useFormatter().dateTime`).
  - `/routines` page: header with filters `?q=&status=&customer=`; empty states: no routines at all ("Open a customer to create their first routine" with link to `/customers`), no results with "Clear filters" link only when filters are active; truncated hint ("Showing the first 500. Refine your search.") like the library.
  - Customer `?tab=routines`: `<CustomerRoutines customerId cases />` server component: title, `NewRoutineDialog`, `RoutineList` (`showCustomer={false}`), empty state "No routines yet" + dialog trigger. Archived customers: hide the dialog.

Messages (English shown; Spanish voseo required in the same commit), namespace `Routines`:

```
Routines.title "Routines"
Routines.status.draft "Draft" / active "Active" / archived "Archived"
Routines.list.columns.name "Name" / customer "Customer" / case "Case" / status "Status" / items "Exercises" / frequency "Per week" / updated "Updated"
Routines.list.items "{count, plural, one {# exercise} other {# exercises}}"
Routines.list.perWeek "{count, number}×"
Routines.list.empty.title "No routines yet" / body "Open a customer to create their first routine." / cta "Go to customers"
Routines.list.noResults "No routines match these filters." / clearFilters "Clear filters"
Routines.list.truncated "Showing the first {count, number}. Refine your search."
Routines.filters.search "Search routines" / status "Status" / allStatuses "All statuses" / customer "Customer" / allCustomers "All customers"
Routines.customerTab.title "Routines" / empty "No routines for {name} yet."
Routines.new.button "New routine" / title "New routine for {name}" / name "Name" / case "Case" / noCase "No case" / create "Create routine" / cancel "Cancel"
Routines.new.errors.nameRequired "Enter a name." / nameTooLong "Use at most {max, number} characters." / customerNotFound "This customer no longer exists." / caseNotFound "That case doesn't belong to this customer." / invalid "Check the form and try again."
Nav.routines already exists.
```

- [ ] **Step 1: Write failing tests.** `status-badge.test.tsx` (each status renders its label); `new-routine-dialog.test.tsx` (opens dialog; submitting a blank name shows "Enter a name."; the case select is absent with no cases and present with cases; submit dispatches with `customerId`, `name`, `caseId` — mock `createRoutineAction`; see `src/components/customers` tests for how `useActionState` actions are mocked and `chooseOption` usage); `routine-list.test.tsx` (renders names, links, plural counts, hides customer column when `showCustomer={false}`). Use the project's test helper for rendering with next-intl (see an existing component test for the wrapper).

- [ ] **Step 2: Run** `pnpm test src/components/routines` → FAIL.

- [ ] **Step 3: Implement** components, pages and messages. Follow `src/components/customers/customer-results.tsx` + `src/app/(app)/customers/page.tsx` for list/toolbar/empty-state structure, and `src/components/library/library-toolbar.tsx` for URL-driven filters (debounced search updating the URL).

- [ ] **Step 4: Verify in the app.** `pnpm dev` (or the preview tool), sign in as a seeded/e2e physio, create a customer, click **New routine**, land on `/routines/<id>` (the editor is a placeholder 404 until Task 9: confirm the redirect URL only). `pnpm check` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(routines): routine lists, filters and new-routine dialog"
```

---

### Task 9: Editor shell (page, header, save, conflict, unsaved guard)

**Files:**

- Create: `src/app/(app)/routines/[routineId]/page.tsx`, `src/components/routines/{routine-editor,routine-header}.tsx`, `src/components/routines/use-unsaved-guard.ts`, tests: `use-unsaved-guard.test.tsx`, `routine-editor.test.tsx`
- Modify: `messages/{en,es}.json`

**Interfaces:**

- Consumes: `getRoutine` (Task 6), `listCategoryTree`, `listRecentExercises`, `listExercises` (library), `fromLoaded`, `toSaveBlocks`, `EditorBlock` (Task 5), `saveRoutineAction` (Task 7), `formatPrescription` (Task 1), `StatusBadge` (Task 8).
- Produces:
  - Page: `PageProps<"/routines/[routineId]">`; `getRoutine` via `withPhysio`; non-uuid/foreign → `notFound()`. `generateMetadata` title = routine name. Builds serialisable props: `RoutineEditorProps = { routine: { id, version, customerId, customerName, header: HeaderValues, cases: { id: string; title: string }[] }, initialBlocks: EditorBlock[] (via fromLoaded with `crypto.randomUUID`), categories: CategoryNode[], recent: ExerciseSummary[], exercises: ExerciseSummary[] (first 60 active, name order), areas? }`. Renders `<RoutineEditor {...props} />` under a back link to the customer's routines tab (`/customers/<id>?tab=routines`).
  - `HeaderValues = { name: string; notes: string; caseId: string | null; sessionsPerWeek: string; sessionsPerDay: string; status: RoutineStatus }` (strings for inputs).
  - `use-unsaved-guard.ts`: `useUnsavedGuard(dirty: boolean, message: string): void` — adds `beforeunload` (sets `returnValue`) while dirty, and a capture-phase `click` listener on `document` for same-origin `<a href>` clicks (not `target=_blank`, no modifier keys) that calls `window.confirm(message)` and, if refused, `preventDefault()` + `stopPropagation()`. Removes listeners when clean/unmounted.
  - `<RoutineEditor {...props} />` (client): owns `header` state, `blocks` state, `version` state, `saving`, `error`, `savedAt`. `dirty` = JSON of (header, `toSaveBlocks(blocks)`) differs from the last saved snapshot. Save button → `saveRoutineAction({ id, version, name, notes, caseId, sessionsPerWeek, sessionsPerDay, status, ...toSaveBlocks(blocks) })` (numeric strings → numbers, blank → null). On `ok`: `version = data.version`, snapshot updated, "Saved" status announced (`role="status"`). On `conflict`: destructive alert "This routine changed in another tab. Reload?" with a **Reload** button (`router.refresh()` and remount by keying the editor on the new `version` returned by the page — pass `key={routine.version}` in the page so a refresh remounts with fresh state). Other errors map to `Routines.editor.errors.*`. Save disabled when not dirty or saving.
  - `<RoutineHeader … />`: inline-editable name (`Input` styled as a title, `aria-label` "Routine name"), status `Select` (draft/active/archived), case `Select` (only if the customer has cases; "No case" option), sessions per week / per day (`Input inputMode="numeric"`), notes `Textarea`, customer name shown as a link, Save button + saved/dirty indicator. Field errors from the server (`nameRequired`, …) shown under fields.
  - The body renders two regions with placeholders that Tasks 10 and 11 fill: `<BlockList … />` and `<ExercisePicker … />`. For this task render `data-testid="block-list-slot"` / `"picker-slot"` empty containers in the desktop two-column grid (`lg:grid-cols-[1fr_22rem]`).

Messages: `Routines.editor.*`: `back "Back to routines"`, `name "Routine name"`, `status "Status"`, `case "Case"`, `noCase "No case"`, `sessionsPerWeek "Sessions per week"`, `sessionsPerDay "Sessions per day"`, `notes "Notes for the patient"`, `notesHint "Shown at the top of the routine."`, `save "Save"`, `saving "Saving…"`, `saved "Saved"`, `unsaved "Unsaved changes"`, `leaveConfirm "You have unsaved changes. Leave without saving?"`, `conflict "This routine changed in another tab. Reload?"`, `reload "Reload"`, `errors.{notFound,caseNotFound,exerciseNotFound,needsItems "Add at least one exercise before activating.",blockedByPlans "This routine is used in an active weekly plan.",invalid "Check the highlighted fields.",generic "Couldn't save. Try again."}`, `errors.{nameRequired,nameTooLong,notesTooLong,outOfRange}`.

- [ ] **Step 1: Write failing tests.** `use-unsaved-guard.test.tsx`: dirty → dispatching `beforeunload` sets `defaultPrevented`/`returnValue`; clean → not; dirty + click on an in-app `<a>` with `confirm` → false prevents default, true lets it through; `target=_blank`/ctrl-click ignored; unmount removes listeners. `routine-editor.test.tsx` (mock `saveRoutineAction`): Save disabled until a header field changes; editing the name enables it; clicking Save sends `{ id, version, name, …, groups, items }` with numbers parsed; success bumps the sent version on the next save and shows "Saved"; `conflict` shows the alert with a Reload button; `needsItems` shows its message; a blank name shows the field error.

- [ ] **Step 2: Run** `pnpm test src/components/routines` → FAIL.

- [ ] **Step 3: Implement.** Read `node_modules/next/dist/docs/` on `notFound`/`revalidatePath` if unsure. Keep state helpers pure by calling Task 5 functions only from Tasks 10–11.

- [ ] **Step 4: Verify in the app** (preview): open a routine created in Task 8, rename it, Save → "Saved"; open the same URL in a second tab, save there, then save in the first → conflict alert; Reload shows the new name. `pnpm check` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(routines): editor shell with save, optimistic-lock conflict and unsaved guard"
```

---

### Task 10: Block list, item rows, sets table and superset controls

**Files:**

- Create: `src/components/routines/{block-list,item-row,item-editor,sets-table,group-card}.tsx` and tests for each of `block-list`, `item-editor`, `sets-table`
- Modify: `src/components/routines/routine-editor.tsx` (mount `BlockList`, pass `blocks`/`setBlocks`), `messages/{en,es}.json` (new `Routines.items.*`, `Prescription.*` keys; delete `Prescription` keys nobody uses: `legend`, `hint`, `sets`, `repsMaxHint` if unused)
- Reuse: `SortableList` (`src/components/sortable/sortable-list.tsx`), `YouTubeThumbnail` (`src/components/library/youtube-thumbnail.tsx`)

**Interfaces:**

- Consumes: everything in `routine-editor.ts` (Task 5), `formatPrescription` (Task 1), `PRESCRIPTION_LIMITS`, `LOAD_MAX_LENGTH`, `PRESCRIPTION_SIDES`, `PRESCRIPTION_NOTES_MAX_LENGTH`.
- Produces:
  - `<BlockList blocks={EditorBlock[]} onChange={(blocks: EditorBlock[]) => void} newKey={() => string} />`: a `SortableList` of blocks (key = block key, label = first item's exercise name or "Superset"). A `single` block renders `<ItemRow>`; a `group` block renders `<GroupCard>` containing a nested `SortableList` of its items (so items reorder only inside the group and blocks move as a unit; a flat drag can never split a group). Empty state: "No exercises yet. Pick some from the list."
  - `<ItemRow item={EditorItem} grouped={boolean} handle={SortableHandleProps} expanded onToggle onChange={(next: (blocks) => EditorBlock[]) => void} … />`: cover thumbnail (or neutral placeholder), exercise name (+ "Archived" badge when `exerciseArchived`), `formatPrescription` summary (translator wrapper over `useTranslations("Prescription")`), expand/collapse `Button` (`aria-expanded`), drag handle, overflow `DropdownMenu`: **Duplicate**, **Remove**, **Group with next** (disabled when `!canGroupWithNext`), **Ungroup** (only for grouped), **Open exercise** (link `/library/<exerciseId>`). Name a helper `useSummaryTranslator()` in `src/components/routines/prescription-summary.ts` (returns the `PrescriptionTranslate` function) for reuse.
  - `<GroupCard>`: bordered container labelled "Superset" with a rest input (`Rest after each round (s)`, uses `updateGroupRest`), an Ungroup button, and the nested items.
  - `<ItemEditor item grouped … />` (shown when expanded): `<SetsTable>` + per-item fields hold (s), rest (s) (rest hidden when `grouped`, replaced by the group's rest), side (`Select`; hidden input not needed: state-driven), notes (`Textarea`, max 500). Numeric inputs: `Input type="text" inputMode="numeric"`, parse with the zod field schemas on blur or change into `number | null` (invalid text keeps the raw string in local state and shows `Prescription.errors.*`; the block state only stores valid numbers).
  - `<SetsTable item grouped … />`: one row per set: index, reps, "to" (max reps, shown as range hint), duration (s), load (`maxLength` 40), remove-set button (disabled when `!canRemoveSet`); footer **Add set** (disabled when `!canAddSet`; adds a copy of the last set). For a grouped item, add/remove apply to every member and a hint explains "Sets stay in sync across the superset." Table is `overflow-x-auto` with `min-w-0` parents (mobile must not scroll horizontally at page level).
  - Every mutation goes through Task 5 helpers, e.g. `onChange((b) => addSet(b, item.key, newKey))`; `BlockList` calls `onChange(next)`.

Messages (`Routines.items.*`, English; add Spanish voseo): `empty "No exercises yet. Pick some from the list."`, `superset "Superset"`, `supersetHint "Alternates set by set: A1, B1, rest, A2, B2…"`, `groupRest "Rest after each round (s)"`, `expand "Edit prescription"`, `collapse "Hide prescription"`, `archivedBadge "Archived"`, `menu "Exercise options"`, `duplicate "Duplicate"`, `remove "Remove"`, `groupWithNext "Group with next"`, `ungroup "Ungroup"`, `openExercise "Open exercise"`, `noPrescription "No prescription set"`, `sets.title "Sets"`, `sets.set "Set {n, number}"`, `sets.reps "Reps"`, `sets.repsMax "Max reps"`, `sets.duration "Duration (s)"`, `sets.load "Load"`, `sets.add "Add set"`, `sets.remove "Remove set {n, number}"`, `sets.syncHint "Sets stay in sync across the superset."`, `sets.limit "Up to {max, number} sets."`, `fields.hold "Hold (s)"`, `fields.rest "Rest (s)"`, `fields.side "Side"`, `fields.notes "Notes"`, `limit "A routine can have up to {max, number} exercises."`. Also `Prescription.summary.{count "{value, number}", range "{min, number}–{max, number}", seconds "{value, number} s", sets "{count, plural, one {# set} other {# sets}}", blank "–", hold "hold {value, number} s", rest "rest {value, number} s"}` and keep `Prescription.sides.*`, `errors.*`, `sideNone`, `loadPlaceholder`.

- [ ] **Step 1: Write failing tests.**
  - `sets-table.test.tsx`: renders one row per set; typing reps updates via `onChange`; **Add set** copies the previous values; remove disabled when a group member has 1 set; add disabled at 20 sets; invalid text ("abc") shows "Enter a whole number." and doesn't emit.
  - `item-editor.test.tsx`: rest field hidden when `grouped`; side select uses `chooseOption`; notes limited to 500 chars.
  - `block-list.test.tsx` (`SortableList` can't be driven by RTL, so test structure/handlers only): renders single rows and a group card with its members; summary text shows e.g. "3 × 12 · rest 60 s"; overflow **Remove** on a group member of a 2-group dissolves the group (assert `onChange` called with blocks equal to `removeItem(...)`); **Group with next** is disabled on the last block and when the result would exceed 3; expand toggles `aria-expanded`; an archived exercise shows the "Archived" badge.
  - Real drag/keyboard reorder is covered in the e2e (Task 12).

- [ ] **Step 2: Run** `pnpm test src/components/routines` → FAIL.

- [ ] **Step 3: Implement.** Follow `MediaListEditor` (`src/components/library/media-list-editor.tsx`) for `SortableList` usage and `min-w-0`/`grid-cols-1` mobile fixes. No hand-rolled controls (shadcn `Select`, `Input`, `Textarea`, `Label`, `DropdownMenu`, `Button`, `Badge`).

- [ ] **Step 4: Verify in the app** (preview at desktop and mobile widths): add exercises via a temporary hard-coded call or wait for Task 11; at minimum confirm rendering with a routine that has items created through an integration-test fixture. `pnpm check` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(routines): block list, per-set editor and superset controls"
```

---

### Task 11: Exercise picker (desktop panel, mobile sheet)

**Files:**

- Create: `src/components/routines/exercise-picker.tsx`, `src/components/routines/exercise-picker.test.tsx`
- Modify: `src/components/routines/routine-editor.tsx` (mount picker in the right column on `lg+`; on smaller screens an "Add exercises" button opens it in a `Sheet` from the bottom), `messages/{en,es}.json`
- Reuse: `Sheet` (`src/components/ui/sheet.tsx`), `BODY_AREAS` labels from `BodyAreas` messages, `CategorySelect` (`src/components/library/category-select.tsx`) if it fits, `YouTubeThumbnail`

**Interfaces:**

- Consumes: `searchExercisesAction` (Task 7), `ExerciseSummary`, `CategoryNode`, `newItem`, `addItem`, `canAddItem` (Task 5).
- Produces: `<ExercisePicker categories={CategoryNode[]} recent={ExerciseSummary[]} initial={ExerciseSummary[]} disabledReason={string | null} onPick={(exercise: ExerciseRef) => void} />` (client). Search input (debounced 250 ms), category select (grouped, "All categories"), body-area select ("Any area"), a **Recent** section shown while the search box is empty and no filters are set, results list of buttons (thumbnail, name, area badges) — clicking calls `onPick`. While a search is in flight results stay visible (`aria-busy`). Results/announcements: `role="status"` "N exercises". When `disabledReason` (routine at 50 items) buttons are disabled and the reason is shown. Requests are sequenced so a slow older response never overwrites a newer one. Each pick adds one row to the editor and announces "Added <name>" (polite live region); the picker stays open.
  - `RoutineEditor` wiring: `onPick = (exercise) => setBlocks((b) => addItem(b, newItem(exercise, newKey)))`; `ExerciseSummary` → `ExerciseRef` mapping (`archived: archivedAt !== null`, cover from `summary.cover`).

Messages `Routines.picker.*`: `title "Add exercises"`, `search "Search exercises"`, `category "Category"`, `allCategories "All categories"`, `area "Body area"`, `anyArea "Any area"`, `recent "Recent"`, `results "{count, plural, one {# exercise} other {# exercises}}"`, `none "No exercises match."`, `noLibrary "Your library is empty. Add exercises in the library first."` (with link to `/library/new`), `added "Added {name}."`, `full "A routine can have up to {max, number} exercises."`, `open "Add exercises"` (mobile button), `close "Done"`.

- [ ] **Step 1: Write failing tests** (`exercise-picker.test.tsx`, mock `searchExercisesAction`; use fake timers for the debounce): shows recent when idle; typing calls the action once after the debounce with `{ q, category: undefined, area: undefined }`; choosing an area with `chooseOption` calls the action with `area`; picking calls `onPick` with the exercise ref; a slow first response arriving after a second request does not replace results; `disabledReason` disables buttons and shows the text; empty library message and link.

- [ ] **Step 2: Run** `pnpm test src/components/routines/exercise-picker.test.tsx` → FAIL.

- [ ] **Step 3: Implement** and wire into `RoutineEditor` (desktop panel is sticky, `max-h` with own scroll; the sheet reuses the same component).

- [ ] **Step 4: Verify in the app** (desktop + mobile width via `resize_window`): search, filter, add exercises, expand a row, edit sets, group two rows, save, reload, values persist. `pnpm check` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(routines): exercise picker with search, filters and recent"
```

---

### Task 12: E2E, docs and final verification

**Files:**

- Create: `e2e/routines.spec.ts`
- Modify: `docs/architecture.md` (prescription section + domain table), `docs/specs/03-exercise-library.md` (decisions note), `docs/specs/05-routines.md` (status, checkboxes, decisions), `docs/specs/10-sharing-and-patient-page.md`, `12-workout-mode.md`, `14-export-pdf-and-excel.md`, `15-version-history.md` (one-line note where they mention the old prescription shape), `docs/specs/README.md` (index row → Done)

**Interfaces:**

- Consumes: `e2e/helpers/auth.ts` (`test` fixtures incl. `physioPage`, `createPhysio`, `signIn`), `chooseOption` (`e2e/helpers/select.ts`), patterns from `e2e/customers.spec.ts` and `e2e/library.spec.ts`.
- Produces: e2e coverage of the critical flow, docs reflecting the shipped model.

- [ ] **Step 1: Write the e2e** `e2e/routines.spec.ts`. Seed through the UI or SQL helpers used by `e2e/library.spec.ts` (create a customer via `/customers/new`; create three exercises via `/library/new` or direct SQL if the library spec has a helper). Tests:
  1. **Build and persist:** open the customer → Routines tab → **New routine** → name "Knee rehab A" → editor. Add three exercises from the picker; expand the first, add two sets (copy) and change reps of set 2 to 10 and set 3 to 8; set hold 5, rest 60, side Left; group exercise 2 with 3 (**Group with next**) and set the group rest 45; reorder with the keyboard (focus a drag handle, `Space`, `ArrowDown`, `Space`) and assert the order via accessible names; set sessions per week 3; Save; reload; assert order, the summary text (e.g. `12 · 10 · 8` or the values entered), the superset and header values are identical.
  2. **Conflict:** open the same routine in a second page of the same context, change the name and Save; in the first page change the name and Save → conflict alert; **Reload** shows the second page's name.
  3. **Unsaved guard:** edit the name, register a `page.once("dialog")` handler that dismisses, click the sidebar "Customers" link → still on the routine; accept the dialog next time → navigates.
  4. **Rules:** with zero exercises choose status Active and Save → "Add at least one exercise before activating."; add an exercise → Active saves, the list at `/routines` shows the Active badge; filtering `?status=draft` hides it.
  5. **Exercise in use:** in the library open an exercise used by the routine, delete → message "This exercise is used in a routine. Archive it instead."; archive it; the routine still shows it with the "Archived" badge and the picker no longer lists it.
  6. **Mobile project:** no horizontal overflow on the editor with a long exercise name and an expanded sets table (`hasNoHorizontalOverflow` helper as in `customers.spec.ts`); the picker opens as a sheet from **Add exercises**.

- [ ] **Step 2: Run** `pnpm test:e2e e2e/routines.spec.ts` → fix app bugs found (use `superpowers:systematic-debugging` for failures; fix root causes, don't loosen assertions). Record notable fixes for the spec's decisions section.

- [ ] **Step 3: Update docs.**
  - `architecture.md`: replace "Prescription fields (shared by `exercises` defaults and `routine_items`)" with the new model: per-set fields (`reps`, `reps_max`, `duration_seconds`, `load`) on `routine_item_sets`, per-item fields (`hold_seconds`, `rest_seconds`, `side`, `notes`) on `routine_items`, supersets via `routine_groups`; exercises carry no defaults. Add `routine_groups`, `routine_item_sets` to the domain table and ER diagram.
  - Spec 03: add a decision "Prescription defaults were removed in spec 05 (UI/code); columns dropped in a follow-up chore".
  - Specs 10/12/14/15: add a short note in each where the prescription is mentioned: "prescription is per set (+ per item) since spec 05; render with `formatPrescription`".
  - Spec 05: Status `Done`, tick acceptance criteria, fill "Decisions made during implementation" (must include: server assigns ids on every save instead of keeping client ids; `Prescription.summary` keys and `formatPrescription` rules; picker `searchExercisesAction` capped at 60; `listPlansUsingRoutine` stub for spec 06; cases unique + composite FK; e2e findings; follow-up chore to drop exercise default columns). README: row 05 → `Done`.

- [ ] **Step 4: Full verification** (`superpowers:verification-before-completion`): `pnpm check`, `pnpm test:int`, `pnpm test:e2e` all green; paste the final summary lines into the PR later.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(routines): e2e flow; docs: spec 05 done, prescription model"
```
