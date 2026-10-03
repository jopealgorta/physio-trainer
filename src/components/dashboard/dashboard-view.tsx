import { ChevronRightIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { IntentLink } from "@/components/intent-link";
import { CALENDAR_DATE_FORMAT, calendarDateToDate } from "@/lib/calendar-date";
import type { AttentionReason } from "@/lib/attention";
import type { Dashboard } from "@/lib/dashboard";

const activityHref = (customerId: string) => `/customers/${customerId}?tab=activity` as const;

/** The dashboard (spec 13): totals, who needs attention, new comments and recent activity. */
export function DashboardView({ data, timeZone }: { data: Dashboard; timeZone: string }) {
  const t = useTranslations("Dashboard");
  const format = useFormatter();

  const reasonText = (reason: AttentionReason) => {
    switch (reason.rule) {
      case "highPain":
        return t("attention.reasons.highPain", { pain: reason.pain });
      case "painRise":
        return t("attention.reasons.painRise", { delta: reason.delta });
      case "lowAdherence":
        return t("attention.reasons.lowAdherence", { percent: reason.percent });
    }
  };

  return (
    <div className="grid gap-6">
      <dl className="grid gap-3 sm:grid-cols-2">
        <Stat label={t("totals.customers")} value={format.number(data.totals.activeCustomers)} />
        <Stat label={t("totals.sessions")} value={format.number(data.totals.sessionsThisWeek)} />
      </dl>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          id="attention"
          title={t("attention.title")}
          description={t("attention.description")}
          empty={t("attention.empty")}
          className="lg:col-span-2"
        >
          {data.attention.map((entry, index) => (
            <Row key={entry.customerId} id={entry.customerId} name={entry.name} eager={index === 0}>
              <ul className="text-destructive grid gap-0.5 text-sm">
                {entry.reasons.map((reason) => (
                  <li key={reason.rule}>{reasonText(reason)}</li>
                ))}
              </ul>
            </Row>
          ))}
        </Panel>

        <Panel
          id="comments"
          title={t("comments.title")}
          description={t("comments.description")}
          empty={t("comments.empty")}
        >
          {data.newComments.map((entry, index) => (
            <Row
              key={entry.customerId}
              id={entry.customerId}
              name={entry.name}
              meta={t("comments.count", { count: entry.count })}
              eager={index === 0}
            >
              <p className="line-clamp-2 text-sm wrap-anywhere">{entry.latest.comment}</p>
              <p className="text-muted-foreground text-xs">
                {t(entry.latest.exerciseName ? "comments.contextExercise" : "comments.context", {
                  routine: entry.latest.routineName,
                  exercise: entry.latest.exerciseName ?? "",
                  date: format.dateTime(
                    calendarDateToDate(entry.latest.performedOn),
                    CALENDAR_DATE_FORMAT,
                  ),
                })}
              </p>
            </Row>
          ))}
        </Panel>

        <Panel
          id="recent"
          title={t("recent.title")}
          description={t("recent.description")}
          empty={t("recent.empty")}
        >
          {data.recentlyActive.map((entry, index) => (
            <Row key={entry.customerId} id={entry.customerId} name={entry.name} eager={index === 0}>
              <p className="text-muted-foreground text-sm">
                {t("recent.sessions", { count: entry.sessionsLast7 })}
                {" · "}
                {t("recent.last", {
                  date: format.dateTime(entry.lastLoggedAt, {
                    month: "short",
                    day: "numeric",
                    timeZone,
                  }),
                })}
              </p>
            </Row>
          ))}
        </Panel>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card grid gap-1 rounded-lg border p-4">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-3xl font-semibold tracking-tight tabular-nums">{value}</dd>
    </div>
  );
}

/** A titled list card; shows `empty` when it has no rows. */
function Panel({
  id,
  title,
  description,
  empty,
  className,
  children,
}: {
  id: string;
  title: string;
  description: string;
  empty: string;
  className?: string;
  children: React.ReactNode[];
}) {
  return (
    <section
      aria-labelledby={`dashboard-${id}`}
      className={`bg-card rounded-lg border ${className ?? ""}`}
    >
      <header className="grid gap-0.5 border-b p-4">
        <h2 id={`dashboard-${id}`} className="text-base font-semibold">
          {title}
        </h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </header>
      {children.length === 0 ? (
        <p className="text-muted-foreground p-4 text-sm">{empty}</p>
      ) : (
        <ul className="divide-y">
          {children.map((child, index) => (
            <li key={index}>{child}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One customer in a list: the whole row links to their Activity tab. Only a panel's first row
 * prefetches on sight (see IntentLink).
 */
function Row({
  id,
  name,
  meta,
  eager,
  children,
}: {
  id: string;
  name: string;
  meta?: string;
  eager: boolean;
  children: React.ReactNode;
}) {
  return (
    <IntentLink
      href={activityHref(id)}
      eager={eager}
      className="hover:bg-muted/50 focus-visible:ring-ring/50 flex items-center gap-3 p-4 outline-none focus-visible:ring-[3px] focus-visible:ring-inset"
    >
      <span className="grid min-w-0 flex-1 gap-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium wrap-anywhere">{name}</span>
          {meta ? <span className="text-muted-foreground text-xs">{meta}</span> : null}
        </span>
        {children}
      </span>
      <ChevronRightIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />
    </IntentLink>
  );
}
