import type { Metadata, Viewport } from "next";
import type { ComponentProps } from "react";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";

import { BrandingStyle } from "@/components/branding/branding-style";
import { ClinicMark } from "@/components/patient/clinic-mark";
import { PatientFooter } from "@/components/patient/patient-footer";
import { buildPreviewMetadata, previewVersion } from "@/lib/link-preview";
import { buildSharePath, parseSlugParam } from "@/lib/share-links";
import { loadLink } from "@/server/patient/load";
import { previewCopy } from "@/server/patient/preview-copy";

type IntlMessages = ComponentProps<typeof NextIntlClientProvider>["messages"];

async function shellOf(slug: string) {
  const parsed = parseSlugParam(slug);
  const resolved = parsed ? await loadLink(parsed.code) : null;
  return resolved && resolved.status !== "not_found" ? resolved.shell : null;
}

/**
 * Everything about a patient page that must not leak or be indexed (spec 10 rule 9), and the card
 * it unfurls into (spec 11): the same for every link status, the clinic's branding and the routine
 * or plan name, in the customer's language. Resolving a link here never counts as an open (only `page.tsx` does).
 */
export async function generateMetadata({
  params,
}: LayoutProps<"/[handle]/[slug]">): Promise<Metadata> {
  const shell = await shellOf((await params).slug);
  if (!shell) return { robots: { index: false, follow: false } };
  const path = buildSharePath(shell.handle, shell.slug, shell.code);
  const { clinicName } = shell.branding;
  const t = await getTranslations({ locale: shell.locale, namespace: "Patient.meta" });
  const copy = previewCopy(t, { target: shell.target, itemTitle: shell.title, clinicName });
  return {
    ...buildPreviewMetadata({
      path,
      version: previewVersion({ ...shell.branding, title: shell.title }),
      clinicName,
      ...copy,
    }),
    referrer: "no-referrer",
    // Replaces the physio app's manifest (spec 18) so "Add to home screen" installs this link.
    manifest: `${path}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: clinicName, statusBarStyle: "default" },
  };
}

export async function generateViewport({
  params,
}: LayoutProps<"/[handle]/[slug]">): Promise<Viewport> {
  const tokens = (await shellOf((await params).slug))?.branding.tokens;
  return tokens
    ? {
        themeColor: [
          { media: "(prefers-color-scheme: light)", color: tokens.light.primary },
          { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
        ],
      }
    : {};
}

/**
 * Frame for every patient state (page, PIN gate, unavailable): the customer's language (the root
 * layout only knows the physio's cookie), the physio's branding and the clinic header and footer.
 */
export default async function PatientLayout({ children, params }: LayoutProps<"/[handle]/[slug]">) {
  const shell = await shellOf((await params).slug);
  if (!shell) notFound();
  const { locale, branding } = shell;

  // The client components on this page (PIN form, video preview, workout) get only what they use.
  const all = await getMessages({ locale });
  const messages: IntlMessages = {
    Patient: all.Patient,
    Library: { media: all.Library.media },
    Workout: all.Workout,
  };

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div
        data-brand="patient"
        lang={locale}
        className="bg-background text-foreground flex min-h-dvh flex-col"
      >
        <BrandingStyle tokens={branding.tokens} scope="patient" />
        <header className="border-b">
          <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
            <ClinicMark
              name={branding.clinicName}
              logoUrl={branding.logoUrl}
              alt=""
              className="size-9 text-base"
            />
            <p className="min-w-0 truncate font-semibold">{branding.clinicName}</p>
          </div>
        </header>
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">{children}</main>
        <PatientFooter branding={branding} locale={locale} />
      </div>
    </NextIntlClientProvider>
  );
}
