"use client";

import { WifiOffIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

/** Shown by the service worker when a page can't load (docs/specs/18-pwa.md). */
export function OfflineScreen({
  onRetry = () => window.location.reload(),
}: {
  onRetry?: () => void;
}) {
  const t = useTranslations("Offline");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <Logo className="mb-4" />
      <WifiOffIcon className="text-muted-foreground size-8" aria-hidden />
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground max-w-sm">{t("description")}</p>
      <Button variant="outline" onClick={() => onRetry()}>
        {t("retry")}
      </Button>
    </main>
  );
}
