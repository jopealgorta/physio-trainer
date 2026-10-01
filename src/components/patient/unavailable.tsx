import { LinkIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import type { Locale } from "@/i18n/config";
import type { Branding } from "@/lib/branding";
import type { UnavailableReason } from "@/server/patient/resolve-link";

import { ContactButtons } from "./contact-buttons";

/** Revoked, expired or archived: a friendly dead end that points the patient to their physio. */
export async function Unavailable({
  reason,
  branding,
  locale,
}: {
  reason: UnavailableReason;
  branding: Branding;
  locale: Locale;
}) {
  const t = await getTranslations({ locale, namespace: "Patient.unavailable" });
  return (
    <div className="mx-auto grid w-full max-w-sm justify-items-center gap-4 py-12 text-center">
      <span className="bg-muted flex size-12 items-center justify-center rounded-full">
        <LinkIcon aria-hidden className="size-5" />
      </span>
      <h1 className="text-xl font-semibold tracking-tight">{t(`title.${reason}`)}</h1>
      <p className="text-muted-foreground text-sm">
        {t("description", { clinic: branding.clinicName })}
      </p>
      <ContactButtons contact={branding.contact} locale={locale} size="default" />
    </div>
  );
}
