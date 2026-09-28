"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { BodyAreaBadge } from "@/components/body-areas/body-area-badge";
import { BodyAreaPicker } from "@/components/body-areas/body-area-picker";
import { Button } from "@/components/ui/button";

export function BodyAreaPreview() {
  const t = useTranslations("DevPreview");
  const [submitted, setSubmitted] = useState<string[] | null>(null);

  return (
    <form
      action={(formData) =>
        setSubmitted([...formData.entries()].map(([key, value]) => `${key}=${String(value)}`))
      }
      className="flex flex-col gap-10"
    >
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">{t("multiTitle")}</h2>
        <BodyAreaPicker mode="multi" name="areas" />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">{t("singleTitle")}</h2>
        <BodyAreaPicker mode="single" withSide name="area" />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">{t("badgesTitle")}</h2>
        <div className="flex flex-wrap gap-2">
          <BodyAreaBadge area="knee" side="left" />
          <BodyAreaBadge area="shoulder" side="both" />
          <BodyAreaBadge area="lower_back" />
        </div>
      </section>
      <Button type="submit" className="self-start">
        {t("submit")}
      </Button>
      {submitted && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">{t("submitted")}</h2>
          <pre className="bg-muted rounded-md p-3 text-xs">
            {submitted.length > 0 ? submitted.join("\n") : t("empty")}
          </pre>
        </section>
      )}
    </form>
  );
}
