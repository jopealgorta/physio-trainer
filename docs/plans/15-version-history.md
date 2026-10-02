# Plan 15 · Version history

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use
> checkbox (`- [ ]`) syntax. Build test-first (superpowers:test-driven-development); each task ends
> green on `pnpm check` (and `pnpm test:int` when it touches the DB) and is committed.

**Goal:** every routine/plan write stores a JSON snapshot in the same transaction; the physio sees a
version list with summaries, diffs any two versions and restores one (as a new version).

**Architecture:** pure snapshot types, diff and summary in `src/lib/history/`; two append-only
tables; `src/server/history/record.ts` builds a snapshot from the DB and inserts it, called from
every routine/plan write path; restore goes through `saveRoutine` (routines) or a plan restore
mutation; a client `HistorySheet` loads metadata/snapshots through server actions and diffs on the
client.

**Tech stack:** Next.js 16, Drizzle (drizzle-kit migrations), Supabase Postgres RLS, zod v4,
next-intl, shadcn `Sheet`/`Select`/`AlertDialog`, Vitest, Playwright.

**Spec:** [`../specs/15-version-history.md`](../specs/15-version-history.md) (read its answered Open
questions). Also read `docs/architecture.md` (tenancy rules, conventions) and `CLAUDE.md`.

## Global constraints

- Tenancy: both tables carry `physio_id`, composite FKs `(physio_id, routine_id|weekly_plan_id)`,
  RLS on, every query also filters `physio_id`. `routine_versions`: select + insert policies only.
  `weekly_plan_versions`: select + insert + update (coalescing), never delete.
- Snapshots are written in the caller's transaction (`tx`), never through `db`.
- Restore brings back content only: routine name, notes, sessions per week/day, groups/items/sets;
  plan name, notes, entries. Status, case and phase window (`phaseLabel/startsOn/endsOn`) stay current.
- Plan restore drops entries whose routine is archived or deleted (warning count). Routine restore
  drops items whose exercise was deleted (archived exercises are kept) and ungroups a superset left
  with < 2 members.
- Coalescing (plans only): update the latest row instead of inserting when it is `kind = 'edited'`,
  same `session_id` (`request.jwt.claims ->> 'session_id'`, `IS NOT DISTINCT FROM`) and its
  `updated_at` is < 5 minutes before `now()`. Created/restored rows are never coalesced into.
- Every user-visible string in `messages/en.json` and `messages/es.json` (Rioplatense voseo) under
  `History`; dates via `useFormatter`. Colours via tokens (`text-primary`, `text-destructive`,
  `bg-muted`…), never hard-coded; accent stays on `primary`.
- shadcn primitives only (`Sheet`, `Select` with `toSelectValue`/`fromSelectValue` rules,
  `AlertDialog`, `Button`). No functions/icons passed from Server to Client Components.
- Node: `nvm use 24` before `pnpm` (shell default is v20).

## Review focus

1. A write path that bumps `routines.version`/`weekly_plans.version` (or creates one) without a
   matching version row: the Task 3 invariant test must cover create, save, copy, template
   create/assign/duplicate/save-as, next phase, separate copy, every board action, `updatePlan`.
2. Restoring onto an active routine/plan an empty version: must fail with the existing
   `needsItems` / `needsEntries` error and write nothing (Task 4 int test).
3. Two exercises with the same exercise id in one routine: diff must pair them in order, not
   report spurious moves/changes (Task 1 unit test).
4. Restore while the editor has unsaved edits or another tab saved meanwhile: restore uses the
   server's current version (never the client's), and the editor reloads (Task 4 + Task 5).
5. Legacy routines/plans (created before this spec) have no v1: the list shows their first
   recorded version as "First recorded version" without a summary, and the diff still works
   between any two existing rows (Task 1 summary null + Task 5 component test).

---

### Task 1: Snapshot shapes, diff and summary (pure)

