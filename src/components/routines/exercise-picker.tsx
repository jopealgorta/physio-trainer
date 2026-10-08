"use client";

import { CheckIcon, DumbbellIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { BodyAreaBadge } from "@/components/body-areas/body-area-badge";
import { YouTubeThumbnail } from "@/components/library/youtube-thumbnail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BODY_AREAS, bodyAreaSchema } from "@/lib/body-areas";
import type { CategoryNode } from "@/lib/category-tree";
import { SEARCH_MAX_LENGTH } from "@/lib/library-params";
import type { ExerciseRef } from "@/lib/routine-editor";
import { fromSelectValue, toSelectValue } from "@/lib/select-value";
import { searchExercisesAction } from "@/server/routines/actions";
import type { ExerciseSummary } from "@/server/library/queries";

import { CreateExerciseDialog, type NewExerciseStart } from "./create-exercise-dialog";

const SEARCH_DEBOUNCE_MS = 250;
const NONE_ADDED: ReadonlyMap<string, number> = new Map();
const BLANK_START: NewExerciseStart = { name: "", categoryIds: [], bodyAreas: [] };
const MAX_AREA_BADGES = 2;

export const toExerciseRef = (summary: ExerciseSummary): ExerciseRef => ({
  id: summary.id,
  name: summary.name,
  kind: summary.kind,
  archived: summary.archivedAt !== null,
  cover: summary.cover,
});

type Fetched = { key: string; exercises: ExerciseSummary[] | null };

function ExerciseButton({
  exercise,
  count,
  disabled,
  onPick,
}: {
  exercise: ExerciseSummary;
  /** How many times the routine already holds it. */
  count: number;
  disabled: boolean;
  onPick: (exercise: ExerciseSummary) => void;
}) {
  const t = useTranslations("Routines.picker");
  const tLibrary = useTranslations("Library");
  const descriptionId = useId();
  const shown = exercise.bodyAreas.slice(0, MAX_AREA_BADGES);
  const more = exercise.bodyAreas.length - shown.length;
  return (
    <Button
      type="button"
      variant="ghost"
      aria-label={exercise.name}
      aria-describedby={count > 0 ? descriptionId : undefined}
      data-added={count > 0 || undefined}
      disabled={disabled}
      onClick={() => onPick(exercise)}
      className="h-auto w-full justify-start gap-3 p-2 text-left font-normal whitespace-normal"
    >
      <span className="bg-muted aspect-video w-16 shrink-0 overflow-hidden rounded-md">
        {exercise.cover ? (
          <YouTubeThumbnail videoId={exercise.cover.videoId} />
        ) : (
          <span className="text-muted-foreground flex size-full items-center justify-center">
            <DumbbellIcon aria-hidden className="size-5" />
          </span>
        )}
      </span>
      <span className="grid min-w-0 flex-1 gap-1">
        <span className="line-clamp-2 text-sm font-medium">{exercise.name}</span>
        <span className="flex flex-wrap items-center gap-1">
          {exercise.kind === "aerobic" ? (
            <Badge variant="secondary">{tLibrary("kindBadge.aerobic")}</Badge>
          ) : null}
          {shown.map((area) => (
            <BodyAreaBadge key={area} area={area} />
          ))}
          {more > 0 ? <Badge variant="outline">+{more}</Badge> : null}
        </span>
      </span>
      {count > 0 ? (
        <span className="text-primary flex shrink-0 items-center gap-0.5 self-center text-xs font-semibold">
          <CheckIcon aria-hidden className="size-4" />
          {count > 1 ? <span aria-hidden>{t("addedCount", { count })}</span> : null}
          <span id={descriptionId} className="sr-only">
            {t("inRoutine", { count })}
          </span>
        </span>
      ) : null}
    </Button>
  );
}

/**
 * Searchable, filterable exercise list for the routine editor (spec 05). Idle (no query and no
 * filter) it shows the physio's recent exercises and the first page of the library; otherwise it
 * searches on the server, debounced, with responses sequenced so a slow older one is dropped.
 * Picking never closes anything: the physio keeps adding. "New exercise" (and, when a search finds
 * nothing, "Create “<search>”") opens the exercise form; what it creates is picked like any other.
 */
export function ExercisePicker({
  categories,
  recent,
  initial,
  disabledReason,
  added = NONE_ADDED,
  inSheet = false,
  onPick,
}: {
  categories: CategoryNode[];
  recent: ExerciseSummary[];
  initial: ExerciseSummary[];
  /** How many times the routine holds each exercise (by id): those rows show a check. */
  added?: ReadonlyMap<string, number>;
  /** Set when nothing can be added (routine at its limit); shown and disables every pick. */
  disabledReason: string | null;
  /** The picker is inside a bottom sheet, so the exercise form opens as a nested one. */
  inSheet?: boolean;
  onPick: (exercise: ExerciseRef) => void;
}) {
  const t = useTranslations("Routines.picker");
  const tAreas = useTranslations("BodyAreas.areas");
  const tCategory = useTranslations("Library.form");
  const id = useId();
  const router = useRouter();

  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [area, setArea] = useState("");
  const [fetched, setFetched] = useState<Fetched | null>(null);
  const [announcement, setAnnouncement] = useState({ text: "", count: 0 });
  // What the exercise form opened with; null while it is closed.
  const [creating, setCreating] = useState<NewExerciseStart | null>(null);
  // Bumped after creating an exercise, so the same search runs again and finds it.
  const [generation, setGeneration] = useState(0);
  const sequence = useRef(0);

  const term = q.trim();
  const idle = term === "" && category === "" && area === "";
  const key = JSON.stringify([term, category, area, generation]);

  // Once the filters go idle the last results (or failure) no longer describe anything: drop
  // them, so retyping the same query is treated as a new search (busy, no stale error).
  if (idle && fetched !== null) setFetched(null);

  useEffect(() => {
    const request = sequence.current;
    const timer = idle
      ? undefined
      : setTimeout(async () => {
          let exercises: ExerciseSummary[] | null;
          try {
            exercises = await searchExercisesAction({
              q: term || undefined,
              category: category || undefined,
              area: area || undefined,
            });
          } catch {
            exercises = null;
          }
          if (request === sequence.current) setFetched({ key, exercises });
        }, SEARCH_DEBOUNCE_MS);
    return () => {
      // Runs on every change and on unmount: whatever is pending or in flight is now stale.
      clearTimeout(timer);
      sequence.current++;
    };
  }, [idle, key, term, category, area]);

  // While a search is pending or in flight the previous results stay on screen.
  const busy = !idle && fetched?.key !== key;
  const failed = !idle && fetched?.key === key && fetched.exercises === null;
  const exercises = idle ? initial : (fetched?.exercises ?? initial);
  const libraryEmpty = idle && initial.length === 0;
  const disabled = disabledReason !== null;

  const categoryLabels = new Map<string, string>();
  for (const node of categories) {
    categoryLabels.set(node.id, node.name);
    for (const child of node.children) {
      categoryLabels.set(
        child.id,
        tCategory("subcategoryOption", { parent: node.name, name: child.name }),
      );
    }
  }

  function pick(exercise: ExerciseRef) {
    if (disabled) return;
    onPick(exercise);
    // The announcer alternates a trailing no-break space (U+00A0, see below) so that repeating
    // the same pick still changes the text and is announced again.
    setAnnouncement((previous) => ({
      text: t("added", { name: exercise.name }),
      count: previous.count + 1,
    }));
  }

  const pickSummary = (summary: ExerciseSummary) => pick(toExerciseRef(summary));

  /** Opens the exercise form with what the physio searched and filtered by. */
  function startCreating() {
    const filteredArea = bodyAreaSchema.safeParse(area);
    setCreating({
      name: term,
      categoryIds: category ? [category] : [],
      bodyAreas: filteredArea.success ? [filteredArea.data] : [],
    });
  }

  function created(exercise: ExerciseRef) {
    setCreating(null);
    pick(exercise);
    // Otherwise "No exercises match" and "Create “…”" stay up, inviting a duplicate. The idle
    // list and Recent come from the page; the editor keeps its unsaved edits across a refresh.
    setGeneration((value) => value + 1);
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-3">
        <Input
          type="search"
          aria-label={t("search")}
          placeholder={t("search")}
          maxLength={SEARCH_MAX_LENGTH}
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <div className="grid min-w-0 gap-1">
            <Label htmlFor={`${id}-category`} className="text-muted-foreground">
              {t("category")}
            </Label>
            <Select
              value={toSelectValue(category)}
              onValueChange={(value) => {
                // "" only comes from Radix's internal <select>, never from a choice.
                if (value === "") return;
                setCategory(fromSelectValue(value));
              }}
            >
              <SelectTrigger id={`${id}-category`} className="w-full">
                <SelectValue>
                  {category
                    ? (categoryLabels.get(category) ?? t("allCategories"))
                    : t("allCategories")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value={toSelectValue("")}>{t("allCategories")}</SelectItem>
                {categories.map((node) => (
                  <SelectGroup key={node.id}>
                    <SelectLabel>{node.name}</SelectLabel>
                    <SelectItem value={node.id}>{node.name}</SelectItem>
                    {node.children.map((child) => (
                      <SelectItem key={child.id} value={child.id}>
                        {categoryLabels.get(child.id)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid min-w-0 gap-1">
            <Label htmlFor={`${id}-area`} className="text-muted-foreground">
              {t("area")}
            </Label>
            <Select
              value={toSelectValue(area)}
              onValueChange={(value) => {
                if (value === "") return;
                const next = bodyAreaSchema.safeParse(fromSelectValue(value));
                setArea(next.success ? next.data : "");
              }}
            >
              <SelectTrigger id={`${id}-area`} className="w-full">
                <SelectValue>
                  {area ? tAreas(bodyAreaSchema.parse(area)) : t("anyArea")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value={toSelectValue("")}>{t("anyArea")}</SelectItem>
                {BODY_AREAS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {tAreas(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={startCreating}
          className="justify-self-start"
        >
          <PlusIcon aria-hidden />
          {t("create")}
        </Button>
      </div>

      <CreateExerciseDialog
        open={creating !== null}
        onOpenChange={(open) => {
          if (!open) setCreating(null);
        }}
        start={creating ?? BLANK_START}
        categories={categories}
        nested={inSheet}
        onCreated={created}
      />

      <p role="status" data-testid="picker-announcer" className="sr-only">
        {announcement.text ? announcement.text + (announcement.count % 2 ? "" : " ") : ""}
      </p>

      {disabled ? <p className="text-muted-foreground text-sm">{disabledReason}</p> : null}

      {libraryEmpty ? (
        <p className="text-muted-foreground text-sm">{t("noLibrary")}</p>
      ) : (
        <>
          {idle && recent.length > 0 ? (
            <section aria-labelledby={`${id}-recent`} className="grid gap-1">
              <h3 id={`${id}-recent`} className="text-muted-foreground text-xs font-medium">
                {t("recent")}
              </h3>
              <ul className="grid gap-0.5">
                {recent.map((exercise) => (
                  <li key={exercise.id}>
                    <ExerciseButton
                      exercise={exercise}
                      count={added.get(exercise.id) ?? 0}
                      disabled={disabled}
                      onPick={pickSummary}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {failed ? (
            <p className="text-destructive text-sm">{t("error")}</p>
          ) : (
            <div className="grid gap-1">
              <p
                id={`${id}-count`}
                role="status"
                data-testid="picker-count"
                className="text-muted-foreground text-xs"
              >
                {t("results", { count: exercises.length })}
              </p>
              {exercises.length === 0 ? (
                <div className="grid justify-items-start gap-2">
                  <p className="text-muted-foreground text-sm">{t("none")}</p>
                  {term !== "" && !busy ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={disabled}
                      onClick={startCreating}
                      className="h-auto max-w-full py-1.5 whitespace-normal"
                    >
                      <PlusIcon aria-hidden />
                      {t("createNamed", { name: term })}
                    </Button>
                  ) : null}
                </div>
              ) : (
                <ul
                  data-testid="picker-list"
                  aria-labelledby={`${id}-count`}
                  aria-busy={busy}
                  className="grid gap-0.5 aria-busy:opacity-60"
                >
                  {exercises.map((exercise) => (
                    <li key={exercise.id}>
                      <ExerciseButton
                        exercise={exercise}
                        count={added.get(exercise.id) ?? 0}
                        disabled={disabled}
                        onPick={pickSummary}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
