import Link from "next/link";
import { useTranslations } from "next-intl";

import { StatusBadge } from "@/components/routines/status-badge";
import { Badge } from "@/components/ui/badge";
import type { RoutineStatus } from "@/lib/routines";
import { scheduleState } from "@/lib/schedule";
import { cn } from "@/lib/utils";

import { PhaseRange } from "./phase-chips";

export type TimelineItem = {
  id: string;
  name: string;
  status: RoutineStatus;
  phaseLabel: string | null;
  startsOn: string | null;
  endsOn: string | null;
};

/**
 * One progression chain, oldest phase first: past, current and upcoming phases with their dates,
 * the current one highlighted. `items` must already be in chain order (`groupByChain`).
 */
export function PhaseTimeline({
  kind,
  items,
  today,
}: {
  kind: "routine" | "plan";
  items: TimelineItem[];
  /** The physio's calendar day (`YYYY-MM-DD`). */
  today: string;
}) {
  const t = useTranslations("Phases.timeline");
  const base = kind === "routine" ? "/routines" : "/plans";

  return (
    <div className="grid min-w-0 gap-2 rounded-lg border p-3">
      <h3 className="truncate text-sm font-medium">{items[0].name}</h3>
      <ol aria-label={t("title")} className="flex gap-2 overflow-x-auto pb-1">
        {items.map((item) => {
          const state = scheduleState(item, today);
          return (
            <li key={item.id} className="shrink-0">
              <Link
                href={`${base}/${item.id}`}
                aria-current={state === "active" ? "step" : undefined}
                className={cn(
                  "hover:bg-muted focus-visible:ring-ring/30 grid h-full w-44 gap-1 rounded-md border p-2 text-sm outline-none focus-visible:ring-2",
                  state === "active" && "border-primary ring-primary ring-1",
                  state === "ended" && "text-muted-foreground",
                )}
              >
                <span className="truncate font-medium">{item.phaseLabel ?? t("untitled")}</span>
                <span className="text-muted-foreground text-xs">
                  {item.startsOn !== null || item.endsOn !== null ? (
                    <PhaseRange startsOn={item.startsOn} endsOn={item.endsOn} />
                  ) : (
                    t("noDates")
                  )}
                </span>
                <span className="flex">
                  {state === "inactive" ? (
                    <StatusBadge status={item.status} />
                  ) : (
                    <Badge variant={state === "active" ? "default" : "outline"}>
                      {t(state === "ended" ? "past" : state === "active" ? "current" : "upcoming")}
                    </Badge>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