**Files:**
- Create: `src/lib/history/snapshot.ts`, `src/lib/history/diff.ts`, `src/lib/history/summary.ts`
- Test: `src/lib/history/snapshot.test.ts`, `src/lib/history/diff.test.ts`, `src/lib/history/summary.test.ts`

**Produces:**

```ts
// snapshot.ts (zod schemas + inferred types; schema number lets the shape migrate later)
export const SNAPSHOT_SCHEMA = 1;
export const snapshotSetSchema = z.object({ reps, repsMax, durationSeconds, load }); // all nullable, same types as SetPrescription
export const routineSnapshotSchema = z.object({
  schema: z.literal(1),
  routine: z.object({
    name: z.string(), notes: z.string().nullable(), status: z.enum(ROUTINE_STATUSES),
    caseId: z.string().nullable(), sessionsPerWeek: z.number().nullable(),
    sessionsPerDay: z.number().nullable(), phaseLabel: z.string().nullable(),
    startsOn: z.string().nullable(), endsOn: z.string().nullable(),
  }),
  groups: z.array(z.object({ key: z.string(), restSeconds: z.number().nullable() })),
  items: z.array(z.object({
    exercise: z.object({ id: z.string(), name: z.string(), instructions: z.string().nullable() }),
    position: z.number().int(),
    prescription: z.object({
      groupKey: z.string().nullable(), holdSeconds, restSeconds, side: z.enum(PRESCRIPTION_SIDES).nullable(),
      notes: z.string().nullable(), sets: z.array(snapshotSetSchema),
    }),
  })),
});
export const planSnapshotSchema = z.object({
  schema: z.literal(1),
  plan: z.object({ name, notes, status, caseId, phaseLabel, startsOn, endsOn }),
  entries: z.array(z.object({
    id: z.string(), weekday: z.number().int().min(1).max(7), position: z.number().int(),
    label: z.string().nullable(),
    routine: z.object({ id: z.string(), name: z.string(), version: z.number().int() }),
  })),
});
export type RoutineSnapshot = z.infer<typeof routineSnapshotSchema>;
export type PlanSnapshot = z.infer<typeof planSnapshotSchema>;
export const VERSION_KINDS = ["created", "edited", "restored"] as const;
export type VersionKind = (typeof VERSION_KINDS)[number];
```

Group keys in a snapshot are `g0`, `g1`… in order of first appearance (record.ts assigns them),
items sorted by `position`, entries sorted by `(weekday, position)`.

```ts
// diff.ts
export type SetField = "reps" | "repsMax" | "durationSeconds" | "load";
export type ItemField = "holdSeconds" | "restSeconds" | "side" | "notes" | "group" | "sets";
export type FieldChange<F extends string> = { field: F; from: unknown; to: unknown };
export type SetDiff =
  | { index: number; kind: "added" | "removed"; set: SnapshotSet }
  | { index: number; kind: "changed"; changes: FieldChange<SetField>[] };
export type ItemDiff = {
  status: "added" | "removed" | "changed" | "unchanged";
  moved: boolean;
  before: RoutineSnapshot["items"][number] | null;
  after: RoutineSnapshot["items"][number] | null;
  changes: FieldChange<ItemField>[]; // "sets" = set count; "group" = superset membership/rest
  sets: SetDiff[];                   // per set index (index is 0-based; UI shows index + 1)
};
export type RoutineHeaderField = keyof RoutineSnapshot["routine"];
export type RoutineDiff = { header: FieldChange<RoutineHeaderField>[]; items: ItemDiff[] };
export function diffRoutines(before: RoutineSnapshot, after: RoutineSnapshot): RoutineDiff;

export type EntryDiff = {
  status: "added" | "removed" | "changed" | "unchanged";
  moved: boolean; // weekday or position changed
  before: PlanSnapshot["entries"][number] | null;
  after: PlanSnapshot["entries"][number] | null;
  changes: FieldChange<"label" | "routine">[]; // routine = a different routine id
};
export type PlanHeaderField = keyof PlanSnapshot["plan"];
export type PlanDiff = { header: FieldChange<PlanHeaderField>[]; entries: EntryDiff[] };
export function diffPlans(before: PlanSnapshot, after: PlanSnapshot): PlanDiff;
```

