"use client";

import { Globe, Mail, MessageCircle, Phone, type LucideIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { Branding } from "@/lib/branding";
import { cn } from "@/lib/utils";

import { BrandingStyle } from "./branding-style";
import { PoweredBy } from "./powered-by";

const websiteHost = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** The logo, or a circle with the clinic's initial in the accent colour. */
function LogoMark({
  branding,
  className,
  onPrimary = false,
}: {
  branding: Branding;
  className?: string;
  /** Sits on a `bg-primary` surface: the initial circle inverts, the logo gets a light tile. */
  onPrimary?: boolean;
}) {
  const t = useTranslations("Settings.branding");
  if (branding.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- ≤512 px logo from a public bucket (or a blob: preview); next/image refuses local Supabase (private IP) and blob URLs.
      <img
        src={branding.logoUrl}
        alt={t("logoAlt", { clinic: branding.clinicName })}
        className={cn(
          "shrink-0 object-contain",
          onPrimary && "bg-background rounded-md p-1",
          className,
        )}
      />
    );
  }
  const initial = Array.from(branding.clinicName.trim())[0]?.toLocaleUpperCase() ?? "";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        onPrimary ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground",
        className,
      )}
    >
      {initial}
    </span>
  );
}

function PreviewFigure({ caption, children }: { caption: string; children: ReactNode }) {
  const id = useId();
  return (
    <figure aria-labelledby={id} className="grid gap-2">
      <figcaption id={id} className="text-muted-foreground text-xs font-medium">
        {caption}
      </figcaption>
      {children}
    </figure>
  );
}

function PatientPageMock({ branding }: { branding: Branding }) {
  const t = useTranslations("Settings.branding.preview");
  const contact = branding.contact;
  const links: {
    key: "call" | "whatsapp" | "email" | "website";
    href: string;
    icon: LucideIcon;
  }[] = [];
  if (contact?.phone) links.push({ key: "call", href: `tel:${contact.phone}`, icon: Phone });
  if (contact?.whatsappUrl) {
    links.push({ key: "whatsapp", href: contact.whatsappUrl, icon: MessageCircle });
  }
  if (contact?.email) links.push({ key: "email", href: `mailto:${contact.email}`, icon: Mail });
  if (contact?.website) links.push({ key: "website", href: contact.website, icon: Globe });

  return (
    <div className="bg-background grid gap-4 rounded-lg border p-4">
      <div className="flex items-center gap-3">
        <LogoMark branding={branding} className="size-10 text-base" />
        <p className="min-w-0 truncate text-sm font-semibold">{branding.clinicName}</p>
      </div>
      <p className="text-lg font-semibold">{t("greeting", { name: t("sampleName") })}</p>
      <Button type="button" size="lg" tabIndex={-1} className="w-full">
        {t("markDone")}
      </Button>
      {links.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {links.map(({ key, href, icon: Icon }) => (
            <Button key={key} asChild variant="outline" size="sm">
              <a
                href={href}
                tabIndex={-1}
                {...(key === "whatsapp" || key === "website"
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              >
                <Icon aria-hidden />
                {t(key)}
              </a>
            </Button>
          ))}
        </div>
      ) : null}
      <PoweredBy className="text-center" />
    </div>
  );
}

function PdfHeaderMock({ branding }: { branding: Branding }) {
  const t = useTranslations("Settings.branding.preview");
  const format = useFormatter();
  const contact = branding.contact;
  const contactLine = contact
    ? [contact.email, contact.phone, contact.website && websiteHost(contact.website)].filter(
        Boolean,
      )
    : [];

  return (
    <div className="bg-background grid gap-3 rounded-lg border p-4">
      <div className="border-primary flex items-start justify-between gap-3 border-b-2 pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <LogoMark branding={branding} className="size-8 text-sm" />
          <p className="min-w-0 truncate text-sm font-semibold">{branding.clinicName}</p>
        </div>
        {contactLine.length > 0 ? (
          <p className="text-muted-foreground min-w-0 text-right text-[0.625rem] break-all">
            {contactLine.join(" · ")}
          </p>
        ) : null}
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold">{t("pdfTitle", { name: t("sampleName") })}</p>
        {/* Server and browser may render this a few ms apart (or either side of midnight). */}
        <p className="text-muted-foreground text-xs" suppressHydrationWarning>
          {format.dateTime(new Date(), { dateStyle: "long" })}
        </p>
      </div>
    </div>
  );
}

function LinkCardMock({ branding, linkHost }: { branding: Branding; linkHost: string }) {
  const t = useTranslations("Settings.branding.preview");
  return (
    <div className="bg-background overflow-hidden rounded-lg border">
      <div className="bg-primary text-primary-foreground flex items-center gap-3 p-4">
        <LogoMark branding={branding} onPrimary className="size-10 text-base" />
        <p className="min-w-0 truncate text-sm font-semibold">{branding.clinicName}</p>
      </div>
      <div className="grid gap-1 p-3">
        <p className="text-muted-foreground text-[0.625rem] tracking-wide uppercase">{linkHost}</p>
        <p className="text-sm font-semibold">{t("linkTitle", { clinic: branding.clinicName })}</p>
        <p className="text-muted-foreground text-xs">
          {t("linkDescription", { clinic: branding.clinicName })}
        </p>
      </div>
    </div>
  );
}

/** Settings preview of the patient page, the PDF header and a shared-link card. */
export function BrandingPreview({ branding, linkHost }: { branding: Branding; linkHost: string }) {
  const t = useTranslations("Settings.branding.preview");
  return (
    <div data-brand="preview" className="grid gap-4">
      <BrandingStyle tokens={branding.tokens} scope="preview" />
      <PreviewFigure caption={t("patient")}>
        <PatientPageMock branding={branding} />
      </PreviewFigure>
      <PreviewFigure caption={t("pdf")}>
        <PdfHeaderMock branding={branding} />
      </PreviewFigure>
      <PreviewFigure caption={t("link")}>
        <LinkCardMock branding={branding} linkHost={linkHost} />
      </PreviewFigure>
    </div>
  );
}
