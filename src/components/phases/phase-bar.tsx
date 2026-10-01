import { useTranslations } from "next-intl";

import { scheduleState } from "@/lib/schedule";
import type { RoutineStatus } from "@/lib/routines";
import type { PhaseKind } from "@/server/phases/schemas";

import { NextPhaseDialog } from "./next-phase-dialog";
import { PhaseChips } from "./phase-chips";
import { PhasePopover } from "./phase-popover";

/**
 * Phase controls shown under a routine's or plan's title: the label and dates, an edit popover
 * and "Copy into next phase". Not shown for a routine inside a plan: the plan governs it.
 */
export function PhaseBar({
  kind,
  id,
  status,
  phaseLabel,
  startsOn,
  endsOn,
  today,
}: {
  kind: PhaseKind;
  id: string;
  status: RoutineStatus;
  phaseLabel: string | null;
  startsOn: string | null;
  endsOn: string | null;
  /** The physio's calendar day (`YYYY-MM-DD`). */
  today: string;
}) {
  const t = useTranslations("Phases.bar");
  const state = scheduleState({ status, startsOn, endsOn }, today);
  const hasPhase = phaseLabel !== null || startsOn !== null || endsOn !== null;

  return (
    <section
      aria-label={t("title")}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border p-3"
    >
      <h2 className="text-sm font-medium">{t("title")}</h2>
      <div className="min-w-0 flex-1 text-sm">
        {hasPhase ? (
          <PhaseChips phaseLabel={phaseLabel} startsOn={startsOn} endsOn={endsOn} state={state} />
        ) : (
          <span className="text-muted-foreground text-xs">{t("none")}</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PhasePopover kind={kind} id={id} values={{ phaseLabel, startsOn, endsOn }} />
        <NextPhaseDialog
          kind={kind}
          id={id}
          status={status}
          phaseLabel={phaseLabel}
          startsOn={startsOn}
          endsOn={endsOn}
          today={today}
        />
      </div>
    </section>
  );
}