Algorithm (routines): pair items by `exercise.id`, the k-th occurrence in `before` with the k-th in
`after`. Unpaired before = removed, unpaired after = added. Among paired items take the longest
common subsequence of the pair order; paired items outside it are `moved`. Group change: an item's
group membership is compared as "set of partner exercise ids + group restSeconds" (keys are
positional, so compare content, not keys). Order of `items`: `after` order, with each removed item
inserted at its old index. Plans: pair entries by `id`; moved = weekday or position differ.

```ts
// summary.ts — stored in the `summary` jsonb column, rendered by the UI with next-intl
export const changeSummarySchema = z.object({
  added: z.number().int(), removed: z.number().int(), moved: z.number().int(),
  changed: z.number().int(),
  fields: z.record(z.string(), z.number().int()), // field -> number of items/entries where it changed
  header: z.array(z.string()),                      // header fields that changed
});
export type ChangeSummary = z.infer<typeof changeSummarySchema>;
export function summarizeRoutine(diff: RoutineDiff): ChangeSummary; // fields keys: SetField | ItemField
export function summarizePlan(diff: PlanDiff): ChangeSummary;       // fields keys: "label" | "routine"
export const isEmptySummary = (s: ChangeSummary) => boolean;
```

For `fields`, a per-set field counts once per item (reps changed on sets 1 and 2 of one item = 1).

- [ ] **Step 1:** Write `snapshot.test.ts`: a valid routine and plan snapshot parse; `schema: 2`
  fails; missing `prescription.sets` fails.
- [ ] **Step 2:** Write `diff.test.ts` (fixtures built with a small `item(exerciseId, overrides)`
  helper): identical → all unchanged, empty header; appended item → `added`; removed → `removed` at
  its old index; swap of two items → exactly one `moved` (LCS); reps 10→12 on set 2 → item
  `changed`, `sets: [{ index: 1, kind: "changed", changes: [{ field: "reps", from: 10, to: 12 }] }]`;
  a third set added → `sets` gets `{ index: 2, kind: "added" }` and `changes` has `sets`;
  side/notes/hold change; two items grouped into a superset → both get a `group` change; same
  exercise twice, second one edited → only the second is changed, no moves; header name/status/
  `startsOn` changes. Plans: entry added, removed, moved weekday, moved position, label changed,
  routine swapped (same entry id, other routine id).
- [ ] **Step 3:** Run `pnpm test src/lib/history` — expect FAIL (modules missing).
- [ ] **Step 4:** Implement `snapshot.ts`, `diff.ts`.
- [ ] **Step 5:** Write `summary.test.ts`: "+2, reps changed on 1" fixture →
  `{ added: 2, removed: 0, moved: 0, changed: 1, fields: { reps: 1 }, header: [] }`; header-only
  change; plan summary with label + routine swap; `isEmptySummary`.
- [ ] **Step 6:** Implement `summary.ts`; `pnpm test src/lib/history` PASS; `pnpm check`.
- [ ] **Step 7:** Commit `feat(history): snapshot shapes, diff and change summary (spec 15)`.

### Task 2: Tables, migration and RLS

**Files:**
- Create: `src/db/schema/history.ts`; generated `supabase/migrations/<ts>_version-history.sql`;
  custom `supabase/migrations/<ts+1>_version-history-extras.sql`
- Modify: `src/db/schema/enums.ts` (`versionKindEnum` from `VERSION_KINDS`),
  `src/db/schema/enums.test.ts` (if it lists enums), `src/db/schema/index.ts` (export `./history`)
- Test: `src/server/history/history-rls.int.test.ts`

**Produces:** `routineVersions`, `weeklyPlanVersions` Drizzle tables; types `RoutineVersion`,
`WeeklyPlanVersion`.

