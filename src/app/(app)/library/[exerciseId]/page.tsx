import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";

import { ExerciseActions } from "@/components/library/exercise-actions";
import { ExerciseForm } from "@/components/library/exercise-form";
import { PageActions } from "@/components/page-actions";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { withPhysio } from "@/server/auth/session";
import { saveExerciseAction } from "@/server/library/actions";
import { getExercise, listCategoryTree } from "@/server/library/queries";
import { idSchema } from "@/server/library/schemas";

// Shared by generateMetadata and the page within one request.
const loadExercise = cache(async (rawId: string) => {
  const parsed = idSchema.safeParse(rawId);
  if (!parsed.success) return null;
  const [exercise, categories] = await withPhysio((tx, physioId) =>
    Promise.all([getExercise(tx, physioId, parsed.data), listCategoryTree(tx, physioId)]),
  );
  return exercise ? { exercise, categories } : null;
});

export async function generateMetadata({
  params,
}: PageProps<"/library/[exerciseId]">): Promise<Metadata> {
  const { exerciseId } = await params;
  const loaded = await loadExercise(exerciseId);
  return { title: loaded?.exercise.name };
}

export default async function ExerciseDetailPage({ params }: PageProps<"/library/[exerciseId]">) {
  const { exerciseId } = await params;
  const loaded = await loadExercise(exerciseId);
  if (!loaded) notFound();
  const { exercise, categories } = loaded;
  const t = await getTranslations("Library");

  return (
    <PageActions>
      <div className="grid gap-6">
        <PageHeader back={{ href: "/library", label: t("form.back") }} title={exercise.name} />
        {/* Archive and Delete: in the header's "⋯" menu; their dialog and errors show here. */}
        <ExerciseActions
          id={exercise.id}
          name={exercise.name}
          archived={exercise.archivedAt !== null}
        />
        {exercise.archivedAt ? (
          <Alert>
            <AlertDescription>{t("detail.archivedNotice")}</AlertDescription>
          </Alert>
        ) : null}
        <ExerciseForm
          action={saveExerciseAction}
          categories={categories}
          defaults={{
            id: exercise.id,
            name: exercise.name,
            kind: exercise.kind,
            categoryIds: exercise.categoryIds,
            instructions: exercise.instructions,
            bodyAreas: exercise.bodyAreas,
            mediaUrls: exercise.media.map((item) => item.url),
          }}
        />
      </div>
    </PageActions>
  );
}
