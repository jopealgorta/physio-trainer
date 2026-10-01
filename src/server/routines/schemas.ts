import { z } from "zod";

import { itemShape, setSchema } from "@/lib/prescription";
import type { SaveGroup, SaveItem } from "@/lib/routine-editor";
import { validateStructure } from "@/lib/routine-structure";
import {
  MAX_ITEMS,
  MAX_SETS,
  ROUTINE_NAME_MAX,
  ROUTINE_NOTES_MAX,
  ROUTINE_STATUSES,
  SESSIONS_PER_DAY,
  SESSIONS_PER_WEEK,
  type RoutineStatus,
} from "@/lib/routines";

/** Plans named by a `blockedByPlans` failure (spec 06 rule: archiving is blocked while they use it). */
export type PlanRef = { id: string; name: string };

/** Mutation/action result. Errors are i18n keys; `plans` accompanies `blockedByPlans`. */
export type Result<T, E extends string> =
  { ok: true; data: T } | { ok: false; error: E; plans?: PlanRef[] };

export const idSchema = z.uuid();

/** Cheap guard so malformed ids never reach a uuid comparison (Postgres would raise 22P02). */
export const isUuid = (value: string): boolean => idSchema.safeParse(value).success;

const blankToNull = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : value;
  return text === "" || text == null ? null : text;
};

const requiredName = z.preprocess(
  (value) => value ?? "",
  z.string().trim().min(1, "nameRequired").max(ROUTINE_NAME_MAX, "nameTooLong"),
);

const notes = z
  .preprocess((value) => value ?? "", z.string())
  .transform((value) => value.trim())
  .pipe(z.string().max(ROUTINE_NOTES_MAX, "notesTooLong"))
  .transform((value) => value || null);

const caseId = z.preprocess(blankToNull, z.union([z.null(), z.uuid()], { error: "invalid" }));

const sessions = ({ min, max }: { min: number; max: number }) =>
  z.preprocess(
    blankToNull,
    z.union(
      [
        z.null(),
        z.coerce
          .number({ error: "outOfRange" })
          .int("outOfRange")
          .min(min, "outOfRange")
          .max(max, "outOfRange"),
      ],
      { error: "outOfRange" },
    ),
  );

export const createRoutineSchema = z.object({
  customerId: z.uuid(),
  name: requiredName,
  caseId,
});
export type CreateRoutineInput = { customerId: string; name: string; caseId: string | null };

const groupKey = z.string().min(1).max(64);

const saveItemSchema = z.object({
  exerciseId: z.uuid(),
  groupKey: groupKey.nullable(),
  sets: z.array(setSchema).max(MAX_SETS),
  ...itemShape,
});

const saveGroupSchema = z.object({ key: groupKey, restSeconds: itemShape.restSeconds });

export const saveRoutineSchema = z
  .object({
    id: z.uuid(),
    version: z.number().int().min(1),
    name: requiredName,
    notes,
    caseId,
    sessionsPerWeek: sessions(SESSIONS_PER_WEEK),
    sessionsPerDay: sessions(SESSIONS_PER_DAY),
    status: z.enum(ROUTINE_STATUSES),
    groups: z.array(saveGroupSchema).max(MAX_ITEMS),
    items: z.array(saveItemSchema).max(MAX_ITEMS),
  })
  .superRefine((value, ctx) => {
    const issues = validateStructure(
      value.groups,
      value.items.map((item) => ({
        groupKey: item.groupKey,
        restSeconds: item.restSeconds,
        setCount: item.sets.length,
      })),
    );
    for (const message of issues) ctx.addIssue({ code: "custom", path: ["items"], message });
  });

export type SaveRoutineInput = {
  id: string;
  version: number;
  name: string;
  notes: string | null;
  caseId: string | null;
  sessionsPerWeek: number | null;
  sessionsPerDay: number | null;
  status: RoutineStatus;
  groups: SaveGroup[];
  items: SaveItem[];
};

export type SaveRoutineError =
  "notFound" | "conflict" | "caseNotFound" | "exerciseNotFound" | "needsItems" | "blockedByPlans";
export type CreateRoutineError = "customerNotFound" | "caseNotFound";

// Compile-time guard: the parsed output must match the published input types.
type Assert<T extends true> = T;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export type _SaveInputMatches = Assert<Same<z.output<typeof saveRoutineSchema>, SaveRoutineInput>>;
export type _CreateInputMatches = Assert<
  Same<z.output<typeof createRoutineSchema>, CreateRoutineInput>
>;