```ts
export const routineVersions = pgTable("routine_versions", {
  id: uuid().primaryKey().defaultRandom(),
  physioId: physioId(),                 // notNull, references physios on delete cascade
  routineId: uuid().notNull(),
  version: integer().notNull(),
  kind: versionKindEnum().notNull(),
  restoredFrom: integer(),
  snapshot: jsonb().$type<RoutineSnapshot>().notNull(),
  summary: jsonb().$type<ChangeSummary>(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: "routine_versions_routine_fk", columns: [t.physioId, t.routineId],
    foreignColumns: [routines.physioId, routines.id] }).onDelete("cascade"),
  unique("routine_versions_routine_version_unique").on(t.routineId, t.version),
  index("routine_versions_routine_idx").on(t.physioId, t.routineId, t.version.desc()),
  check("routine_versions_version_positive", sql`${t.version} >= 1`),
  check("routine_versions_restored_from", sql`(${t.kind} = 'restored') = (${t.restoredFrom} is not null)`),
  pgPolicy("routine_versions_select", { for: "select", to: authenticatedRole, using: sql`${t.physioId} = ${authUid}` }),
  pgPolicy("routine_versions_insert", { for: "insert", to: authenticatedRole, withCheck: sql`${t.physioId} = ${authUid}` }),
]);
// weeklyPlanVersions: same, with weeklyPlanId (FK to weekly_plans, cascade), sessionId uuid null,
// ...timestamps (createdAt + updatedAt), plus an update policy (using + withCheck own rows).
```

Import types into the schema file with relative paths (`../../lib/history/snapshot`), as the other
schema files do.

- [ ] **Step 1:** Write `history-rls.int.test.ts` (pattern: `src/server/routines/routines.int.test.ts`,
  `createTestPhysio`, `runAsPhysio`): physio A inserts a routine version and a plan version for
  their own routine/plan; B selects none of them; B inserting with A's `physio_id` throws; A
  `update` on `routine_versions` affects 0 rows (no policy); A `delete` on either table affects 0
  rows; A can update own plan version; B updating A's plan version affects 0 rows; deleting the
  routine cascades its versions; duplicate `(routine_id, version)` throws.
- [ ] **Step 2:** `pnpm test:int src/server/history` — expect FAIL (tables missing). Needs
  `pnpm db:start`.
- [ ] **Step 3:** Write the schema, `pnpm db:generate`, then the extras migration:

```sql
-- Version history extras (spec 15): things Drizzle can't express.
create trigger weekly_plan_versions_set_updated_at
  before update on public.weekly_plan_versions
  for each row execute function public.set_updated_at();
```

- [ ] **Step 4:** `pnpm db:reset`, `pnpm test:int` (whole suite: the schema-wide RLS/trigger
  tests must still pass) PASS; `pnpm check`.
- [ ] **Step 5:** Commit `feat(history): version tables with insert-only RLS (spec 15)`.

### Task 3: Record snapshots on every write path

