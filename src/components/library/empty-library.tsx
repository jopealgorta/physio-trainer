import { DumbbellIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export async function EmptyLibrary() {
  const t = await getTranslations("Library.empty");
  return (
    <Card>
      <CardContent className="mx-auto grid max-w-md justify-items-center gap-3 py-10 text-center">
        <DumbbellIcon aria-hidden className="text-primary size-8" />
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="text-muted-foreground text-sm">{t("body")}</p>
        <Button asChild>
          <Link href="/library/new">{t("cta")}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
