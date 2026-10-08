import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { ExerciseForm } from "@/components/library/exercise-form";
import { PageHeader } from "@/components/page-header";
import { withPhysio } from "@/server/auth/session";
import { saveExerciseAction } from "@/server/library/actions";
import { listCategoryTree } from "@/server/library/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Library.form");
  return { title: t("newTitle") };
}

export default async function NewExercisePage() {
  const t = await getTranslations("Library.form");
  const categories = await withPhysio((tx, physioId) => listCategoryTree(tx, physioId));
  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <Link
          href="/library"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          {t("back")}
        </Link>
        <PageHeader title={t("newTitle")} />
      </div>
      <ExerciseForm
        action={saveExerciseAction}
        categories={categories}
        defaults={{
          name: "",
          kind: "strength",
          categoryIds: [],
          instructions: null,
          bodyAreas: [],
          mediaUrls: [],
        }}
      />
    </div>
  );
}