**Files:**
- Create: `src/server/history/record.ts`
- Modify: `src/server/routines/mutations.ts` (`createRoutine`, `saveRoutine`, `copyRoutine`),
  `src/server/plans/mutations.ts` (`createPlan`, `updatePlan`, `bump` and all board actions,
  `addNewRoutineEntry`'s direct template insert, `copyPlan`), `src/server/templates/mutations.ts`
  (`createTemplate` direct inserts), `src/server/phases/mutations.ts` (`copyPlanPhase` direct insert)
- Test: `src/server/history/record.int.test.ts`

**Consumes:** Task 1 schemas/diff/summary, Task 2 tables.
**Produces:**

```ts
export type RecordOptions = { kind: VersionKind; restoredFrom?: number };
export async function buildRoutineSnapshot(tx: Tx, physioId: string, routineId: string): Promise<RoutineSnapshot>;
export async function recordRoutineVersion(tx: Tx, physioId: string, routineId: string, options: RecordOptions): Promise<void>;
export async function buildPlanSnapshot(tx: Tx, physioId: string, planId: string): Promise<PlanSnapshot>;
export async function recordPlanVersion(tx: Tx, physioId: string, planId: string, options: RecordOptions): Promise<void>;
```

- `recordRoutineVersion`: reads `routines.version`, builds the snapshot (items by position, sets by
  position, exercise name/instructions joined from `exercises`), loads the previous row
  (`version < current`, highest) and stores `summary = previous ? summarizeRoutine(diffRoutines(prev, next)) : null`.
  `kind: "created"` always stores `summary: null`.
- `recordPlanVersion`: same, plus coalescing. Select the latest row `for update`; coalesce when
  `options.kind === "edited" && latest.kind === "edited" && latest.sessionId IS NOT DISTINCT FROM
  session && latest.updatedAt > now() - interval '5 minutes'` (evaluate the time and session test
  in SQL: `current_setting('request.jwt.claims', true)::jsonb ->> 'session_id'`). Coalesce = update
  that row's `version`, `snapshot`, `summary` (diffed against the row *before* it), `sessionId`.
  Otherwise insert with `sessionId`.
- `saveRoutine` gains an optional 4th parameter `record: RecordOptions = { kind: "edited" }` and
  calls `recordRoutineVersion` after the final `update(routines)`. `createRoutine` records
  `created` inside the same savepoint after the insert; `copyRoutine` records `created` after the
  sets are inserted. Replace plan `bump()` with `bumpAndRecord(tx, physioId, planId)` that bumps
  then records `edited`; `updatePlan` records `edited` after its update; `createPlan`/`copyPlan`
  record `created` (copyPlan after its entries). Direct inserts in templates/phases/plans record
  `created` once their content exists (after entries for plans).

- [ ] **Step 1:** Write `record.int.test.ts`:
  - saving a routine writes a row whose `version` equals `routines.version`, `kind: "edited"`,
    snapshot items match (exercise name included), summary `{ fields: { reps: 1 } … }` after a reps
    change;
  - a failed save rolls back its snapshot: inside `runAsPhysio`, call `saveRoutine` (ok) then
    `throw`; afterwards no row for that version exists;
  - `createRoutine` writes v1 `created` with `summary: null`;
  - coalescing: two board actions in one `runAsPhysio` session (same claims) → one row with the
    latest version; backdate that row's `updated_at` by 6 minutes via `db` → next action inserts;
    a different `session_id` (fresh `testClaims`) → inserts; after `createPlan` (created) the
    first board action inserts; the coalesced row's summary is diffed against the row before it;
  - **invariant**: run `createRoutine`, `saveRoutine`, `duplicateRoutine`, `createTemplate` (both
    kinds), `saveAsTemplate`, `assignTemplate`, `duplicateTemplate`, `copyIntoNextPhase` (both
    kinds), `createPlan`, `updatePlan`, `addEntry`, `addNewRoutineEntry` (customer and template
    plan), `moveEntry`, `copyEntry`, `setEntryLabel`, `removeEntry`, `makeSeparateCopy`; then
    assert via `db` that every routine and plan of the physio has a version row equal to its
    current `version` (plans: equal to the latest row, since coalescing updates it).
- [ ] **Step 2:** `pnpm test:int src/server/history/record` — expect FAIL.
- [ ] **Step 3:** Implement `record.ts` and wire every call site.
- [ ] **Step 4:** `pnpm test:int` (whole suite) PASS — existing routines/plans/templates/phases
  int tests must still pass; `pnpm check`.
- [ ] **Step 5:** Commit `feat(history): snapshot every routine and plan write (spec 15)`.

### Task 4: Queries, restore and actions

**Files:**
- Create: `src/lib/history/restore.ts` (+ `restore.test.ts`), `src/server/history/schemas.ts`,
  `src/server/history/queries.ts`, `src/server/history/mutations.ts`, `src/server/history/actions.ts`
  (+ `actions.test.ts` following `src/server/routines/actions.test.ts` mocking style)
- Test: `src/server/history/restore.int.test.ts`

**Consumes:** Tasks 1–3, `saveRoutine`/`saveRoutineSchema`, plan `lockPlan`-style locking (export a
`lockPlanForUpdate` helper from `src/server/plans/mutations.ts` if needed rather than duplicating).
**Produces:**

```ts
// lib/history/restore.ts (pure)
export function routineRestoreInput(
  snapshot: RoutineSnapshot,
  current: { id: string; version: number; status: RoutineStatus; caseId: string | null },
  existingExerciseIds: ReadonlySet<string>,
): { input: SaveRoutineInput; dropped: number };
// drops items whose exercise id is not in the set; a group left with < 2 members is removed and
// its remaining member ungrouped (restSeconds stays null on it: a grouped item has none)
export function planRestoreEntries(
  snapshot: PlanSnapshot,
  usable: ReadonlySet<string>, // routine ids that exist, are not archived, belong to the plan's customer (null = template)
): { entries: { weekday: number; position: number; routineId: string; label: string | null }[]; dropped: number };
// positions renumbered 0.. per weekday after dropping (use normalizeEntries from src/lib/plans)

// server/history/schemas.ts
export const historyTargetSchema = z.object({ kind: z.enum(["routine", "plan"]), id: z.uuid() });
export const versionsRequestSchema = historyTargetSchema.extend({ versions: z.array(z.number().int().min(1)).min(1).max(2) });
export const restoreSchema = historyTargetSchema.extend({ version: z.number().int().min(1) });
export type VersionMeta = { version: number; kind: VersionKind; restoredFrom: number | null; summary: ChangeSummary | null; at: string /* ISO */ };
export type RestoreError = "notFound" | "versionNotFound" | "needsItems" | "needsEntries" | "conflict" | "invalid";

// server/history/queries.ts
export async function listVersions(tx: Tx, physioId: string, target: HistoryTarget): Promise<VersionMeta[] | null>; // newest first; null = target not the physio's
export async function getSnapshots(tx: Tx, physioId: string, target: HistoryTarget, versions: number[]): Promise<Record<number, RoutineSnapshot | PlanSnapshot>>;

// server/history/mutations.ts
export async function restoreRoutineVersion(tx, physioId, { id, version }): Promise<Result<{ version: number; dropped: number }, RestoreError>>;
export async function restorePlanVersion(tx, physioId, { id, version }): Promise<Result<{ version: number; dropped: number }, RestoreError>>;

// server/history/actions.ts ("use server"; validate → withPhysio → revalidatePath)
export async function listVersionsAction(input: unknown): Promise<Result<VersionMeta[], "notFound" | "invalid">>;
export async function getSnapshotsAction(input: unknown): Promise<Result<Record<number, RoutineSnapshot | PlanSnapshot>, "notFound" | "invalid">>;
export async function restoreVersionAction(input: unknown): Promise<Result<{ version: number; dropped: number }, RestoreError>>;
```

- `restoreRoutineVersion`: lock the routine `for update`, load the version row, query which
  snapshot exercise ids still exist for the physio (archived included), build the input with the
  routine's *current* version/status/case, re-parse with `saveRoutineSchema` (fail `invalid` if
  it does not parse), call `saveRoutine(tx, physioId, parsed, { kind: "restored", restoredFrom: version })`
  and map its errors (`needsItems`, `conflict`, `notFound`; others → `invalid`).
