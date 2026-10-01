# Visit Notes Implementation Plan

**Goal:** A physio records SOAP visit notes per customer (date, optional case, pain 0–10), sees
them on the customer's **Notes** tab as a filterable timeline (newest 20, "Load more"), edits and
deletes them, and never exposes them to patients or exports.

**Architecture:** One table `visit_notes` with composite `(physio_id, …)` FKs and RLS. Pure
helpers in `src/lib/visit-notes.ts` (limits, excerpt, "edited" rule, draft keys, params). Server
layer `src/server/visit-notes/{schemas,queries,mutations,actions}.ts` following
`src/server/customers/*`. Components in `src/components/visit-notes/`. The customer page renders
the Notes tab; the overview gets a "latest note" card.

**Spec:** `docs/specs/16-visit-notes.md` (answers recorded there). Patterns to copy:
`docs/plans/06-weekly-plans.md`, `src/db/schema/customers.ts`, `src/server/customers/*`,
`src/components/customers/case-sheet.tsx`.

## Global Constraints

RLS + `set_updated_at` trigger, composite FKs, queries filter by `physio_id` inside `withPhysio`,
every string in every `messages/*.json`, shadcn primitives only (`Select` via
`toSelectValue`/`fromSelectValue`), design tokens only, no functions across the server/client
boundary, expand-only migration, test-first, `pnpm check` green per commit.

## Tasks

1. **Pure helpers** (`src/lib/visit-notes.ts` + tests): `SOAP_FIELDS`, `SOAP_MAX = 10_000`,
   `PAGE_SIZE = 20`, `excerpt(text, maxChars)`, `wasEdited(createdAt, updatedAt)` (> 1 minute),
   `draftKey(customerId, noteId | null)`, `parseNotesParams` (`?case=`, `?notes=`).
2. **Schema + migrations**: `src/db/schema/visit-notes.ts`, `pnpm db:generate`, extras migration
   (trigger, case FK with `ON DELETE SET NULL (case_id)`, check "at least one SOAP field").
3. **Server schemas** (+ tests): `visitNoteSchema` (trim, blank → null, ≤ 10 000, pain 0–10,
   valid date, at least one SOAP field).
4. **Queries + mutations** with integration tests: CRUD, RLS both ways, cross-customer case
   rejected, case delete nulls `case_id`, `updated_at` trigger, filter and pagination, latest note.
5. **Actions** (thin) + unit tests with mocked `withPhysio`.
6. **Components**: timeline + note card (expand, edited, delete confirm), editor sheet with
   auto-growing S/O/A/P textareas, localStorage drafts, `N` and `Cmd/Ctrl+Enter` shortcuts,
   case filter, overview "latest note" card.
7. **i18n**: `VisitNotes` namespace in `en` and `es` (Rioplatense).
8. **Patient boundary test**: nothing under `src/server/patient/` or export routes references
   visit notes.
9. **E2E** (`e2e/visit-notes.spec.ts`, desktop + mobile).
10. **Docs**: spec Status and decisions, README index; verification and self-review.
