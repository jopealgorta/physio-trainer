import { getTranslations } from "next-intl/server";

import { DEFAULT_PLAN_FILTERS } from "@/lib/plan-params";
import { withPhysio } from "@/server/auth/session";
import { listPlans } from "@/server/plans/queries";

import { TemplatePickerDialog } from "@/components/templates/template-picker-dialog";

import { NewPlanDialog } from "./new-plan-dialog";
import { PlanList } from "./plan-list";

/** A customer's plans tab: their weekly plans and a way to add one (not for archived customers). */
export async function CustomerPlans({
  customerId,
  customerName,
  cases,
  archived,
  timeZone,
}: {
  customerId: string;
  customerName: string;
  cases: { id: string; title: string }[];
  archived: boolean;
  timeZone: string;
}) {
  const t = await getTranslations("Plans");
  const { plans } = await withPhysio((tx, physioId) =>
    listPlans(tx, physioId, { ...DEFAULT_PLAN_FILTERS, customerId }),
  );
  const dialog = archived ? null : (
    <div className="flex flex-wrap items-center gap-2">
      <TemplatePickerDialog
        kind="plan"
        customer={{ id: customerId, name: customerName }}
        cases={cases}
      />
      <NewPlanDialog customerId={customerId} customerName={customerName} cases={cases} />
    </div>
  );

  return (
    <section className="grid gap-4" aria-labelledby="customer-plans-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="customer-plans-title" className="text-lg font-semibold">
          {t("customerTab.title")}
        </h2>
        {dialog}
      </div>
      {plans.length > 0 ? (
        <PlanList plans={plans} showCustomer={false} timeZone={timeZone} />
      ) : (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          {t("customerTab.empty", { name: customerName })}
        </p>
      )}
    </section>
  );
}
