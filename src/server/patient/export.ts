import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { routines, weeklyPlanEntries, weeklyPlans } from "@/db/schema";
import { todayIn } from "@/lib/calendar-date";
import type { ExportSourceData, SourcePlan, SourceRoutine } from "@/server/export/model";
import { loadRoutineContent } from "@/server/routines/content";
import { scheduleFilter } from "@/server/schedule/active";

import type { ActiveLink, LinkShell } from "./resolve-link";
import { linkScopes } from "./view";

export type PatientExportData = Omit<ExportSourceData, "customer"> & { today: string };

/**
 * What a patient downloads from their link (spec 14): exactly what the page shows, but the plan
 * entries of every weekday rather than one. Every id comes from the resolved link. No phases: the
 * patient page shows none.
 */
export async function getPatientExport(
  shell: Pick<LinkShell, "physioId" | "timeZone">,
  link: Pick<
    ActiveLink,
    "target" | "customerId" | "routineId" | "weeklyPlanId" | "customerFirstName"
  >,
  now: Date = new Date(),
): Promise<PatientExportData> {
  const today = todayIn(shell.timeZone, now);
  const { planScope, routineScope, routineActive } = linkScopes(shell, link, today);

  const [planRows, routineRows, titleRows] = await Promise.all([
    link.target === "routine"
      ? []
      : db
          .select({ id: weeklyPlans.id, name: weeklyPlans.name, notes: weeklyPlans.notes })
          .from(weeklyPlans)
          .where(planScope(scheduleFilter(weeklyPlans, "active", today)))
          .orderBy(asc(weeklyPlans.name), asc(weeklyPlans.id)),
    link.target === "weekly_plan"
      ? []
      : db
          .select({ id: routines.id })
          .from(routines)
          .where(routineScope(routineActive))
          .orderBy(asc(routines.name), asc(routines.id)),
    // The shared routine's or plan's name, whatever its state (like the link preview's title).
    link.target === "routine"
      ? db.select({ name: routines.name }).from(routines).where(routineScope(undefined))
      : link.target === "weekly_plan"
        ? db.select({ name: weeklyPlans.name }).from(weeklyPlans).where(planScope(undefined))
        : [],
  ]);

  const entryRows = planRows.length
    ? await db
        .select({
          planId: weeklyPlanEntries.weeklyPlanId,
          weekday: weeklyPlanEntries.weekday,
          label: weeklyPlanEntries.label,
          routineId: weeklyPlanEntries.routineId,
        })
        .from(weeklyPlanEntries)
        .innerJoin(
          routines,
          and(
            eq(routines.physioId, weeklyPlanEntries.physioId),
            eq(routines.id, weeklyPlanEntries.routineId),
          ),
        )
        .where(
          and(
            eq(weeklyPlanEntries.physioId, shell.physioId),
            inArray(
              weeklyPlanEntries.weeklyPlanId,
              planRows.map((plan) => plan.id),
            ),
            // The same rule as the page: the customer's own, finished routines only.
            eq(routines.customerId, link.customerId),
            eq(routines.status, "active"),
          ),
        )
        .orderBy(asc(weeklyPlanEntries.weekday), asc(weeklyPlanEntries.position))
    : [];

  const routineIds = routineRows.map((row) => row.id);
  const planRoutineIds = [...new Set(entryRows.map((entry) => entry.routineId))].filter(
    (id) => !routineIds.includes(id),
  );
  const content = await loadRoutineContent(db, shell.physioId, link.customerId, [
    ...routineIds,
    ...planRoutineIds,
  ]);
  const source = (id: string): SourceRoutine[] => {
    const routine = content.get(id);
    return routine ? [{ ...routine, phase: null }] : [];
  };

  const plans = planRows.map((plan): SourcePlan => ({
    ...plan,
    phase: null,
    entries: entryRows
      .filter((entry) => entry.planId === plan.id && content.has(entry.routineId))
      .map(({ weekday, label, routineId }) => ({ weekday, label, routineId })),
  }));

  return {
    today,
    title: titleRows[0]?.name ?? null,
    plans,
    routines: routineIds.flatMap(source),
    planRoutines: planRoutineIds.flatMap(source),
  };
}
