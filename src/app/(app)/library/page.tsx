import { PlusIcon } from "lucide-react";
import type { Metadata, Route } from "next";
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
import { exerciseHref } from "@/lib/exercise-return";
import { hasActiveFilters, libraryHref, parseLibraryParams } from "@/lib/library-params";
import { withPhysio } from "@/server/auth/session";
import { hasAnyExercises, listCategoryTree, listExercises } from "@/server/library/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Library");
  return { title: t("title") };
}

export default async function LibraryPage({ searchParams }: PageProps<"/library">) {
  const filters = parseLibraryParams(await searchParams);
  const t = await getTranslations("Library");
  const [tree, list, anyExercises] = await withPhysio((tx, physioId) =>
    Promise.all([
      listCategoryTree(tx, physioId),
      listExercises(tx, physioId, filters),
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
  // An exercise opened (or created) from this list comes back to it, filters and all.
  const here = libraryHref(filters);

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <>
            <CategoryManager tree={tree} />
            <Button asChild>
              <Link href={exerciseHref("new", here) as Route}>
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
          <div className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
            <aside className="hidden md:block">{categoryTree}</aside>
            <div className="grid content-start gap-6">
              <LibraryToolbar filters={filters}>{categoryTree}</LibraryToolbar>
              <PendingContent>
                {layout === "results" ? (
                  <ExerciseResults
                    exercises={exercises}
                    categories={tree}
                    truncated={truncated}
                    view={filters.view}
                    archived={filters.category.kind === "archived"}
                    from={here}
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
