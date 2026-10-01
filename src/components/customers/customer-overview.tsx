import { useFormatter, useTranslations } from "next-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { CALENDAR_DATE_FORMAT, calendarDateToDate } from "@/lib/calendar-date";
import { languageOptions } from "@/i18n/config";
import { customerName } from "@/lib/customers";
import { LatestNote, type LatestNoteView } from "@/components/visit-notes/latest-note";
import type { CustomerDetail } from "@/server/customers/queries";

import { CaseCard } from "./case-card";
import { CaseSheet } from "./case-sheet";

function Field({ label, value, notSet }: { label: string; value: string | null; notSet: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={value ? "text-sm wrap-anywhere" : "text-muted-foreground text-sm"}>
        {value || notSet}
      </dd>
    </div>
  );
}

/** Overview tab: precautions first, then basic info, medical history and the customer's cases. */
export function CustomerOverview({
  customer,
  today,
  latestNote,
}: {
  customer: CustomerDetail;
  /** The customer's most recent visit note (spec 16), or null. */
  latestNote: LatestNoteView | null;
  /** The physio's calendar day (`YYYY-MM-DD`), used as the default closing date. */
  today: string;
}) {
  const t = useTranslations("Customers");
  const tCases = useTranslations("Cases");
  const format = useFormatter();

  const name = customerName(customer.firstName, customer.lastName);
  const openCases = customer.cases.filter((item) => item.status === "open");
  const closedCases = customer.cases.filter((item) => item.status === "closed");
  const withPrecautions = openCases.filter((item) => item.precautions?.trim());
  const medicalHistory = customer.medicalHistory?.trim() ? customer.medicalHistory : null;
  const notSet = t("overview.notSet");
  const language = languageOptions().find((option) => option.value === customer.locale)?.label;

  return (
    <div className="grid gap-8">
      {withPrecautions.length > 0 ? (
        <Alert className="border-destructive/40">
          <AlertTitle>{tCases("precautionsHeading")}</AlertTitle>
          <AlertDescription className="gap-3">
            {withPrecautions.map((item) => (
              <div key={item.id} className="grid gap-0.5">
                <p className="text-foreground font-semibold wrap-anywhere">{item.title}</p>
                <p className="text-foreground wrap-anywhere whitespace-pre-line">
                  {item.precautions}
                </p>
              </div>
            ))}
          </AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="basic-info" className="grid gap-3">
        <h2 id="basic-info" className="text-base font-semibold">
          {t("overview.basicInfo")}
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("overview.email")} value={customer.email} notSet={notSet} />
          <Field label={t("overview.phone")} value={customer.phone} notSet={notSet} />
          <Field
            label={t("overview.dateOfBirth")}
            value={
              customer.dateOfBirth
                ? format.dateTime(calendarDateToDate(customer.dateOfBirth), CALENDAR_DATE_FORMAT)
                : null
            }
            notSet={notSet}
          />
          <Field
            label={t("overview.sex")}
            value={customer.sex ? t(`form.sexes.${customer.sex}`) : null}
            notSet={notSet}
          />
          <Field label={t("overview.occupation")} value={customer.occupation} notSet={notSet} />
          <Field label={t("overview.activity")} value={customer.activity} notSet={notSet} />
          <Field label={t("overview.locale")} value={language ?? customer.locale} notSet={notSet} />
        </dl>
      </section>

      {medicalHistory ? (
        <section aria-labelledby="medical-history" className="grid gap-2">
          <h2 id="medical-history" className="text-base font-semibold">
            {t("overview.medicalHistory")}
          </h2>
          <p className="text-sm wrap-anywhere whitespace-pre-line">{medicalHistory}</p>
        </section>
      ) : null}

      <LatestNote customerId={customer.id} note={latestNote} />

      <section aria-labelledby="open-cases" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="open-cases" className="text-base font-semibold">
            {t("overview.openCases")}
          </h2>
          <CaseSheet customerId={customer.id} customerName={name} />
        </div>
        {openCases.length > 0 ? (
          <ul className="grid gap-3">
            {openCases.map((item) => (
              <li key={item.id}>
                <CaseCard case={item} customerName={name} today={today} />
              </li>
            ))}
          </ul>
        ) : (
          <Card>
            <CardContent className="grid gap-1 py-8 text-center">
              <p className="font-medium">{t("overview.noOpenCases")}</p>
              <p className="text-muted-foreground text-sm">{t("overview.noCasesBody")}</p>
            </CardContent>
          </Card>
        )}
      </section>

      {closedCases.length > 0 ? (
        <details className="group grid gap-3">
          <summary className="focus-visible:ring-ring/30 cursor-pointer rounded-md text-base font-semibold outline-none focus-visible:ring-2">
            {t("overview.closedCases")}
          </summary>
          <ul className="mt-3 grid gap-3">
            {closedCases.map((item) => (
              <li key={item.id}>
                <CaseCard case={item} customerName={name} today={today} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
