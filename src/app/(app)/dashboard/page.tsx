import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { DashboardView } from "@/components/dashboard/dashboard-view";
import { PageHeader } from "@/components/page-header";
import { withPhysio } from "@/server/auth/session";
import { getDashboard } from "@/server/activity/queries";
import { todayIn } from "@/lib/calendar-date";
import { getProfile } from "@/server/physios/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Nav");
  return { title: t("dashboard") };
}

export default async function Page() {
  const [nav, t] = await Promise.all([getTranslations("Nav"), getTranslations("Dashboard")]);
  const { data, timeZone } = await withPhysio(async (tx, physioId) => {
    const timeZone = (await getProfile(tx, physioId))?.timezone ?? "UTC";
    return { data: await getDashboard(tx, physioId, todayIn(timeZone)), timeZone };
  });

  return (
    <div className="grid gap-6">
      <PageHeader title={nav("dashboard")} description={t("description")} />
      <DashboardView data={data} timeZone={timeZone} />
    </div>
  );
}
