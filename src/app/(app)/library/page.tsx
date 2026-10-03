import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { CategoryManager } from "@/components/library/category-manager";
import { CategoryTree } from "@/components/library/category-tree";
import { EmptyLibrary } from "@/components/library/empty-library";
import { ExerciseResults, NoResults } from "@/components/library/exercise-results";
import { LibraryToolbar } from "@/components/library/library-toolbar";
import { PendingContent, PendingScope } from "@/components/navigation-pending";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { libraryLayoutState } from "@/lib/library-layout";
import { hasActiveFilters, parseLibraryParams } from "@/lib/library-params";
import { withPhysio } from "@/server/auth/session";
import {
  hasAnyExercises,
  listCategoryTree,
  listExercises,
  listTags,
} from "@/server/library/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Library");
  return { title: t("title") };
}

export default async function LibraryPage({ searchParams }: PageProps<"/library">) {
  const filters = parseLibraryParams(await searchParams);
  const t = await getTranslations("Library");
  const [tree, list, tags, anyExercises] = await withPhysio((tx, physioId) =>
    Promise.all([
      listCategoryTree(tx, physioId),
      listExercises(tx, physioId, filters),
      listTags(tx, physioId),
      hasAnyExercises(tx, physioId),
    ]),
  );
  const { exercises, truncated } = list;
  const layout = libraryLayoutState({
    hasCategories: tree.length > 0,
    hasExercises: exercises.length > 0,
    hasAnyExercises: anyExercises,
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
            <CategoryManager tree={tree} />
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
        <PendingScope>
          <div className="grid gap-8 md:grid-cols-[14rem_minmax(0,1fr)]">
            <aside className="hidden md:block">{categoryTree}</aside>
            <div className="grid content-start gap-6">
              <LibraryToolbar filters={filters} tags={tags}>
                {categoryTree}
              </LibraryToolbar>
              <PendingContent>
                {layout === "results" ? (
                  <ExerciseResults
                    exercises={exercises}
                    truncated={truncated}
                    view={filters.view}
                    archived={filters.category.kind === "archived"}
                  />
                ) : layout === "no-results" ? (
                  <NoResults view={filters.view} />
                ) : (
                  <EmptyLibrary />
                )}
              </PendingContent>
            </div>
          </div>
        </PendingScope>
      )}
    </div>
  );
}