- `restorePlanVersion`: lock the plan `for update`; usable routines = existing, not archived, same
  `customer_id` (null for templates); an active non-template plan left with no entries → fail
  `needsEntries`; delete current entries, insert restored ones with fresh ids, update name/notes,
  bump version, `recordPlanVersion(… { kind: "restored", restoredFrom })`.
- Revalidate `/routines/[id]` or `/plans/[id]` plus the `/routines`, `/plans`, `/customers` layouts,
  as the existing save actions do.

- [ ] **Step 1:** Write `restore.test.ts`: all exercises present → input equals snapshot content
  with current id/version/status/case, `dropped: 0`; one deleted exercise → `dropped: 1`; a
  2-member superset losing one member → remaining item has `groupKey: null`, group removed; a
  3-member superset losing one keeps the group; plan: archived routine entry dropped and positions
  renumbered.
- [ ] **Step 2:** Write `restore.int.test.ts`: save v2 (reps 10), v3 (reps 12), restore v2 → new
  v4 `kind: "restored"`, `restoredFrom: 2`, reps back to 10, status/case unchanged; restore of a
  version whose exercise was deleted → `dropped: 1`; restore of an empty v1 onto an active routine
  → `needsItems`, no new version row; plan restore drops an archived routine's entry
  (`dropped: 1`); active plan restore to empty v1 → `needsEntries`; `listVersions` newest first
  with summaries; physio B: `listVersions`/`getSnapshots` return null/empty and restore returns
  `notFound` for A's routine.
