import { GlobeIcon, MailIcon, MessageCircleIcon, PhoneIcon, type LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import type { BrandingContact } from "@/lib/branding";
import type { Locale } from "@/i18n/config";

/** Call, WhatsApp, email and website buttons for the physio, only for what they chose to show. */
export async function ContactButtons({
  contact,
  locale,
  size = "sm",
}: {
  contact: BrandingContact | null;
  locale: Locale;
  size?: "sm" | "default";
}) {
  if (!contact) return null;
  const t = await getTranslations({ locale, namespace: "Patient.contact" });
  const links: {
    key: "call" | "whatsapp" | "email" | "website";
    href: string;
    icon: LucideIcon;
  }[] = [];
  if (contact.phone) links.push({ key: "call", href: `tel:${contact.phone}`, icon: PhoneIcon });
  if (contact.whatsappUrl) {
    links.push({ key: "whatsapp", href: contact.whatsappUrl, icon: MessageCircleIcon });
  }
  if (contact.email) links.push({ key: "email", href: `mailto:${contact.email}`, icon: MailIcon });
  if (contact.website) links.push({ key: "website", href: contact.website, icon: GlobeIcon });
  if (links.length === 0) return null;

  return (
    <div role="group" aria-label={t("label")} className="flex flex-wrap gap-2">
      {links.map(({ key, href, icon: Icon }) => (
        <Button key={key} asChild variant="outline" size={size}>
          <a
            href={href}
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
  );
}
