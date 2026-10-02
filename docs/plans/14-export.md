# Spec 14 · PDF and Excel export: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Physios export a routine, a weekly plan, or everything active for a customer as a
branded A4 PDF (thumbnails, QR code back to the live link, optional paper tracking boxes) or an
`.xlsx` workbook; patients download the PDF of what their link shows.

**Architecture:** Two loaders (physio side under RLS in `src/server/export/queries.ts`, patient
side from the resolved link in `src/server/patient/export.ts`) produce one `ExportSource`. The
pure builder `buildExportDocument` (`src/server/export/model.ts`) turns it into an
`ExportDocument` that two renderers consume: `@react-pdf/renderer` (`src/server/export/pdf/`)
and `exceljs` (`src/server/export/xlsx.ts`). Route handlers are thin: they call
`exportForPhysio` / `exportForPatient`, which return a `Response`. Routine content (items,
sets, supersets, media) is loaded by one shared function moved out of the patient view:
`loadRoutineContent(q, physioId, customerId, ids)`.

**Tech Stack:** Next.js 16 route handlers (Node runtime), Drizzle, `@react-pdf/renderer` v4
(new), `exceljs` v4 (new), `qrcode` (present), next-intl 4 `createTranslator`, Vitest 5,
Playwright 1.63.

**Spec:** [`docs/specs/14-export-pdf-and-excel.md`](../specs/14-export-pdf-and-excel.md) (read it
and [`docs/architecture.md`](../architecture.md) first). The open questions are answered in the
spec: tracking boxes are a toggle (default on; always on for patients), always A4, QR = the
customer link (created if none; omitted when revoked/expired/archived), no export for templates.

## Global Constraints

- Node 24: prefix shell commands with `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"`.
- Work in the worktree `.claude/worktrees/14-export`, branch `feat/14-export`. No migration in
  this spec (no schema change).
- Next.js 16: `params` are async (`RouteContext<"/api/export/routines/[id]">`); read
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` before
  writing a route handler.
- Tenancy: physio routes use `getSessionPhysio()` + `runAsPhysio(session.claims, …)` and every
  query also filters by `physio_id`. Patient code lives in `src/server/patient/` and derives every
  id from the resolved link. The patient PDF holds only what the patient page shows (no phase
  label/dates, no case, no last name, no visit notes).
- i18n: every string in **both** `messages/en.json` and `messages/es.json` (Rioplatense voseo),
  namespace `Export`. Dates via `Intl.DateTimeFormat(locale, CALENDAR_DATE_FORMAT)`; weekday
  names via `weekdayName(locale, d, "short")` (`src/lib/plans.ts`). No hard-coded `en-US`.
  `src/i18n/messages.test.ts` fails on missing keys / mismatched ICU args.
- UI: shadcn primitives only (`DropdownMenu*`, `Button`); accent via the `primary` token; never
  pass functions from Server to Client Components.
- PDF: A4 portrait. Greyscale-safe: body text `#171717`, secondary `#525252`, rules `#d4d4d4`;
  the accent colour only on thin rules. Target < 2 MB and < 3 s for 10 exercises.
- Responses: `Content-Disposition: attachment; filename="<ascii>"; filename*=UTF-8''<utf8>`,
  `Cache-Control: private, no-store`. Patient download adds `PATIENT_HEADERS`.
- Unit tests that render PDFs/xlsx start with `// @vitest-environment node` (default is jsdom).
- `pnpm check` must pass before every commit.

## Review Focus

1. Non-ASCII names ("Rodilla – fase 2 ñ", "Ñandú/día") in filenames, sheet names and PDF text:
   ASCII fallback filename + UTF-8 `filename*`, valid unique sheet names, glyphs render (Outfit
   Latin Extended). Tests in Tasks 3 and 7.
2. A YouTube thumbnail or logo that 404s, times out, or is not JPEG/PNG: PDF still renders
   without that image. Test in Task 6.
3. Nothing to export (customer with nothing active today, routine with zero exercises): a PDF with
   an "Nothing scheduled" line and an xlsx with headers only, never a 500. Tests in Tasks 6/7/8.
4. Another physio's id, a template id, a malformed id, an unknown `format`: 404/404/404/400, never
   content. Tests in Task 8.
5. Long instructions/notes and 20+ exercises: items never split across pages, header/footer on
   every page, instructions truncated in the PDF (full in xlsx). Test in Task 6 (page count > 1,
   no throw).

---

## File structure

| File                                                          | Responsibility                                                                                             |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/server/routines/content.ts`                              | `loadRoutineContent(q, physioId, customerId, ids)` + `RoutineContent` types (moved from `patient/view.ts`) |
| `src/server/export/model.ts`                                  | Pure: `ExportSource` → `ExportDocument`; `setColumns`, `contentDisposition`, `exportFilename`              |
| `src/server/export/translate.ts`                              | `exportTranslators(locale)` → `{ t, summary }` via next-intl `createTranslator`                            |
| `src/server/export/queries.ts`                                | Physio loaders: routine / plan / customer → `ExportSourceData`; `exportShareUrl`                           |
| `src/server/patient/export.ts`                                | Patient loader: what the link shows, whole week                                                            |
| `src/server/export/images.ts`                                 | `fetchImageDataUri`, `loadThumbnails` (YouTube `mqdefault.jpg`)                                            |
| `src/server/export/pdf/fonts.ts`                              | Registers Outfit Regular + Bold with react-pdf                                                             |
| `src/server/export/pdf/document.tsx`                          | The react-pdf `<Document>`                                                                                 |
| `src/server/export/pdf/render.ts`                             | `renderExportPdf(doc, t, deps?)` → `Buffer`                                                                |
| `src/server/export/xlsx.ts`                                   | `renderExportXlsx(doc, t)` → `Buffer`; `sheetNames`                                                        |
| `src/server/export/respond.ts`                                | `parseExportQuery`, `fileResponse`                                                                         |
| `src/server/export/physio.ts`                                 | `exportForPhysio(kind, id, url)` → `Response`                                                              |
| `src/server/patient/download.ts`                              | `exportForPatient(params)` → `Response`                                                                    |
| `src/app/api/export/{routines,plans,customers}/[id]/route.ts` | Thin GET handlers                                                                                          |
| `src/app/(patient)/[handle]/[slug]/download/route.ts`         | Thin GET handler                                                                                           |
| `src/components/export/export-menu.tsx`                       | Client dropdown: PDF, Excel, tracking toggle                                                               |
| `src/assets/fonts/Outfit-Regular.ttf`                         | New font file (OFL, same family as Bold)                                                                   |

---

### Task 1: Dependencies, fonts and a PDF smoke render

**Files:**

- Modify: `package.json`, `pnpm-lock.yaml`, `next.config.ts`
- Create: `src/assets/fonts/Outfit-Regular.ttf`, `src/server/export/pdf/fonts.ts`
- Test: `src/server/export/pdf/fonts.test.tsx`

**Interfaces:**

- Produces: `registerFonts(): void` (idempotent) and `PDF_FONT = "Outfit"`.

- [ ] **Step 1: Install**

```bash
pnpm add @react-pdf/renderer@^4 exceljs@^4
```

- [ ] **Step 2: Add the font.** Download Outfit Regular (static, OFL) from the Google Fonts repo:
      `curl -fL -o src/assets/fonts/Outfit-Regular.ttf https://github.com/google/fonts/raw/main/ofl/outfit/static/Outfit-Regular.ttf`.
      If that path 404s, find the static Regular file elsewhere in the repo tree or in the
      fonts.google.com download zip. The variable font `Outfit[wght].ttf` is not acceptable:
      react-pdf needs static weights. Verify with `file src/assets/fonts/Outfit-Regular.ttf` → "TrueType Font data".
      `OFL.txt` is already there.

