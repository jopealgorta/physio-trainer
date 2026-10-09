import { DumbbellIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { IntentLink } from "@/components/intent-link";
import { BodyAreaBadge } from "@/components/body-areas/body-area-badge";
import { Badge } from "@/components/ui/badge";
import { LinkPendingHint } from "@/components/navigation-pending";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { exerciseHref } from "@/lib/exercise-return";
import { categoriesInTreeOrder, type CategoryNode } from "@/lib/category-tree";
import { DEFAULT_LIBRARY_FILTERS, libraryHref, type LibraryView } from "@/lib/library-params";
import type { ExerciseSummary } from "@/server/library/queries";

import { YouTubeThumbnail } from "./youtube-thumbnail";

const MAX_AREA_BADGES = 3;
const MAX_CATEGORY_BADGES = 2;

function Meta({ exercise, archived }: { exercise: ExerciseSummary; archived: boolean }) {
  const t = useTranslations("Library");
  const shown = exercise.bodyAreas.slice(0, MAX_AREA_BADGES);
  const more = exercise.bodyAreas.length - shown.length;
  return (
    <>
      {exercise.kind === "aerobic" ? (
        <Badge variant="secondary">{t("kindBadge.aerobic")}</Badge>
      ) : null}
      {shown.map((area) => (
        <BodyAreaBadge key={area} area={area} />
      ))}
      {more > 0 ? <Badge variant="outline">{t("more", { count: more })}</Badge> : null}
      {archived ? <Badge variant="outline">{t("archivedBadge")}</Badge> : null}
    </>
  );
}

function Categories({ ids, tree }: { ids: string[]; tree: CategoryNode[] }) {
  const t = useTranslations("Library");
  const categories = categoriesInTreeOrder(tree, ids);
  if (categories.length === 0) return null;
  const shown = categories.slice(0, MAX_CATEGORY_BADGES);
  const more = categories.length - shown.length;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {shown.map((category) => (
        <Badge key={category.id} variant="secondary" className="max-w-full truncate font-normal">
          {category.parent
            ? t("form.subcategoryOption", { parent: category.parent, name: category.name })
            : category.name}
        </Badge>
      ))}
      {more > 0 ? (
        <Badge variant="secondary" className="font-normal">
          {t("more", { count: more })}
        </Badge>
      ) : null}
    </div>
  );
}

function Thumb({ exercise }: { exercise: ExerciseSummary }) {
  return exercise.cover ? (
    <YouTubeThumbnail videoId={exercise.cover.videoId} />
  ) : (
    <div className="text-muted-foreground flex size-full items-center justify-center">
      <DumbbellIcon aria-hidden className="size-6" />
    </div>
  );
}

export async function ExerciseResults({
  exercises,
  categories,
  view,
  archived,
  truncated = false,
  from,
}: {
  exercises: ExerciseSummary[];
  /** The category tree, to name each exercise's categories. */
  categories: CategoryNode[];
  view: LibraryView;
  archived: boolean;
  /** More rows matched than the list cap. */
  truncated?: boolean;
  /** This list's URL (its filters), where an exercise opened from it returns after saving. */
  from?: string;
}) {
  const t = await getTranslations("Library");
  const href = (id: string) => exerciseHref(id, from) as Route;
  return (
    <div className="grid gap-3">
      <p role="status" className="text-muted-foreground text-sm">
        {t("results", { count: exercises.length })}
      </p>
      {truncated ? (
        <p className="text-muted-foreground text-sm">
          {t("truncated", { count: exercises.length })}
        </p>
      ) : null}
      {view === "list" ? (
        <ul className="divide-y rounded-lg border">
          {exercises.map((exercise, index) => (
            <li key={exercise.id}>
              <IntentLink
                href={href(exercise.id)}
                eager={index === 0}
                className="hover:bg-muted/50 focus-visible:ring-ring/30 flex items-center gap-3 p-3 outline-none focus-visible:ring-2"
              >
                <div className="bg-muted aspect-video w-20 shrink-0 overflow-hidden rounded-md">
                  <Thumb exercise={exercise} />
                </div>
                <div className="grid min-w-0 flex-1 gap-1 md:flex md:items-center md:gap-3">
                  <span className="font-medium md:w-64 md:truncate">{exercise.name}</span>
                  <div className="flex flex-wrap items-center gap-1">
                    <Meta exercise={exercise} archived={archived} />
                  </div>
                  <div className="min-w-0 md:flex-1">
                    <Categories ids={exercise.categoryIds} tree={categories} />
                  </div>
                </div>
              </IntentLink>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {exercises.map((exercise, index) => (
            <li key={exercise.id}>
              <IntentLink
                href={href(exercise.id)}
                eager={index === 0}
                className="focus-visible:ring-ring/30 block rounded-lg outline-none focus-visible:ring-2"
              >
                <Card className="hover:bg-muted/30 h-full overflow-hidden pt-0">
                  <div className="bg-muted aspect-video overflow-hidden">
                    <Thumb exercise={exercise} />
                  </div>
                  <CardContent className="grid gap-2">
                    <span className="line-clamp-2 font-medium">{exercise.name}</span>
                    <div className="flex flex-wrap items-center gap-1">
                      <Meta exercise={exercise} archived={archived} />
                    </div>
                    <Categories ids={exercise.categoryIds} tree={categories} />
                  </CardContent>
                </Card>
              </IntentLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export async function NoResults({ view }: { view: LibraryView }) {
  const t = await getTranslations("Library.noResults");
  return (
    <Card>
      <CardContent className="mx-auto grid max-w-md justify-items-center gap-3 py-10 text-center">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="text-muted-foreground text-sm">{t("body")}</p>
        <Button asChild variant="outline">
          <Link href={libraryHref(DEFAULT_LIBRARY_FILTERS, { view })} className="relative">
            {t("clear")}
            <LinkPendingHint className="inset-x-3 bottom-1" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
