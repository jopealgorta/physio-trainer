import { z } from "zod";

import type { VersionKind } from "@/lib/history/snapshot";
import type { ChangeSummary } from "@/lib/history/summary";

export type { Result } from "@/server/routines/schemas";

/** A routine or a weekly plan whose history is read or restored (spec 15). */
export const historyTargetSchema = z.object({ kind: z.enum(["routine", "plan"]), id: z.uuid() });
export type HistoryTarget = z.infer<typeof historyTargetSchema>;

/** One or two versions: one to show, two to compare. */
export const versionsRequestSchema = historyTargetSchema.extend({
  versions: z.array(z.number().int().min(1)).min(1).max(2),
});

export const restoreSchema = historyTargetSchema.extend({ version: z.number().int().min(1) });

/** A row of the history list. */
export type VersionMeta = {
  version: number;
  kind: VersionKind;
  restoredFrom: number | null;
  summary: ChangeSummary | null;
  /** ISO timestamp: when a routine version was saved, or a plan version last updated. */
  at: string;
};

export type RestoreError =
  "notFound" | "versionNotFound" | "needsItems" | "needsEntries" | "conflict" | "invalid";