- [ ] **Step 3: Write the failing smoke test** `src/server/export/pdf/fonts.test.tsx`:

```tsx
// @vitest-environment node
import { Document, Page, renderToBuffer, Text } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";

import { PDF_FONT, registerFonts } from "./fonts";

describe("registerFonts", () => {
  it("renders Outfit text, including Spanish glyphs, into a PDF", async () => {
    registerFonts();
    registerFonts(); // idempotent
    const buffer = await renderToBuffer(
      <Document>
        <Page size="A4">
          <Text style={{ fontFamily: PDF_FONT }}>Rodilla – fase 2 ñ á é</Text>
          <Text style={{ fontFamily: PDF_FONT, fontWeight: 700 }}>Bold</Text>
        </Page>
      </Document>,
    );
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
  });
});
```

- [ ] **Step 4: Run** `pnpm vitest run src/server/export/pdf/fonts.test.tsx` → FAIL (module missing).

- [ ] **Step 5: Implement** `src/server/export/pdf/fonts.ts`:

```ts
import { join } from "node:path";

import { Font } from "@react-pdf/renderer";

export const PDF_FONT = "Outfit";
const dir = join(process.cwd(), "src/assets/fonts");
let registered = false;

/** Bundled files (no network at render time); react-pdf caches them after the first render. */
export function registerFonts(): void {
  if (registered) return;
  Font.register({
    family: PDF_FONT,
    fonts: [
      { src: join(dir, "Outfit-Regular.ttf"), fontWeight: 400 },
      { src: join(dir, "Outfit-Bold.ttf"), fontWeight: 700 },
    ],
  });
  // Never hyphenate names and instructions mid-word.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
```

- [ ] **Step 6: next.config.ts.** Add `serverExternalPackages: ["@react-pdf/renderer", "exceljs"]`
      and extend `outputFileTracingIncludes` (fonts are read at runtime):

```ts
  outputFileTracingIncludes: {
    "/\\[handle\\]/\\[slug\\]/og": ["./src/assets/fonts/**/*"],
    "/\\[handle\\]/\\[slug\\]/download": ["./src/assets/fonts/**/*"],
    "/api/export/**/*": ["./src/assets/fonts/**/*"],
  },
```

- [ ] **Step 7: Run** the test → PASS; `pnpm check` → green.
- [ ] **Step 8: Commit** `chore(export): add react-pdf, exceljs and Outfit Regular`.

---

### Task 2: Move routine content loading to a shared module

**Files:**

- Create: `src/server/routines/content.ts`
- Modify: `src/server/patient/view.ts` (delete private `loadRoutines`, import the new one; keep
  exported type names `PatientItem`, `PatientBlock`, `PatientRoutine` as aliases), `src/lib/youtube.ts`
- Test: `src/server/routines/content.int.test.ts`, existing `src/server/patient/patient.int.test.ts`
  must stay green.

**Interfaces:**

- Consumes: `Queryable` from `src/server/branding/queries.ts` (`Tx | typeof db`).
- Produces:

```ts
export type ContentItem = ItemPrescription & {
  id: string;
  name: string;
  instructions: string | null;
  sets: SetPrescription[];
  media: { videoId: string; isShort: boolean }[];
};
export type ContentBlock =
  | { kind: "single"; item: ContentItem }
  | { kind: "group"; key: string; restSeconds: number | null; items: ContentItem[] };
export type RoutineContent = {
  id: string;
  name: string;
  notes: string | null;
  sessionsPerWeek: number | null;
  sessionsPerDay: number | null;
  blocks: ContentBlock[];
};
export async function loadRoutineContent(
  q: Queryable,
  physioId: string,
  customerId: string,
  ids: string[],
): Promise<Map<string, RoutineContent>>;
// src/lib/youtube.ts
export function youtubeWatchUrl(videoId: string, isShort: boolean): string;
export function youtubeCoverUrl(videoId: string): string; // i.ytimg.com/vi/<id>/mqdefault.jpg (320×180, true 16:9)
```

- [ ] **Step 1: Failing int test** `src/server/routines/content.int.test.ts`: create physio A and
      B (`createTestPhysio`), customer + exercise with `youtubeId: "dQw4w9WgXcQ"` + routine with items
      `[{exerciseId, group:"g"}, {exerciseId, group:"g"}, {exerciseId}]` for A. Assert:
  - `runAsPhysio(A.claims, (tx, id) => loadRoutineContent(tx, id, customerId, [routineId]))`
    returns one routine with blocks `[group(2 items), single]`, each item `media[0].videoId ===
"dQw4w9WgXcQ"`, 3 sets each.
  - Same call as B with B's id → empty Map (RLS + physio filter).
  - With `db` and A's id but another customer's id → empty Map.
  - `[]` ids → empty Map without querying.
