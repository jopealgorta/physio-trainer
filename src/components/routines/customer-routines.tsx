import { getTranslations } from "next-intl/server";

import { DEFAULT_ROUTINE_FILTERS } from "@/lib/routine-params";
import { withPhysio } from "@/server/auth/session";
import { listRoutines } from "@/server/routines/queries";

import { TemplatePickerDialog } from "@/components/templates/template-picker-dialog";

import { NewRoutineDialog } from "./new-routine-dialog";
import { RoutineList } from "./routine-list";

/** A customer's routines tab: their routines and a way to add one (not for archived customers). */
export async function CustomerRoutines({
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
  const t = await getTranslations("Routines");
  const { routines } = await withPhysio((tx, physioId) =>
    listRoutines(tx, physioId, { ...DEFAULT_ROUTINE_FILTERS, customerId }),
  );
  const dialog = archived ? null : (
    <div className="flex flex-wrap items-center gap-2">
      <TemplatePickerDialog
        kind="routine"
        customer={{ id: customerId, name: customerName }}
        cases={cases}
      />
      <NewRoutineDialog customerId={customerId} customerName={customerName} cases={cases} />
    </div>
  );

  return (
    <section className="grid gap-4" aria-labelledby="customer-routines-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="customer-routines-title" className="text-lg font-semibold">
          {t("customerTab.title")}
        </h2>
        {dialog}
      </div>
      {routines.length > 0 ? (
        <RoutineList routines={routines} showCustomer={false} timeZone={timeZone} />
      ) : (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          {t("customerTab.empty", { name: customerName })}
        </p>
      )}
    </section>
  );
}
