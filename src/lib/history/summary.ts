import { z } from "zod";
import type { PlanDiff, RoutineDiff } from "./diff";

/** Stored in the version's `summary` jsonb column; the UI renders it with next-intl. */
export const changeSummarySchema = z.object({
  added: z.number().int(),
  removed: z.number().int(),
  moved: z.number().int(),
  changed: z.number().int(),
  /** Field -> number of items/entries where it changed. */
  fields: z.record(z.string(), z.number().int()),
  /** Header fields that changed. */
  header: z.array(z.string()),
});
export type ChangeSummary = z.infer<typeof changeSummarySchema>;

type Row = {
  status: "added" | "removed" | "changed" | "unchanged";
  moved: boolean;
  changes: { field: string }[];
  sets?: { kind: string; changes?: { field: string }[] }[];
};

function summarize(header: { field: string }[], rows: Row[]): ChangeSummary {
  const summary: ChangeSummary = {
    added: 0,
    removed: 0,
    moved: 0,
    changed: 0,
    fields: {},
    header: header.map((change) => change.field),
  };
  for (const row of rows) {
    if (row.status === "added") summary.added++;
    else if (row.status === "removed") summary.removed++;
    else if (row.status === "changed") summary.changed++;
    if (row.moved) summary.moved++;
    // A per-set field counts once per item.
    const fields = new Set(row.changes.map((change) => change.field));
    for (const set of row.sets ?? []) {
      for (const change of set.changes ?? []) fields.add(change.field);
    }
    for (const field of fields) summary.fields[field] = (summary.fields[field] ?? 0) + 1;
  }
  return summary;
}

export const summarizeRoutine = (diff: RoutineDiff): ChangeSummary =>
  summarize(diff.header, diff.items);
export const summarizePlan = (diff: PlanDiff): ChangeSummary =>
  summarize(diff.header, diff.entries);

export const isEmptySummary = (s: ChangeSummary): boolean =>
  s.added === 0 &&
  s.removed === 0 &&
  s.moved === 0 &&
  s.changed === 0 &&
  s.header.length === 0 &&
  Object.keys(s.fields).length === 0;
