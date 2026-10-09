import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { exerciseReturnPath } from "@/lib/exercise-return";
import { firstParam } from "@/lib/search-params";
import { ExerciseForm } from "@/components/library/exercise-form";
import { PageHeader } from "@/components/page-header";
import { withPhysio } from "@/server/auth/session";
import { saveExerciseAction } from "@/server/library/actions";
import { listCategoryTree } from "@/server/library/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Library.form");
  return { title: t("newTitle") };
}

export default async function NewExercisePage({ searchParams }: PageProps<"/library/new">) {
  const back = exerciseReturnPath(firstParam((await searchParams).from));
  const t = await getTranslations("Library.form");
  const categories = await withPhysio((tx, physioId) => listCategoryTree(tx, physioId));
  return (
    <div className="grid gap-6">
      <PageHeader
        back={{ href: back.startsWith("/library") ? back : "/library", label: t("back") }}
        title={t("newTitle")}
      />
      <ExerciseForm
        action={saveExerciseAction}
        categories={categories}
        cancel={{ href: back }}
        returnTo={back}
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
