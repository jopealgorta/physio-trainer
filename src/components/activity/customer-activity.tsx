import { getTranslations } from "next-intl/server";

import { SectionHeader } from "@/components/section-header";
import { Card, CardContent } from "@/components/ui/card";
import { todayIn } from "@/lib/calendar-date";
import { withPhysio } from "@/server/auth/session";
import { getCustomerActivity } from "@/server/activity/queries";

import { ActivityHeatmap } from "./activity-heatmap";
import { ActivitySummary } from "./activity-summary";
import { MarkCommentsSeen } from "./mark-comments-seen";
import { PainChart } from "./pain-chart";
import { SessionFeed } from "./session-feed";

/**
 * A customer's Activity tab (spec 13): what they logged from their link over the last 12 weeks
 * against what was planned, how their pain moved, and what they wrote.
 */
export async function CustomerActivity({
  customerId,
  customerName,
  timeZone,
}: {
  customerId: string;
  customerName: string;
  timeZone: string;
}) {
  const t = await getTranslations("Activity");
  const activity = await withPhysio((tx, physioId) =>
    getCustomerActivity(tx, physioId, customerId, todayIn(timeZone)),
  );
  const nothingYet = activity.summary.lastLoggedOn === null && activity.sessions.length === 0;

  return (
    <section className="grid gap-6" aria-labelledby="customer-activity-title">
      <SectionHeader
        id="customer-activity-title"
        title={t("title")}
        description={t("description", { name: customerName })}
      />

      {nothingYet ? (
        <Card>
          <CardContent className="grid gap-1 py-10 text-center">
            <p className="font-medium">{t("empty.title")}</p>
            <p className="text-muted-foreground text-sm">
              {t("empty.body", { name: customerName })}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <ActivitySummary summary={activity.summary} />
          <ActivityHeatmap weeks={activity.weeks} cells={activity.cells} />
          <PainChart overall={activity.pain.overall} routines={activity.pain.routines} />
          <SessionFeed sessions={activity.sessions} />
          <MarkCommentsSeen
            customerId={customerId}
            ids={activity.unseenIds}
            exerciseIds={activity.unseenExerciseIds}
          />
        </>
      )}
    </section>
  );
}
