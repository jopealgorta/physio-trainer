import { ArrowLeftIcon } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { RoutineEditor } from "@/components/routines/routine-editor";
import { customerName } from "@/lib/customers";
import { DEFAULT_LIBRARY_FILTERS } from "@/lib/library-params";
import { fromLoaded } from "@/lib/routine-editor";
import { firstParam } from "@/lib/search-params";
import { withPhysio } from "@/server/auth/session";
import { listCategoryTree, listExercises } from "@/server/library/queries";
import { idSchema } from "@/server/routines/schemas";
import { loadRoutine } from "@/server/routines/load";
import { listRecentExercises } from "@/server/routines/queries";

/** Exercises shown in the picker before the physio searches. */
const PICKER_INITIAL_LIMIT = 60;

export async function generateMetadata({
  params,
}: PageProps<"/routines/[routineId]">): Promise<Metadata> {
  const { routineId } = await params;
  const routine = await loadRoutine(routineId);
  return { title: routine?.name };
}

export default async function RoutinePage({
  params,
  searchParams,
}: PageProps<"/routines/[routineId]">) {
  const [{ routineId }, sp] = await Promise.all([params, searchParams]);
  const routine = await loadRoutine(routineId);
  if (!routine) notFound();
  const t = await getTranslations("Routines.editor");

  const { categories, recent, exercises } = await withPhysio(async (tx, physioId) => {
    const [tree, recentlyUsed, initial] = await Promise.all([
      listCategoryTree(tx, physioId),
      listRecentExercises(tx, physioId),
      listExercises(tx, physioId, DEFAULT_LIBRARY_FILTERS, PICKER_INITIAL_LIMIT),
    ]);
    return { categories: tree, recent: recentlyUsed, exercises: initial.exercises };
  });

  // Coming from a plan board ("New routine" on a day): offer the way back to that plan.
  const fromPlan = idSchema.safeParse(firstParam(sp.plan));
  const back = fromPlan.success
    ? { href: `/plans/${fromPlan.data}` as Route, label: t("backToPlan") }
    : { href: `/customers/${routine.customerId}?tab=routines` as Route, label: t("back") };

  return (
    <div className="grid gap-6">
      <Link
        href={back.href}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon aria-hidden className="size-4" />
        {back.label}
      </Link>
      <RoutineEditor
        routine={{
          id: routine.id,
          version: routine.version,
          customerId: routine.customerId,
          customerName: customerName(routine.customerFirstName, routine.customerLastName),
          header: {
            name: routine.name,
            notes: routine.notes ?? "",
            caseId: routine.caseId,
            sessionsPerWeek:
              routine.sessionsPerWeek === null ? "" : String(routine.sessionsPerWeek),
            sessionsPerDay: routine.sessionsPerDay === null ? "" : String(routine.sessionsPerDay),
            status: routine.status,
          },
          cases: routine.cases.map(({ id, title }) => ({ id, title })),
        }}
        initialBlocks={fromLoaded(routine.items, routine.groups, () => crypto.randomUUID())}
        categories={categories}
        recent={recent}
        exercises={exercises}
      />
    </div>
  );
}
