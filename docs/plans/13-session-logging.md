# Plan 13 · Session logging and dashboard

Spec: [`../specs/13-session-logging-and-dashboard.md`](../specs/13-session-logging-and-dashboard.md).
Built test-first, in this order (each step ends green on `pnpm check`).

1. **Pure logic** (`src/lib/`): `session-logs.ts` (zod input, limits, log window, `dateForWeekday`),
   `adherence.ts` (planned vs completed, heatmap cells, pain series), `attention.ts` (rules).
2. **Schema**: `src/db/schema/session-logs.ts` (+ enums test, schema index), `pnpm db:generate`, a
   custom migration for `set_updated_at` and the `share_link_id` `SET NULL (col)` FK.
3. **Patient write path**: `src/server/patient/view.ts` scopes parameterised by date,
   `log-session.ts` (reachability, window, upsert), `logSessionAction`, patient log reads for the
   page and the workout page.
4. **Patient UI**: log sheet, routine card button, week-strip checks, workout finish hand-off,
   `Patient.logging` messages in both locales.
5. **Physio read path**: `src/server/activity/` (customer activity, dashboard, mark seen).
6. **Physio UI**: `chart` primitive (recharts), heatmap, pain chart, comments feed, Activity tab,
   dashboard.
7. **Verify**: integration tests (upsert, reachability, window, RLS), e2e, `pnpm check`, review,
   spec Status and README index.
