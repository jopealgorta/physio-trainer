import { getTranslations } from "next-intl/server";

import type { Locale } from "@/i18n/config";
import type { Branding } from "@/lib/branding";

import { ContactButtons } from "./contact-buttons";

/** Physio contact, the "add to home screen" tip and the app credit (spec 09: not white-label). */
export async function PatientFooter({ branding, locale }: { branding: Branding; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "Patient" });
  const tBranding = await getTranslations({ locale, namespace: "Branding" });
  return (
    <footer className="mx-auto grid w-full max-w-2xl gap-4 border-t px-4 py-6">
      {branding.contact ? (
        <div className="grid gap-2">
          <p className="text-sm font-medium">
            {t("contact.title", { clinic: branding.clinicName })}
          </p>
          <ContactButtons contact={branding.contact} locale={locale} />
        </div>
      ) : null}
      <p className="text-muted-foreground text-xs">{t("install")}</p>
      <p className="text-muted-foreground text-xs">{tBranding("poweredBy")}</p>
    </footer>
  );
}
