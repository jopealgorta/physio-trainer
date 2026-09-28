import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ThemeToggle } from "@/components/theme-toggle";

import { BodyAreaPreview } from "./body-area-preview";

// Development-only playground for the body-area picker (spec 02). 404 in production builds.
export default async function BodyAreasPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const t = await getTranslations("DevPreview");

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground text-sm">{t("description")}</p>
        </div>
        <ThemeToggle />
      </header>
      <BodyAreaPreview />
    </main>
  );
}