- [ ] **Step 2: Run** `pnpm test:int src/server/routines/content.int.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Move `loadRoutines` from `view.ts` verbatim into `content.ts`
      as `loadRoutineContent`, replacing `db` with the `q` parameter (add `import "server-only";`).
      In `view.ts`: `export type PatientItem = ContentItem; export type PatientBlock = ContentBlock;
export type PatientRoutine = RoutineContent;` and call `loadRoutineContent(db, …)`. Add the two
      youtube helpers (watch URL mirrors `parseYouTubeUrl`'s canonical URL) with unit tests in
      `src/lib/youtube.test.ts`.
- [ ] **Step 4: Run** the new int test, `pnpm test:int src/server/patient` and `pnpm check` → PASS.
- [ ] **Step 5: Commit** `refactor(routines): share routine content loading between patient and export`.

---

### Task 3: Export model (pure)

**Files:**

- Create: `src/server/export/model.ts`
- Test: `src/server/export/model.test.ts`

**Interfaces:**

- Consumes: `RoutineContent`, `ContentItem` (Task 2), `formatPrescription`,
  `PrescriptionTranslate` (`src/lib/prescription.ts`), `youtubeWatchUrl` (Task 2),
  `BrandingContact` (`src/lib/branding.ts`), `shareSlug` (`src/lib/share-links.ts`).
- Produces (no `server-only` import: pure):

```ts
export type ExportFormat = "pdf" | "xlsx";
export type ExportKind = "routine" | "plan" | "customer";
export type ExportPhase = { label: string | null; startsOn: string | null; endsOn: string | null };

export type SourceRoutine = RoutineContent & { phase: ExportPhase | null };
export type SourcePlan = {
  id: string;
  name: string;
  notes: string | null;
  phase: ExportPhase | null;
  entries: { weekday: number; label: string | null; routineId: string }[]; // ordered by weekday, position
};
/** What a loader returns (physio or patient side). */
export type ExportSourceData = {
  customer: { id: string; firstName: string; locale: string };
  /** Routine/plan name; null for "everything active" (the PDF then uses Export.pdf.allTitle). */
  title: string | null;
  plans: SourcePlan[];
  /** Standalone routines (customer export / routine export), in display order. */
  routines: SourceRoutine[];
  /** Content of routines referenced by plan entries but not in `routines`. */
  planRoutines: SourceRoutine[];
};
export type ExportSource = ExportSourceData & {
  kind: ExportKind;
  locale: Locale; // resolved customer locale
  generatedOn: string; // YYYY-MM-DD, physio's today
  branding: { clinicName: string; logoUrl: string | null; contact: BrandingContact | null };
  shareUrl: string | null;
  tracking: boolean;
};

export type SetColumns = {
  count: number;
  reps: string | null;
  duration: string | null;
  load: string | null;
};
export type ExportItem = {
  id: string;
  name: string;
  /** "A1", "A2" inside a superset; null for a single exercise. */
  label: string | null;
  summary: string; // formatPrescription
  columns: SetColumns;
  holdSeconds: number | null;
  restSeconds: number | null;
  side: PrescriptionSide | null;
  notes: string | null;
  instructions: string | null;
  videoId: string | null;
  videoUrl: string | null;
};
export type ExportBlock =
  | { kind: "single"; item: ExportItem }
  | { kind: "group"; label: string; restSeconds: number | null; items: ExportItem[] };
export type ExportRoutine = {
  id: string;
  name: string;
  notes: string | null;
  phase: ExportPhase | null;
  sessionsPerWeek: number | null;
  sessionsPerDay: number | null;
  /** ISO weekdays the routine is scheduled on in the exported plans; [] = any day. */
  weekdays: number[];
  blocks: ExportBlock[];
};
export type ExportWeekDay = {
  weekday: number;
  entries: { label: string | null; routineName: string }[];
};
export type ExportPlan = {
  id: string;
  name: string;
  notes: string | null;
  phase: ExportPhase | null;
  week: ExportWeekDay[]; /* always 7, Mon..Sun */
};
export type ExportDocument = Omit<ExportSource, "plans" | "routines" | "planRoutines"> & {
  plans: ExportPlan[];
  /** Every routine once: plan routines first (first appearance order), then standalone ones. */
  routines: ExportRoutine[];
  isEmpty: boolean;
};

