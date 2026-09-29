import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { CategoryTree } from "@/components/library/category-tree";
import { EmptyLibrary } from "@/components/library/empty-library";
import { ExerciseResults, NoResults } from "@/components/library/exercise-results";
import { LibraryToolbar } from "@/components/library/library-toolbar";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { libraryLayoutState } from "@/lib/library-layout";
import { hasActiveFilters, parseLibraryParams } from "@/lib/library-params";
import { withPhysio } from "@/server/auth/session";
import { listCategoryTree, listExercises, listTags } from "@/server/library/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Library");
  return { title: t("title") };
}

export default async function LibraryPage({ searchParams }: PageProps<"/library">) {
  const filters = parseLibraryParams(await searchParams);
  const t = await getTranslations("Library");
  const { tree, exercises, tags } = await withPhysio(async (tx, physioId) => ({
    tree: await listCategoryTree(tx, physioId),
    exercises: await listExercises(tx, physioId, filters),
    tags: await listTags(tx, physioId),
  }));
  const layout = libraryLayoutState({
    hasCategories: tree.length > 0,
    hasExercises: exercises.length > 0,
    filtersActive: hasActiveFilters(filters),
  });
  const categoryTree = <CategoryTree tree={tree} filters={filters} />;

  return (
    <div className="grid gap-8">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <>
            <Button asChild>
              <Link href="/library/new">
                <PlusIcon aria-hidden /> {t("newExercise")}
              </Link>
            </Button>
          </>
        }
      />
      {layout === "empty-page" ? (
        <EmptyLibrary />
      ) : (
        <div className="grid gap-8 md:grid-cols-[14rem_minmax(0,1fr)]">
          <aside className="hidden md:block">{categoryTree}</aside>
          <div className="grid content-start gap-6">
            <LibraryToolbar filters={filters} tags={tags}>
              {categoryTree}
            </LibraryToolbar>
            {layout === "results" ? (
              <ExerciseResults
                exercises={exercises}
                view={filters.view}
                archived={filters.category.kind === "archived"}
              />
            ) : layout === "no-results" ? (
              <NoResults view={filters.view} />
            ) : (
              <EmptyLibrary />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
