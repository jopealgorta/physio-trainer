import { ArrowLeftIcon } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";

import { exerciseReturnPath } from "@/lib/exercise-return";
import { firstParam } from "@/lib/search-params";
import { ExerciseActions } from "@/components/library/exercise-actions";
import { ExerciseForm } from "@/components/library/exercise-form";
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

export default async function ExerciseDetailPage({
  params,
  searchParams,
}: PageProps<"/library/[exerciseId]">) {
  const back = exerciseReturnPath(firstParam((await searchParams).from));
  const { exerciseId } = await params;
  const loaded = await loadExercise(exerciseId);
  if (!loaded) notFound();
  const { exercise, categories } = loaded;
  const t = await getTranslations("Library");

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Link
          href={(back.startsWith("/library") ? back : "/library") as Route}
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
        cancel={{ href: back }}
        returnTo={back}
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
  );
}