export function setColumns(sets: SetPrescription[]): SetColumns;
export function buildExportDocument(
  source: ExportSource,
  summary: PrescriptionTranslate,
): ExportDocument;
export function exportFilename(
  name: string,
  generatedOn: string,
  format: ExportFormat,
): { ascii: string; utf8: string };
export function contentDisposition(name: string, generatedOn: string, format: ExportFormat): string;
export const EXPORT_CONTENT_TYPES: Record<ExportFormat, string>; // pdf: application/pdf; xlsx: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
```

Rules:

- `setColumns`: `count = sets.length`. Per column, map each set to its value (reps: `"12"` or
  `"8–12"` with an en dash when `repsMax`; duration: seconds as `"30"`; load: the text); when every
  set's value is null → `null`; when all equal → that value; otherwise join with `" / "` using
  `"–"` for a null. Zero sets → `{count:0, reps:null, duration:null, load:null}`.
- Superset labels: groups lettered `A`, `B`, … in order within each routine; items `A1`, `A2`.
- `weekdays`: union of entry weekdays across exported plans for that routine, sorted; `[]` when
  the routine appears in no plan.
- Unknown `routineId` in a plan entry (not in `routines`/`planRoutines`) is dropped silently.
- `isEmpty` = no routine has any item and no plan has any entry.
- `exportFilename("Rodilla – fase 2 ñ", "2026-10-02", "pdf")` →
  `{ ascii: "rodilla-fase-2-n-2026-10-02.pdf", utf8: "Rodilla – fase 2 ñ-2026-10-02.pdf" }`;
  ascii part uses `shareSlug` (falls back to its default slug for empty/emoji-only names).
  `contentDisposition` → `attachment; filename="<ascii>"; filename*=UTF-8''<encodeURIComponent(utf8)>`.

- [ ] **Step 1: Failing tests** `model.test.ts` (use `src/test/routine-fixtures.ts` if it has a
      suitable `ContentItem` maker; otherwise define a local `item(overrides)` helper). Cases:
  - `setColumns([12,12,12 reps])` → `{count:3, reps:"12", duration:null, load:null}`;
    `[12,10,8]` → reps `"12 / 10 / 8"`; `[{reps:8,repsMax:12}]` → `"8–12"`; loads
    `["5 kg", null]` → `"5 kg / –"`; `[]` → zeros/nulls.
  - Plan with Monday + Wednesday entries to routine R and Monday entry to S, plus standalone T:
    `routines` order is `[R, S, T]`, R listed once with `weekdays [1,3]`, T `weekdays []`;
    `plans[0].week` has 7 days, Monday has two entries with labels.
  - Superset of two then a single → blocks `[group "A" items A1,A2, single null-label]`; a second
    group in the same routine is `"B"`.
  - `summary` equals `formatPrescription(item, t)` with a stub `t` (`(k, v) => k + JSON.stringify(v ?? {})`).
  - `videoUrl` from first media (`youtubeWatchUrl`), null without media.
  - `isEmpty` true for a routine with zero items and no plans; false otherwise.
  - Plan entry pointing at a missing routine is dropped.
  - Filename cases above + `"🦵"` → ascii uses the fallback slug; `contentDisposition` string
    exact match.
- [ ] **Step 2: Run** `pnpm vitest run src/server/export/model.test.ts` → FAIL.
- [ ] **Step 3: Implement** `model.ts` per the rules above.
- [ ] **Step 4: Run** → PASS; `pnpm check`.
- [ ] **Step 5: Commit** `feat(export): pure export model builder`.

---

### Task 4: Translations and the `Export` namespace

**Files:**

- Create: `src/server/export/translate.ts`
- Modify: `messages/en.json`, `messages/es.json`
- Test: `src/server/export/translate.test.ts`

**Interfaces:**

- Produces:

```ts
export type ExportKey = /* union of the keys below, e.g. */ "pdf.allTitle" | "pdf.generatedOn" | …;
export type ExportTranslate = (key: ExportKey, values?: Record<string, string | number>) => string;
export async function exportTranslators(locale: Locale): Promise<{ t: ExportTranslate; summary: PrescriptionTranslate }>;
```

Implementation: `const messages = (await import(\`../../../messages/${locale}.json\`)).default;`then`createTranslator({ locale, messages, namespace: "Export" })`and`createTranslator({ locale, messages, namespace: "Prescription" })`, wrapped to the two function
types (same pattern as `src/components/patient/routine-view.tsx:35`). No request context needed,
so route handlers and tests share it.

Keys (en; es in voseo, e.g. "Descargá el PDF", "Escaneá para ver la versión actualizada"):

```json
"Export": {
  "menu": {
    "trigger": "Export",
    "pdf": "Download PDF",
    "xlsx": "Download Excel",
    "tracking": "Include tracking boxes"
  },
  "patient": { "download": "Download PDF" },
  "pdf": {
    "allTitle": "Your exercise program",
    "forCustomer": "For {name}",
    "generatedOn": "Generated {date}",
    "phase": "{label}",
    "dateRange": "{from} – {to}",
    "from": "From {date}",
    "until": "Until {date}",
    "week": "Week overview",
    "restDay": "Rest",
    "superset": "Superset",
    "supersetRest": "Superset · rest {seconds} s between rounds",
    "sessions": "{perWeek, plural, =0 {} one {# session a week} other {# sessions a week}}",
    "notes": "Notes",
    "track": "Tick a box each day you do it",
    "nothing": "Nothing is scheduled right now.",
    "scan": "Scan for the latest version",
    "page": "Page {page} of {total}"
  },
  "xlsx": {
    "overview": "Overview",
    "clinic": "Clinic",
    "customer": "Customer",
    "generated": "Generated",
    "day": "Day",
    "routines": "Routines",
    "standalone": "Routines",
    "columns": {
      "group": "Group", "exercise": "Exercise", "sets": "Sets", "reps": "Reps",
      "hold": "Hold (s)", "duration": "Duration (s)", "rest": "Rest (s)", "load": "Load",
      "side": "Side", "notes": "Notes", "instructions": "Instructions", "video": "Video link"
    }
  }
}
```

Adjust the ICU of `sessions` if `messages.test.ts` rejects the empty `=0` branch (use a plain
`"{count, plural, one {# session a week} other {# sessions a week}}"` and only call it when set).
Side values reuse `Prescription.sides.*` through `summary("sides.left")`.

- [ ] **Step 1: Failing test** `translate.test.ts`: `exportTranslators("es")` → `t("pdf.page",
{page:1,total:3})` contains `"1"` and `"3"` and differs from the en string; `summary("sides.left")`
      is the es side label from `messages/es.json`.
- [ ] **Step 2: Run** → FAIL. **Step 3:** implement + add keys to both files.
- [ ] **Step 4: Run** the test and `pnpm check` (messages parity test) → PASS.
- [ ] **Step 5: Commit** `feat(export): Export messages and translators`.

---

### Task 5: Loaders (physio + patient)

**Files:**

- Create: `src/server/export/queries.ts`, `src/server/patient/export.ts`
- Modify: `src/server/patient/view.ts` (export `linkScopes`)
- Test: `src/server/export/queries.int.test.ts`, `src/server/patient/export.int.test.ts`

**Interfaces:**

- Consumes: `loadRoutineContent` (Task 2), `ExportSourceData`, `SourcePlan`, `SourceRoutine`
  (Task 3), `scheduleFilter` (`src/server/schedule/active.ts`), `ensureShareLink`
  (`src/server/sharing/mutations.ts`), `linkStatus` (`src/server/sharing/view.ts`),
  `buildShareUrl` (`src/lib/share-links.ts`), `env.NEXT_PUBLIC_APP_URL`.
- Produces:

```ts
// src/server/export/queries.ts (server-only)
export async function getRoutineExport(
  tx: Tx,
  physioId: string,
  routineId: string,
): Promise<ExportSourceData | null>;
export async function getPlanExport(
  tx: Tx,
  physioId: string,
  planId: string,
): Promise<ExportSourceData | null>;
export async function getCustomerExport(
  tx: Tx,
  physioId: string,
  customerId: string,
  today: string,
): Promise<ExportSourceData | null>;
/** The customer's live link URL for the QR; creates the link when none ever existed. */
export async function exportShareUrl(
  tx: Tx,
  physioId: string,
  customerId: string,
  now?: Date,
): Promise<string | null>;
// src/server/patient/export.ts (server-only)
export async function getPatientExport(
  shell: Pick<LinkShell, "physioId" | "timeZone">,
  link: Pick<
    ActiveLink,
    "target" | "customerId" | "routineId" | "weeklyPlanId" | "customerFirstName"
  >,
  now?: Date,
): Promise<Omit<ExportSourceData, "customer"> & { today: string }>;
```

Rules:

- All three physio loaders return `null` when the row is missing, not this physio's, a template
  (`customer_id is null`), or the id is not a UUID (`isUuid` from `src/lib/patient-paths.ts`).
  Every query filters `physio_id = physioId` (RLS is the second guard).
- Routine export: that routine whatever its status, `phase` from its `phaseLabel/startsOn/endsOn`
  (null when all three are null), `plans: []`, `planRoutines: []`, `title` = routine name.
- Plan export: plan header + phase; entries ordered by weekday, position, whose routine has the
  same customer and `status <> 'archived'`; `planRoutines` = their content (phase null); `routines: []`;
  `title` = plan name.
- Customer export (everything active on `today`, same rules as a customer share link): standalone
  routines with `scheduleFilter(routines, "active", today)` → `routines` (ordered by name, id, with
  phase); plans with `scheduleFilter(weeklyPlans, "active", today)` → `plans` (ordered name, id),
  entries whose routine is the customer's and `status = 'active'` → `planRoutines`. `title: null`.
- `customer` = `{ id, firstName, locale }` from `customers`.
- `exportShareUrl`: `ensureShareLink(tx, physioId, {target:"customer", customerId})`; when `!ok`
  (archived/not found) → null; when `linkStatus(link, now) !== "active"` → null; else
  `buildShareUrl(env.NEXT_PUBLIC_APP_URL, context.handle, link.slug, link.code)`.
- Patient: `today = todayIn(shell.timeZone, now)`; uses `linkScopes(shell, link, today)` exactly as
  `getPatientView` does, but takes the plan entries of **every** weekday; routines with
  `routineActive`. Content via `loadRoutineContent(db, shell.physioId, link.customerId, ids)`.
  Every `phase` is null (the patient page shows none). `title`: for a routine/plan link the routine
  or plan name, for a customer link null.

- [ ] **Step 1: Failing int tests** (`queries.int.test.ts`), with `NOW` fixed
      (`2026-10-07T10:00:00Z`, a Wednesday) and today `"2026-10-07"`:
  - Routine export as owner → title, items, phase `{label:"Phase 2", startsOn:"2026-10-01", endsOn:null}`.
  - Routine export as physio B, or with a template routine id, or with `"not-a-uuid"` → `null`.
  - Plan export: entries Mon→R1, Wed→R1, Wed→R2(draft); R3 archived on Fri → entries include
    the draft (physio sees it) and exclude archived; `planRoutines` has R1 once.
  - Customer export: active standalone S1, ended standalone S2 (endsOn yesterday), upcoming plan
    P2, active plan P1 with a draft-routine entry → `routines=[S1]`, `plans=[P1]`, draft entry
    excluded.
  - `exportShareUrl`: first call creates a link (`share_links` row count 1) and returns a URL
    containing the handle; after `revokeShareLink` → null; archived customer → null.
  - `patient/export.int.test.ts`: customer link sees all weekdays' entries (Mon and Fri) +
    standalone routines; plan link → only that plan, `routines: []`; routine link → only that
    routine; other customer's routine never appears; every `phase` is null.
- [ ] **Step 2: Run** `pnpm test:int src/server/export src/server/patient/export.int.test.ts` → FAIL.
- [ ] **Step 3: Implement** both modules.
- [ ] **Step 4: Run** → PASS; `pnpm check`.
- [ ] **Step 5: Commit** `feat(export): physio and patient export loaders`.

---

### Task 6: PDF renderer

**Files:**

- Create: `src/server/export/images.ts`, `src/server/export/pdf/document.tsx`,
  `src/server/export/pdf/render.ts`
- Test: `src/server/export/images.test.ts`, `src/server/export/pdf/render.test.tsx`

**Interfaces:**

- Consumes: `ExportDocument` (Task 3), `ExportTranslate` (Task 4), `registerFonts`/`PDF_FONT`
  (Task 1), `qrCode` (`src/lib/qr.ts`), `youtubeCoverUrl` (Task 2), `weekdayName`,
  `CALENDAR_DATE_FORMAT` + `calendarDateToDate` (`src/lib/calendar-date.ts`), `sniffImageType`.
- Produces:

```ts
// images.ts
export async function fetchImageDataUri(
  url: string,
  opts?: { maxBytes?: number; timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<string | null>; // png/jpeg only, null on any failure
export async function loadThumbnails(
  videoIds: string[],
  fetchImpl?: typeof fetch,
): Promise<Map<string, string>>; // parallel, 2 s timeout, 512 KB cap, LRU cache of 200
// render.ts
export type PdfDeps = { fetchImpl?: typeof fetch };
export async function renderExportPdf(
  doc: ExportDocument,
  t: ExportTranslate,
  deps?: PdfDeps,
): Promise<Buffer>;
```

Layout (`document.tsx`, react-pdf primitives `Document/Page/View/Text/Image/Svg/Path`,
`StyleSheet.create`, `fontFamily: PDF_FONT`, base size 10 pt, page padding 32 pt top/sides and
96 pt bottom for the footer):

1. **Header** (first page): logo (≤ 40 pt high, `objectFit: "contain"`) or nothing; clinic name
   bold; contact line (email · phone · website) when `branding.contact`; right side:
   `t("pdf.forCustomer", {name})`, `t("pdf.generatedOn", {date})`. Title (`doc.title ??
t("pdf.allTitle")`) 18 pt bold. A 1 pt accent-free rule `#d4d4d4`.
2. **Plans**: per plan, name + phase line + notes, then the week table: 7 rows (weekday long name
   in the doc locale; entries `"Morning · Knee rehab"` joined by line breaks, or
   `t("pdf.restDay")` muted).
3. **Routines**: per routine (`break` before each routine except the first when a plan was
   shown): name 14 pt bold, phase line (`phase.label`, date range formatted with
   `Intl.DateTimeFormat(doc.locale, CALENDAR_DATE_FORMAT)`), sessions line, notes. When
   `doc.tracking`, a header row of weekday initials (`weekdayName(locale, d, "narrow")` — add
   `"narrow"` to `weekdayName`'s style union) right-aligned above the item rows.
   Each item row is `wrap={false}`: thumbnail 80×45 pt (data URI from `loadThumbnails`; a grey
   `#f5f5f5` box when missing), then name (bold, prefixed by label "A1"), summary, notes (italic
   secondary), instructions (secondary, truncated to 280 chars with "…"); when tracking, 7 boxes
   10×10 pt with 1 pt `#525252` border — only on `routine.weekdays` days when non-empty
   (other days blank), all 7 otherwise. Groups get a left border 2 pt `#a3a3a3` and a caption
   `t("pdf.superset")` / `t("pdf.supersetRest", {seconds})`.
4. **Empty**: `doc.isEmpty` → a single `t("pdf.nothing")` paragraph after the header.
5. **Footer** (`fixed`, absolute bottom 24 pt): when `shareUrl`, QR 56×56 pt (`<Svg
viewBox={\`0 0 ${size} ${size}\`}><Path d={path} fill="#000"/></Svg>`from`qrCode`) + 
`t("pdf.scan")`+ the URL without`https://`; right: `render={({pageNumber, totalPages}) =>
   t("pdf.page", {page: pageNumber, total: totalPages})}`.

`renderExportPdf`: `registerFonts()`; collect unique first `videoId`s; `Promise.all([
loadThumbnails(ids, fetchImpl), fetchImageDataUri(doc.branding.logoUrl, {maxBytes: LOGO_MAX_BYTES,
fetchImpl})])`; `renderToBuffer(<ExportPdf … />)`. Set `<Document title={…} author={clinicName}
language={locale}>`. `size="A4"`.

- [ ] **Step 1: Failing tests.** `images.test.ts` (node env): stub fetch returning a tiny valid
      JPEG (`Buffer.from("/9j/4AAQSkZJRgABAQ...","base64")` — generate one with any 1×1 JPEG base64)
      → data URI starts `data:image/jpeg;base64,`; 404 → null; `text/html` body → null; thrown
      `AbortError` → null; oversize `content-length` → null; `loadThumbnails(["a","a","b"])` calls
      fetch twice (dedupe) and the URL is `youtubeCoverUrl(id)`.
      `render.test.tsx` (node env), using `exportTranslators("en")` and a fixture `ExportDocument`
      built with `buildExportDocument`:
  - 10 exercises, each with a video, fetch stub returning a 15 KB JPEG fixture (read
    `src/server/export/__fixtures__/thumb.jpg`; create it once with any 320×180 JPEG ≤ 20 KB,
    e.g. `curl -o … https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg`) → buffer starts `%PDF`,
    `length < 2 * 1024 * 1024`, elapsed `< 3000` ms.
  - Same doc with fetch rejecting everything → still `%PDF` (Review Focus 2).
  - 25 exercises with 1 000-char instructions, tracking on, plan + superset, es locale with
    `"Rodilla – fase 2 ñ"` → renders; `(buffer.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length > 1`.
  - `isEmpty` doc (no routines, no plans), `shareUrl: null`, `logoUrl: null` → renders.
- [ ] **Step 2: Run** → FAIL. **Step 3:** implement. **Step 4:** run → PASS; `pnpm check`.
- [ ] **Step 5: Manual look.** Write one sample to the scratchpad from a throwaway script or
      `it.skip`'d test and open it (`open file.pdf`) to eyeball layout in Preview; do not commit the
      output.
- [ ] **Step 6: Commit** `feat(export): branded PDF renderer`.

---

### Task 7: Excel renderer

**Files:**

- Create: `src/server/export/xlsx.ts`
- Test: `src/server/export/xlsx.test.ts`

**Interfaces:**

- Consumes: `ExportDocument` (Task 3), `ExportTranslate`, `PrescriptionTranslate` (Task 4).
- Produces:

```ts
export function sheetNames(names: string[], reserved?: string[]): string[]; // valid (≤31 chars, no []:*?/\, not blank, no leading/trailing '), unique case-insensitively ("Knee", "Knee (2)")
export async function renderExportXlsx(
  doc: ExportDocument,
  t: ExportTranslate,
  summary: PrescriptionTranslate,
): Promise<Buffer>;
```

Workbook (`new ExcelJS.Workbook()`, `creator = clinicName`):

- **Overview** sheet (`t("xlsx.overview")`) when `doc.plans.length > 0` or more than one routine:
  rows 1–3 header block (`Clinic | <clinicName>`, `Customer | <firstName>`, `Generated |
<formatted date>`), blank row, then per plan: plan name (bold), then `Day | Routines` rows for
  Mon..Sun (entries joined `"; "`, label prefix `"Morning: "`); then, when there are standalone
  routines, a `t("xlsx.standalone")` heading listing their names.
- **One sheet per routine** (`sheetNames` over routine names, reserved = overview name): the same
  3-row header block + routine name in row 4 (bold), headers in row 6, one row per item in block
  order: Group (`item.label ?? ""`), Exercise, Sets (`columns.count` as number), Reps, Hold,
  Duration, Rest (numbers when single-valued and numeric, else text), Load, Side
  (`summary(\`sides.${side}\`)`), Notes, Instructions (full, `wrapText`), Video link (hyperlink
cell `{ text: url, hyperlink: url }`). `views = [{ state: "frozen", ySplit: 6 }]`; column widths
`[8, 32, 6, 14, 8, 12, 8, 14, 12, 30, 60, 44]`; header row bold with bottom border.
- Return `Buffer.from(await workbook.xlsx.writeBuffer())`.

- [ ] **Step 1: Failing tests** (node env): `sheetNames(["Knee/hip [A]", "knee/hip [a]",
"x".repeat(40), "", "Overview"], ["Overview"])` → `["Knee hip A", "knee hip a (2)", 31 x's,
<non-empty fallback>, "Overview (2)"]` (exact sanitiser: replace each forbidden char with a
      space, collapse spaces, trim, trim `'`, truncate leaving room for the suffix). Round trip:
      render a plan doc with two routines named `"Rodilla – fase 2 ñ"` and `"Rodilla – fase 2 ñ"`
      (duplicate) and a superset, then `new ExcelJS.Workbook().xlsx.load(buffer)`: sheet names are
      `["Overview", "Rodilla – fase 2 ñ", "Rodilla – fase 2 ñ (2)"]`, header row 6 matches the
      translated columns, A1/A2 labels present, `views[0].ySplit === 6`, video cell has a hyperlink,
      reps `"12 / 10 / 8"`. Empty doc → workbook with Overview or one routine sheet with headers only,
      no throw.
- [ ] **Step 2: Run** → FAIL. **Step 3:** implement. **Step 4:** run → PASS; `pnpm check`.
- [ ] **Step 5: Commit** `feat(export): Excel workbook renderer`.

---

### Task 8: Physio export route handlers

**Files:**

- Create: `src/server/export/respond.ts`, `src/server/export/physio.ts`,
  `src/app/api/export/routines/[id]/route.ts`, `src/app/api/export/plans/[id]/route.ts`,
  `src/app/api/export/customers/[id]/route.ts`
- Test: `src/server/export/respond.test.ts`, `src/server/export/physio.int.test.ts`

**Interfaces:**

- Consumes: everything above; `getSessionPhysio` (`src/server/auth/session.ts`), `runAsPhysio`,
  `physioToday`, `getBranding`, `resolveLocale`.
- Produces:

```ts
// respond.ts (pure)
export function parseExportQuery(url: URL): { format: ExportFormat; tracking: boolean } | null; // format required (pdf|xlsx); tracking "0" → false, absent/"1" → true; anything else null
export function fileResponse(
  body: Buffer,
  format: ExportFormat,
  name: string,
  generatedOn: string,
  extraHeaders?: Record<string, string>,
): Response; // Content-Type, Content-Disposition, Cache-Control: private, no-store, Content-Length
// physio.ts (server-only)
export async function exportForPhysio(
  kind: ExportKind,
  id: string,
  url: URL,
  now?: Date,
): Promise<Response>;
```

`exportForPhysio`:

1. `parseExportQuery` → 400 (`no-store`) when null.
2. `getSessionPhysio()` → 401 when null (no redirect: this is a file endpoint).
3. In **one** `runAsPhysio(session.claims, …)`: `today = physioToday`, load by kind, null → 404;
   `branding = getBranding(tx, physioId)`; `shareUrl = exportShareUrl(tx, physioId,
data.customer.id, now)`.
4. `locale = resolveLocale(data.customer.locale)`; `{t, summary} = exportTranslators(locale)`;
   `doc = buildExportDocument({...data, kind, locale, generatedOn: today, branding: {clinicName,
logoUrl, contact}, shareUrl, tracking}, summary)`.
5. Render (outside the transaction) by format; `fileResponse(body, format, data.title ??
data.customer.firstName, today)`.

Route file (same shape for all three; `runtime = "nodejs"`):

```ts
import { exportForPhysio } from "@/server/export/physio";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: RouteContext<"/api/export/routines/[id]">) {
  const { id } = await params;
  return exportForPhysio("routine", id, new URL(request.url));
}
```

- [ ] **Step 1: Failing unit tests** `respond.test.ts`: `?format=pdf` → `{pdf, true}`;
      `?format=xlsx&tracking=0` → `{xlsx, false}`; `?format=doc` / missing → null; `tracking=yes` →
      null. `fileResponse` headers exact (`Content-Type` per format, disposition from
      `contentDisposition`, `Cache-Control: private, no-store`).
- [ ] **Step 2: Failing int tests** `physio.int.test.ts`: `vi.mock("@/server/auth/session", () =>
({ getSessionPhysio: vi.fn() }))` and set its resolved value per test to
      `{ physioId: physio.id, claims: physio.claims }` (or null). Cases: no session → 401; owner
      routine pdf → 200, `application/pdf`, body starts `%PDF`, disposition contains the slugified
      routine name; owner plan xlsx → 200 + xlsx content type, body starts with `PK`; customer pdf
      with nothing active → 200; physio B with A's routine id → 404; template routine → 404;
      `"nope"` id → 404; `format=doc` → 400; first customer export creates the customer share link
      (row count) — a revoked link is not recreated. Stub `global.fetch` (thumbnails) with `vi.spyOn`
      returning 404 so tests never hit the network.
- [ ] **Step 3: Run** both → FAIL. **Step 4:** implement. **Step 5:** run → PASS; `pnpm check`.
- [ ] **Step 6: Commit** `feat(export): physio export endpoints`.

---

### Task 9: Patient download route

**Files:**

- Create: `src/server/patient/download.ts`, `src/app/(patient)/[handle]/[slug]/download/route.ts`
- Test: `src/server/patient/download.int.test.ts`

**Interfaces:**

- Consumes: `parseSlugParam`, `buildSharePath`, `buildShareUrl`, `loadLink`/`resolveLink`,
  `getLinkAccess` (`src/server/patient/access.ts`), `getPatientExport` (Task 5), `getBranding`
  is unnecessary (use `shell.branding`), `PATIENT_HEADERS`, renderers, `fileResponse`.
- Produces:

```ts
export async function exportForPatient(
  params: { handle: string; slug: string },
  now?: Date,
): Promise<Response>;
```

Behaviour (mirrors `page.tsx`):

1. `parseSlugParam(slug)` null → 404; `resolveLink(code, now)` `not_found` → 404 (both with
   `PATIENT_HEADERS`).
2. Canonical path `buildSharePath(shell.handle, shell.slug, shell.code)`; when the decoded handle
   or slug differs → `308` to `${path}/download`.
3. `unavailable` → `303` to the page path (it shows the Unavailable screen).
4. `getLinkAccess(shell, link)`; `!unlocked` → `303` to the page path (it shows the PIN gate).
5. `data = getPatientExport(shell, link, now)`; `{t, summary} = exportTranslators(shell.locale)`;
   doc with `kind` = `"customer" | "routine" | "plan"` from `link.target`
   (`weekly_plan` → `"plan"`), `customer: {id: link.customerId, firstName: link.customerFirstName,
locale: shell.locale}`, `branding: shell.branding`, `shareUrl = buildShareUrl(env.NEXT_PUBLIC_APP_URL,
shell.handle, shell.slug, shell.code)`, `tracking: true`, `generatedOn: data.today`.
6. PDF only; `fileResponse(body, "pdf", data.title ?? link.customerFirstName, data.today,
PATIENT_HEADERS)` (PATIENT_HEADERS' `Cache-Control` equals ours). Do **not** `touchLink`.

Route:

```ts
import { exportForPatient } from "@/server/patient/download";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: RouteContext<"/[handle]/[slug]/download">,
) {
  return exportForPatient(await params);
}
```

- [ ] **Step 1: Failing int tests**: `vi.mock("@/server/patient/access", () => ({ getLinkAccess:
vi.fn() }))` (default `{owner:false, unlocked:true}`), stub fetch → 404. Cases: customer link →
      200 pdf with `X-Robots-Tag` + `Referrer-Policy` headers; stale slug → 308 to canonical
      `/download`; revoked link → 303 to the page path; locked (`unlocked:false`) → 303; unknown code
      → 404; bad slug → 404.
- [ ] **Step 2: Run** → FAIL. **Step 3:** implement. **Step 4:** run → PASS; `pnpm check`.
- [ ] **Step 5: Commit** `feat(export): patient PDF download`.

---

### Task 10: Export menu and patient download link

**Files:**

- Create: `src/components/export/export-menu.tsx`
- Modify: `src/app/(app)/routines/[routineId]/page.tsx`, `src/app/(app)/plans/[planId]/page.tsx`,
  `src/components/customers/customer-header.tsx`, `src/components/patient/patient-home.tsx`
- Test: `src/components/export/export-menu.test.tsx`, existing patient-home test if present

**Interfaces:**

- Consumes: `Export.menu.*`, `Export.patient.download` (Task 4).
- Produces:

```tsx
export function ExportMenu({
  target,
}: {
  target: { kind: "routines" | "plans" | "customers"; id: string };
}): JSX.Element;
```

Behaviour: `"use client"`. `DropdownMenu` with trigger `<Button variant="outline"><DownloadIcon
aria-hidden />{t("trigger")}</Button>`; content: `DropdownMenuItem asChild` → `<a href={pdfHref}
download>` (`t("pdf")`), same for xlsx; `DropdownMenuSeparator`; `DropdownMenuCheckboxItem
checked={tracking} onCheckedChange={(v) => setTracking(v === true)} onSelect={(e) =>
e.preventDefault()}` (keeps the menu open) labelled `t("tracking")`. Hrefs:
`/api/export/${kind}/${id}?format=pdf${tracking ? "" : "&tracking=0"}` and `?format=xlsx`
(tracking irrelevant to xlsx). Use plain `<a>` (not `next/link`): a file download.

Placement:

- Routine page: next to `ShareButton` (same `!routine.isTemplate` condition), wrapped in
  `<div className="flex flex-wrap gap-2">`.
- Plan page: next to `ShareButton` when `plan.customerId`.
- Customer header: inside `CustomerArchiveButton` children, before `ShareButton`, for every
  customer (archived customers can still be exported; the PDF has no QR).
- Patient home: under the `<h1>`, when not `nothing`: `<Button asChild variant="outline"
size="sm"><a href={\`${path}/download\`} download><DownloadIcon aria-hidden />{tE("download")}</a></Button>`with`tE = getTranslations({ locale, namespace: "Export.patient" })`. Check how `Button`is
imported in other patient components (server component;`Button` is fine there).

- [ ] **Step 1: Failing component test** (Testing Library + `NextIntlClientProvider` with
      `messages/en.json`, follow an existing component test's provider setup): open the menu
      (`userEvent.click(trigger)`), the PDF item's `href` is `/api/export/routines/r1?format=pdf`;
      toggle the checkbox → menu stays open and the PDF href ends with `&tracking=0`; xlsx href is
      `?format=xlsx`.
- [ ] **Step 2: Run** → FAIL. **Step 3:** implement + place. **Step 4:** run → PASS; `pnpm check`.
- [ ] **Step 5: Commit** `feat(export): export menu and patient download button`.

---

### Task 11: End-to-end

**Files:**

- Create: `e2e/export.spec.ts`

Use `test`/`expect` from `e2e/helpers/auth.ts` (`physio`, `physioPage` fixtures) and the raw-SQL
helpers in `e2e/helpers/patient.ts` (`insertCustomer`, `insertRoutine`, `insertPlan`,
`insertCustomerLink`, `isoWeekdayIn`). Block thumbnail requests are server-side, so nothing to
route in the browser. Cases:

1. Routine page: `physioPage.goto(\`/routines/${routineId}\`)`, click "Export", then
`const download = page.waitForEvent("download"); await page.getByRole("menuitem", { name:
   "Download PDF" }).click();`→`(await download).suggestedFilename()`matches`/\.pdf$/`; read
the file (`await (await download).path()`) and assert it starts with `%PDF`. Same for "Download
Excel" → `.xlsx`, starts with `PK`.
2. Plan page → "Download PDF" works.
3. Customer page → "Download Excel" works.
4. Patient: customer link without PIN → open path, click "Download PDF" → `.pdf` download.
5. Patient with PIN: `request.get(\`${path}/download\`, { maxRedirects: 0 })` → 303; after
   entering the PIN in the page, the download button works.

Run: `pnpm test:e2e e2e/export.spec.ts` (both desktop and mobile projects). If downloads behave
differently on the mobile project, assert via `page.request.get(href)` there instead and note it.

- [ ] **Step 1: Write the spec.** **Step 2: Run** → it should pass against the finished feature;
      if it fails, debug with `superpowers:systematic-debugging`.
- [ ] **Step 3: Commit** `test(export): e2e downloads for physio and patient`.

---

### Task 12: Docs and status (controller does this)

- Spec 14: Status `Done`, tick acceptance criteria, fill "Decisions made during implementation"
  (shared `loadRoutineContent`; `mqdefault` thumbnails instead of `sharp`; first name only in
  headers; physio plan export includes draft routines, patient/customer export only active ones;
  patient download redirects 303 to the page when locked/unavailable; any deviation found while
  building).
- `docs/specs/README.md`: row 14 → Done.
- Commit `docs(spec-14): mark done`.