- [ ] **Step 3:** Write `actions.test.ts`: invalid input → `invalid` without calling `withPhysio`;
  happy path revalidates the routine path.
- [ ] **Step 4:** Run — expect FAIL. Implement. `pnpm test`, `pnpm test:int` PASS; `pnpm check`.
- [ ] **Step 5:** Commit `feat(history): list, compare and restore versions (spec 15)`.

### Task 5: History sheet UI and i18n

**Files:**
- Create: `src/components/history/history-sheet.tsx`, `src/components/history/version-list.tsx`,
  `src/components/history/routine-diff-view.tsx`, `src/components/history/plan-diff-view.tsx`,
  `src/components/history/summary-text.tsx` (renders a `ChangeSummary` with `useTranslations("History")`)
- Modify: `src/components/routines/routine-editor.tsx` (render the sheet; on restore
  `setReloadRequested(true); router.refresh()`), `src/app/(app)/plans/[planId]/page.tsx` (sheet
  next to `ShareButton`; key `PlanDetailsForm` and `PlanBoard` by `plan.version` if they keep local
  state from props, so a restore resets them), `messages/en.json`, `messages/es.json`
- Test: `src/components/history/history-sheet.test.tsx`, `src/components/history/summary-text.test.tsx`

**Consumes:** Task 4 actions and types, Task 1 diff.
**Produces:** `HistorySheet` client component:

```ts
export function HistorySheet(props: {
  kind: "routine" | "plan";
  id: string;
  dirty?: boolean;      // routine editor: unsaved changes → the confirm dialog warns they are discarded
  onRestored: () => void;
}): JSX.Element;
```

Behaviour: an outline "History" `Button` (lucide `HistoryIcon`, created inside the client
component) opens a right-side `Sheet` (full width below `sm`, `sm:max-w-lg`). On open it calls
`listVersionsAction`. List rows: date + time (`useFormatter().dateTime`), `SummaryText`
("+2 exercises · reps changed on 1", "Created", "First recorded version" when `summary` is null on
an `edited` row, "No changes"), badges "Current" (top row) and "Restored from {date}". Selecting a
row shows the version view: back button, "Compare with" `Select` (options: every other version,
default the current one; uses `toSelectValue`/`fromSelectValue`), the diff of
`older → newer` of the two (via `getSnapshotsAction` + `diffRoutines`/`diffPlans`): added items in
`text-primary` with a "+" marker, removed in `text-destructive` with line-through, changed fields
as `old → new` ("Set 2 · reps 10 → 12"), header changes first; plan entries grouped by weekday
names from `Intl.DateTimeFormat(locale, { weekday: "long" })`. "Restore this version" (hidden on
the current version) opens an `AlertDialog`; when `dirty`, the body adds the unsaved-changes
warning. On success: close the sheet, show the existing editor/board feedback pattern (check how
`routine-editor.tsx` reports save results and reuse it) with "Version restored" and, when
`dropped > 0`, "{count} left out (no longer available)"; errors map to messages
(`needsItems`, `needsEntries`, `conflict`, generic).

