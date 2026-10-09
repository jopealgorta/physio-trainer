"use client";

import { useRouter } from "next/navigation";
import { CheckIcon, PlusIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { FormFooter } from "@/components/form-layout";
import { HistorySheet } from "@/components/history/history-sheet";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import type { CategoryNode } from "@/lib/category-tree";
import { flatItems, itemsWithInvalidSets, newItem, type ExerciseRef } from "@/lib/routine-editor";
import {
  addItemToLast,
  allBlocks,
  toSaveSections,
  totalItems,
  type EditorSection,
} from "@/lib/routine-sections";
import { MAX_ITEMS } from "@/lib/routines";
import { validateHeader, type HeaderErrors } from "@/lib/routine-validation";
import { saveRoutineAction, type SaveRoutineActionError } from "@/server/routines/actions";
import type { ExerciseSummary } from "@/server/library/queries";

import { ExercisePicker } from "./exercise-picker";
import { RoutineHeader, type HeaderSlots, type HeaderValues } from "./routine-header";
import { SectionList } from "./section-list";
import { useUnsavedGuard } from "./use-unsaved-guard";

export type { HeaderValues } from "./routine-header";

export type RoutineEditorProps = {
  routine: {
    id: string;
    version: number;
    customerId: string | null;
    customerName: string | null;
    /** A template belongs to no customer: no case, and it may be active while empty. */
    isTemplate: boolean;
    header: HeaderValues;
    cases: { id: string; title: string }[];
  };
  /** At least one section (the page names a section-less routine's default one). */
  initialSections: EditorSection[];
  categories: CategoryNode[];
  recent: ExerciseSummary[];
  exercises: ExerciseSummary[];
  /** The page's back link and controls, laid out with the header (see RoutineHeader). */
  top?: HeaderSlots;
};

type SaveError = SaveRoutineActionError | "generic";

const newKey = () => crypto.randomUUID();

/** How long "Added Squat" stays in the picker sheet's footer. */
const FLASH_MS = 2500;

const snapshotOf = (header: HeaderValues, sections: EditorSection[]) =>
  JSON.stringify([header, toSaveSections(sections)]);

/**
 * The routine editor: header fields, the sections with their blocks and the exercise picker
 * (which appends to the last section), saved as one unit with an optimistic version check. The
 * picker is a sticky side panel from `lg`, and a bottom sheet (the same component) below it.
 */
export function RoutineEditor({
  routine,
  initialSections,
  categories,
  recent,
  exercises,
  top,
}: RoutineEditorProps) {
  const t = useTranslations("Routines.editor");
  const tPicker = useTranslations("Routines.picker");
  const router = useRouter();

  const [header, setHeader] = useState(routine.header);
  const [sections, setSections] = useState(initialSections);
  const [version, setVersion] = useState(routine.version);
  const [snapshot, setSnapshot] = useState(() => snapshotOf(routine.header, initialSections));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<SaveError | null>(null);
  const [blockedBy, setBlockedBy] = useState<string[]>([]);
  const format = useFormatter();
  const [fieldErrors, setFieldErrors] = useState<HeaderErrors>({});
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [focusToken, setFocusToken] = useState(0);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  // Set once a save was refused for invalid sets; from then on the flagged items follow the edits.
  const [checkSets, setCheckSets] = useState(false);
  const [reloadRequested, setReloadRequested] = useState(false);

  // Reload (after a conflict or a restore) asks the page for fresh data. Only once the user asked, and only
  // when the page holds a newer version than ours, does it replace local state (someone else's
  // change, which the user chose to load). A newer version without a request is either our own
  // save (the action revalidates this page) or background data: edits in progress are kept.
  if (reloadRequested && routine.version > version) {
    setReloadRequested(false);
    setHeader(routine.header);
    setSections(initialSections);
    setVersion(routine.version);
    setSnapshot(snapshotOf(routine.header, initialSections));
    setError(null);
    setFieldErrors({});
    setSavedAt(null);
    setExpanded(new Set());
    setCheckSets(false);
  }

  function reload() {
    setReloadRequested(true);
    router.refresh();
  }

  const blocks = useMemo(() => allBlocks(sections), [sections]);
  const invalidItems = useMemo(
    () => (checkSets ? new Set(itemsWithInvalidSets(blocks)) : new Set<string>()),
    [checkSets, blocks],
  );
  const toggleExpanded = (key: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const current = useMemo(() => snapshotOf(header, sections), [header, sections]);
  const dirty = current !== snapshot;
  useUnsavedGuard(dirty, t("leaveConfirm"));
  const indicator = saving ? "" : dirty ? t("unsaved") : savedAt !== null ? t("saved") : "";

  function changeHeader(patch: Partial<HeaderValues>) {
    setHeader((previous) => ({ ...previous, ...patch }));
    // Editing a field withdraws its own error.
    setFieldErrors((previous) => {
      const remaining = { ...previous };
      for (const field of Object.keys(patch) as (keyof HeaderValues)[]) {
        if (field in remaining) delete remaining[field as keyof HeaderErrors];
      }
      return remaining;
    });
  }

  // The phone sheet counts what was added since it opened (the list behind it shows the
  // total) and confirms each pick for a moment, so a tap visibly did something.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addedHere, setAddedHere] = useState(0);
  const [flash, setFlash] = useState<{ name: string; token: number } | null>(null);
  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [flash]);

  function openSheet(open: boolean) {
    setSheetOpen(open);
    // Reset on opening only: the footer keeps its count while the sheet slides away.
    if (open) {
      setAddedHere(0);
      setFlash(null);
    }
  }

  const added = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of flatItems(blocks)) {
      counts.set(item.exerciseId, (counts.get(item.exerciseId) ?? 0) + 1);
    }
    return counts;
  }, [blocks]);

  const pick = (exercise: ExerciseRef) => {
    setSections((previous) => addItemToLast(previous, newItem(exercise, newKey)));
    if (sheetOpen) {
      setAddedHere((count) => count + 1);
      setFlash((previous) => ({ name: exercise.name, token: (previous?.token ?? 0) + 1 }));
    }
  };
  // In the sheet, the picker opens its exercise form as a nested sheet.
  const picker = (inSheet: boolean) => (
    <ExercisePicker
      categories={categories}
      recent={recent}
      initial={exercises}
      disabledReason={totalItems(sections) < MAX_ITEMS ? null : tPicker("full", { max: MAX_ITEMS })}
      added={added}
      inSheet={inSheet}
      onPick={pick}
    />
  );

  async function save() {
    if (saving || !dirty) return;
    const validation = validateHeader(header);
    if (!validation.ok) {
      setFieldErrors(validation.errors);
      setFocusToken((token) => token + 1);
      return;
    }
    setFieldErrors({});
    // The action only says "invalid", so sets are checked here to point at the exercises.
    const badItems = itemsWithInvalidSets(blocks);
    if (badItems.length > 0) {
      setError(null);
      setCheckSets(true);
      setExpanded((previous) => new Set([...previous, ...badItems]));
      return;
    }
    if (!routine.isTemplate && header.status === "active" && flatItems(blocks).length === 0) {
      setError("needsItems");
      return;
    }
    setError(null);
    setSaving(true);
    const savedSnapshot = current;
    try {
      const result = await saveRoutineAction({
        id: routine.id,
        version,
        name: header.name,
        notes: header.notes,
        caseId: header.caseId,
        sessionsPerWeek: validation.sessionsPerWeek,
        sessionsPerDay: validation.sessionsPerDay,
        status: header.status,
        ...toSaveSections(sections),
      });
      if (result.ok) {
        setVersion(result.data.version);
        setSnapshot(savedSnapshot);
        setSavedAt(Date.now());
      } else {
        setError(result.error);
        setBlockedBy(result.plans?.map((plan) => plan.name) ?? []);
      }
    } catch {
      setError("generic");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6">
      <RoutineHeader
        values={header}
        errors={fieldErrors}
        onChange={changeHeader}
        isTemplate={routine.isTemplate}
        customerId={routine.customerId}
        customerName={routine.customerName}
        cases={routine.cases}
        focusToken={focusToken}
        actions={<HistorySheet kind="routine" id={routine.id} dirty={dirty} onRestored={reload} />}
        top={top}
      />

      {invalidItems.size > 0 ? (
        <Alert variant="destructive">
          <AlertDescription>{t("errors.sets")}</AlertDescription>
        </Alert>
      ) : null}

      {error === "conflict" ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            {t("conflict")}
            <Button type="button" variant="outline" size="sm" onClick={reload}>
              {t("reload")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>
            {error === "blockedByPlans"
              ? t("errors.blockedByPlans", { plans: format.list(blockedBy) })
              : t(`errors.${error}`)}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="grid min-w-0 gap-4">
          <div className="lg:hidden">
            <Drawer open={sheetOpen} onOpenChange={openSheet}>
              <DrawerTrigger asChild>
                <Button type="button" variant="outline">
                  <PlusIcon aria-hidden />
                  {tPicker("open")}
                </Button>
              </DrawerTrigger>
              {/* The title says it all (no description), and Done is the localized way out. */}
              <DrawerContent aria-describedby={undefined} focusContent>
                <DrawerHeader>
                  <DrawerTitle>{tPicker("title")}</DrawerTitle>
                </DrawerHeader>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-2">
                  {picker(true)}
                </div>
                <DrawerFooter className="border-t pt-3">
                  {/* Seen, not heard: the picker's live region already announces each pick.
                      The line keeps its height once something was added, so later picks
                      do not shift the button. */}
                  {addedHere > 0 ? (
                    <div aria-hidden className="h-5">
                      {flash ? (
                        <p
                          key={flash.token}
                          data-testid="picker-flash"
                          className="text-primary motion-safe:animate-in motion-safe:fade-in-0 flex items-center justify-center gap-1 text-sm font-medium"
                        >
                          <CheckIcon className="size-4 shrink-0" />
                          <span className="truncate">{tPicker("flash", { name: flash.name })}</span>
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <DrawerClose asChild>
                    <Button type="button" size="lg" className="h-10">
                      {tPicker("close", { count: addedHere })}
                    </Button>
                  </DrawerClose>
                </DrawerFooter>
              </DrawerContent>
            </Drawer>
          </div>
          <SectionList
            sections={sections}
            onChange={setSections}
            newKey={newKey}
            expanded={expanded}
            invalid={invalidItems}
            onToggle={toggleExpanded}
          />
        </div>
        <aside
          aria-labelledby="picker-title"
          // Clear of the pinned footer below it.
          className="bg-card sticky top-6 hidden max-h-[calc(100dvh-8rem)] min-w-0 overflow-y-auto rounded-lg border p-4 lg:grid lg:gap-3"
        >
          <h2 id="picker-title" className="text-sm font-semibold">
            {tPicker("title")}
          </h2>
          {picker(false)}
        </aside>
      </div>

      <FormFooter wide status={<span data-testid="save-status">{indicator}</span>}>
        <Button type="button" onClick={save} disabled={!dirty || saving}>
          {saving ? t("saving") : t("save")}
        </Button>
      </FormFooter>
    </div>
  );
}
