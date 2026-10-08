import { ArrowLeftIcon } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PhaseBar } from "@/components/phases/phase-bar";
import { ExportMenu } from "@/components/export/export-menu";
import { ShareButton } from "@/components/sharing/share-button";
import { RoutineEditor } from "@/components/routines/routine-editor";
import { FromTemplate } from "@/components/templates/from-template";
import { SaveAsTemplateDialog } from "@/components/templates/save-as-template-dialog";
import { TemplateActions } from "@/components/templates/template-actions";
import { todayIn } from "@/lib/calendar-date";
import { customerName } from "@/lib/customers";
import { fromLoadedSections } from "@/lib/routine-sections";
import { firstParam } from "@/lib/search-params";
import { idSchema } from "@/server/routines/schemas";
import { loadRoutine } from "@/server/routines/load";

export async function generateMetadata({
  params,
}: PageProps<"/routines/[routineId]">): Promise<Metadata> {
  const { routineId } = await params;
  const loaded = await loadRoutine(routineId);
  return { title: loaded?.routine.name };
}

export default async function RoutinePage({
  params,
  searchParams,
}: PageProps<"/routines/[routineId]">) {
  const [{ routineId }, sp] = await Promise.all([params, searchParams]);
  const loaded = await loadRoutine(routineId);
  if (!loaded) notFound();
  const { routine, timeZone, categories, recent, exercises, customers } = loaded;
  const t = await getTranslations("Routines.editor");
  const tSections = await getTranslations("Routines.sections");

  // Coming from a plan board ("New routine" on a day): offer the way back to that plan.
  const fromPlan = idSchema.safeParse(firstParam(sp.plan));
  const back = fromPlan.success
    ? { href: `/plans/${fromPlan.data}` as Route, label: t("backToPlan") }
    : {
        // Templates have no customer page to go back to (spec 07).
        href: (routine.customerId === null
          ? "/routines?tab=templates"
          : `/customers/${routine.customerId}?tab=routines`) as Route,
        label: t("back"),
      };

  // Laid out by the editor's header, around the title and Save (on phones the controls move
  // into its "More actions" menu).
  const top = {
    back: (
      <Link
        href={back.href}
        className="text-muted-foreground hover:text-foreground inline-flex max-w-full items-center gap-1 text-sm"
      >
        <ArrowLeftIcon aria-hidden className="size-4 shrink-0" />
        <span className="truncate">{back.label}</span>
      </Link>
    ),
    // A template has no customer to share with.
    actions: routine.isTemplate ? null : (
      <>
        <ExportMenu target={{ kind: "routines", id: routine.id }} />
        <ShareButton target={{ target: "routine", routineId: routine.id }} />
      </>
    ),
    secondary: routine.isTemplate ? (
      // A template plan's own routine is edited through the plan: only standalone ones are
      // assigned or duplicated from here.
      routine.isStandalone ? (
        <TemplateActions
          kind="routine"
          template={{ id: routine.id, name: routine.name }}
          customers={customers}
        />
      ) : null
    ) : (
      <>
        {routine.sourceTemplate ? (
          <FromTemplate kind="routine" template={routine.sourceTemplate} />
        ) : null}
        <SaveAsTemplateDialog kind="routine" sourceId={routine.id} defaultName={routine.name} />
      </>
    ),
    // Phases belong to a customer's routine, not to a template.
    phase:
      routine.isStandalone && !routine.isTemplate ? (
        <PhaseBar
          kind="routine"
          id={routine.id}
          status={routine.status}
          phaseLabel={routine.phaseLabel}
          startsOn={routine.startsOn}
          endsOn={routine.endsOn}
          today={todayIn(timeZone)}
        />
      ) : null,
  };

  return (
    <div className="grid gap-6">
      <RoutineEditor
        routine={{
          id: routine.id,
          version: routine.version,
          isTemplate: routine.isTemplate,
          customerId: routine.customerId,
          customerName: routine.customerFirstName
            ? customerName(routine.customerFirstName, routine.customerLastName)
            : null,
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
        initialSections={fromLoadedSections(
          routine.items,
          routine.groups,
          routine.sections,
          tSections("defaultName"),
          () => crypto.randomUUID(),
        )}
        categories={categories}
        recent={recent}
        exercises={exercises}
        top={top}
      />
    </div>
  );
}