`History` namespace keys (both locales, same ICU args): `button`, `title`, `description`,
`loading`, `empty`, `loadError`, `current`, `created`, `firstRecorded`, `noChanges`,
`restoredFrom` ({date}), `summary.added`/`removed` (plural `count`, routine: exercises, plan:
routines — use `summary.addedExercises`, `summary.addedRoutines`, …), `summary.moved`,
`summary.changedField` ({field}, {count}), `summary.header` ({fields}), `fields.*` (reps, repsMax,
durationSeconds, load, sets, holdSeconds, restSeconds, side, notes, group, label, routine, name,
status, caseId, sessionsPerWeek, sessionsPerDay, phaseLabel, startsOn, endsOn), `set` ({number}),
`back`, `compareWith`, `restore`, `restoreTitle`, `restoreBody`, `restoreUnsaved`,
`restoreConfirm`, `cancel`, `restored`, `restoredDropped` (plural), `errors.*`. Spanish voseo
("Restaurá esta versión" is a button label: use "Restaurar esta versión"; body text in voseo).

- [ ] **Step 1:** Write `summary-text.test.tsx` (render with the `en` messages provider pattern
  used by existing component tests): routine summary → "+2 exercises · Reps changed on 1"; plan
  summary → "+1 routine"; null on edited → "First recorded version"; created → "Created".
- [ ] **Step 2:** Write `history-sheet.test.tsx` (mock the actions module): opens and lists
  versions newest first with "Current"; selecting an older version shows "Set 1 · Reps 12 → 10"
  style diff lines; changing "Compare with" (use `chooseOption` from `src/test/select.ts`) refetches
  and re-diffs; restore → confirm → calls `restoreVersionAction` and `onRestored`; with `dirty`
  the confirm shows the unsaved warning; `needsItems` error shows its message.
- [ ] **Step 3:** Run — expect FAIL. Implement components, wire the editor and plan page, add
  messages to both locales.
- [ ] **Step 4:** `pnpm check` PASS (includes `src/i18n/messages.test.ts`); `pnpm dev` and check
  the sheet on a phone width (no horizontal scroll) and desktop.
- [ ] **Step 5:** Commit `feat(history): history sheet with diff and restore (spec 15)`.

### Task 6: E2E, docs and status

**Files:**
- Create: `e2e/history.spec.ts`
- Modify: `docs/specs/15-version-history.md` (Status Done, acceptance boxes, "Decisions made during
  implementation"), `docs/specs/README.md` (index row → Done)

- [ ] **Step 1:** Write `e2e/history.spec.ts` (helpers in `e2e/helpers/routines.ts`,
  `e2e/helpers/select.ts`; desktop + mobile projects):
  - routine: `createExercise`, `createRoutine`, `addExercises`, set reps 10, Save; change reps to
    12, Save; open History → top row "Reps changed on 1"; select the previous row; Restore this
    version → confirm; the reps input shows 10 again and History lists a "Restored from" row;
  - plan: create a plan with one routine on Monday, open History → "+1 routine"; restore the
    created version → the board is empty again.
- [ ] **Step 2:** `pnpm test:e2e e2e/history.spec.ts` PASS (in sandboxes set
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE`), then the full `pnpm test:e2e` to catch regressions in
  routine/plan flows.
- [ ] **Step 3:** Update the spec: Status Done, tick acceptance criteria, Decisions:
  `summary` is structured jsonb rendered per locale (not text); snapshot types live in
  `src/lib/history/snapshot.ts` (client diff needs them); `weekly_plan_versions` has an update
  policy for coalescing plus `session_id`/`updated_at`; `kind` + `restored_from` columns; entries
  carry their id; coalescing never folds into created/restored rows; versions created before this
  spec are not backfilled (first recorded version shown without summary); restoring a plan to
  before a "separate copy" leaves the copy routine in place. README index row → Done.
- [ ] **Step 4:** `pnpm check`, `pnpm test:int`; commit `test(history): e2e and spec decisions (spec 15)`.
