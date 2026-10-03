import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";

import { ExerciseActions } from "@/components/library/exercise-actions";
import { ExerciseForm } from "@/components/library/exercise-form";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { withPhysio } from "@/server/auth/session";
import { saveExerciseAction } from "@/server/library/actions";
import { getExercise, listCategoryTree, listTags } from "@/server/library/queries";
import { idSchema } from "@/server/library/schemas";

// Shared by generateMetadata and the page within one request.
const loadExercise = cache(async (rawId: string) => {
  const parsed = idSchema.safeParse(rawId);
  if (!parsed.success) return null;
  const [exercise, categories, tags] = await withPhysio((tx, physioId) =>
    Promise.all([
      getExercise(tx, physioId, parsed.data),
      listCategoryTree(tx, physioId),
      listTags(tx, physioId),
    ]),
  );
  return exercise ? { exercise, categories, tags } : null;
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
  const { exercise, categories, tags } = loaded;
  const t = await getTranslations("Library");

  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <Link
          href="/library"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          {t("form.back")}
        </Link>
        <PageHeader
          title={exercise.name}
          actions={
            <ExerciseActions
              id={exercise.id}
              name={exercise.name}
              archived={exercise.archivedAt !== null}
            />
          }
        />
      </div>
      {exercise.archivedAt ? (
        <Alert>
          <AlertDescription>{t("detail.archivedNotice")}</AlertDescription>
        </Alert>
      ) : null}
      <ExerciseForm
        action={saveExerciseAction}
        categories={categories}
        tagSuggestions={tags}
        defaults={{
          id: exercise.id,
          name: exercise.name,
          kind: exercise.kind,
          categoryId: exercise.categoryId,
          instructions: exercise.instructions,
          bodyAreas: exercise.bodyAreas,
          tags: exercise.tags,
          mediaUrls: exercise.media.map((item) => item.url),
        }}
      />
    </div>
  );
}
