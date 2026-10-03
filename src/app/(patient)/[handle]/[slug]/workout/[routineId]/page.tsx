import type { Route } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { LogSessionButton } from "@/components/patient/log-session-button";
import { PinGate } from "@/components/patient/pin-gate";
import { Unavailable } from "@/components/patient/unavailable";
import { WorkoutPlayer } from "@/components/patient/workout/workout-player";
import { buildWorkoutPath, isUuid } from "@/lib/patient-paths";
import { firstParam } from "@/lib/search-params";
import { buildSharePath, parseSlugParam } from "@/lib/share-links";
import { getLinkAccess } from "@/server/patient/access";
import { loadLink } from "@/server/patient/load";
import { getPatientLogs } from "@/server/patient/log-session";
import { getReachableRoutine, isReachable } from "@/server/patient/view";
import { todayIn } from "@/lib/calendar-date";

const decode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/**
 * Guided workout for one routine: `/{handle}/{slug}-{code}/workout/{routineId}` (spec 12). The link
 * is resolved and PIN-gated exactly like the patient page, and the routine id from the URL is only
 * used if that link can reach it (anything else is a 404, never a hint that it exists).
 */
export default async function WorkoutPage({
  params,
  searchParams,
}: PageProps<"/[handle]/[slug]/workout/[routineId]">) {
  const [{ handle, slug, routineId }, sp] = await Promise.all([params, searchParams]);
  const parsed = parseSlugParam(slug);
  if (!parsed || !isUuid(routineId)) notFound();
  const resolved = await loadLink(parsed.code);
  if (resolved.status === "not_found") notFound();

  const { shell } = resolved;
  const path = buildSharePath(shell.handle, shell.slug, shell.code);
  const entry = firstParam(sp.entry);
  if (decode(handle) !== shell.handle || decode(slug) !== `${shell.slug}-${shell.code}`) {
    permanentRedirect(buildWorkoutPath(path, routineId, entry) as Route);
  }

  if (resolved.status === "unavailable") {
    return <Unavailable reason={resolved.reason} branding={shell.branding} locale={shell.locale} />;
  }

  const { link } = resolved;
  const { owner, unlocked } = await getLinkAccess(shell, link);
  if (!unlocked) return <PinGate code={shell.code} clinicName={shell.branding.clinicName} />;

  const routine = await getReachableRoutine(shell, link, routineId);
  if (!routine || routine.blocks.length === 0) notFound();

  const today = todayIn(shell.timeZone);
  // The plan entry the workout was started from (spec 13 logs it). A made-up or stale id is
  // dropped rather than trusted: the log is then saved for the routine on its own.
  const requestedEntry = entry && isUuid(entry) ? entry : null;
  const entryId =
    requestedEntry &&
    (await isReachable(shell, link, { routineId, entryId: requestedEntry }, today))
      ? requestedEntry
      : null;

  const [t, tLogging, logs] = await Promise.all([
    getTranslations({ locale: shell.locale, namespace: "Workout" }),
    getTranslations({ locale: shell.locale, namespace: "Patient.logging" }),
    getPatientLogs(shell, link, today, today),
  ]);
  // The finish screen hands off to the log sheet; the owner previewing the link only sees the state.
  const finishSlot = (
    <div className="grid justify-items-center gap-3">
      <p className="text-muted-foreground max-w-xs text-sm">{tLogging("finished")}</p>
      {/* The button's row (it lays out as items of its parent, as on the routine card). */}
      <div className="flex w-full max-w-xs items-center justify-center gap-3 empty:hidden">
        <LogSessionButton
          code={shell.code}
          routineId={routine.id}
          entryId={entryId}
          routineName={routine.name}
          days={owner ? [] : [{ date: today, relative: "today" }]}
          logs={logs.filter((log) => log.routineId === routine.id && log.entryId === entryId)}
          shownDate={today}
          defaultOpen={!owner}
        />
      </div>
    </div>
  );

  return (
    <WorkoutPlayer
      label={t("label", { name: routine.name })}
      routine={routine}
      code={shell.code}
      today={today}
      exitHref={path}
      finishSlot={finishSlot}
    />
  );
}
