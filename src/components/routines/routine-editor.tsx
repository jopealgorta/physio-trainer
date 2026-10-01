"use client";

import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { CategoryNode } from "@/lib/category-tree";
import {
  addItem,
  canAddItem,
  flatItems,
  itemsWithInvalidSets,
  newItem,
  toSaveBlocks,
  type EditorBlock,
  type ExerciseRef,
} from "@/lib/routine-editor";
import { MAX_ITEMS } from "@/lib/routines";
import { validateHeader, type HeaderErrors } from "@/lib/routine-validation";
import { saveRoutineAction, type SaveRoutineActionError } from "@/server/routines/actions";
import type { ExerciseSummary } from "@/server/library/queries";

import { BlockList } from "./block-list";
import { ExercisePicker } from "./exercise-picker";
import { RoutineHeader, type HeaderValues } from "./routine-header";
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
  initialBlocks: EditorBlock[];
  categories: CategoryNode[];
  recent: ExerciseSummary[];
  exercises: ExerciseSummary[];
};

type SaveError = SaveRoutineActionError | "generic";

const newKey = () => crypto.randomUUID();

const snapshotOf = (header: HeaderValues, blocks: EditorBlock[]) =>
  JSON.stringify([header, toSaveBlocks(blocks)]);

/**
 * The routine editor: header fields, the block list and the exercise picker, saved as one unit
 * with an optimistic version check. The picker is a sticky side panel from `lg`, and a bottom
 * sheet (the same component) below it.
 */
export function RoutineEditor({
  routine,
  initialBlocks,
  categories,
  recent,
  exercises,
}: RoutineEditorProps) {
  const t = useTranslations("Routines.editor");
  const tPicker = useTranslations("Routines.picker");
  const router = useRouter();

  const [header, setHeader] = useState(routine.header);
  const [blocks, setBlocks] = useState(initialBlocks);
  const [version, setVersion] = useState(routine.version);
  const [snapshot, setSnapshot] = useState(() => snapshotOf(routine.header, initialBlocks));
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

  // Reload (after a conflict) asks the page for fresh data. Only once the user asked, and only
  // when the page holds a newer version than ours, does it replace local state (someone else's
  // change, which the user chose to load). A newer version without a request is either our own
  // save (the action revalidates this page) or background data: edits in progress are kept.
  if (reloadRequested && routine.version > version) {
    setReloadRequested(false);
    setHeader(routine.header);
    setBlocks(initialBlocks);
    setVersion(routine.version);
    setSnapshot(snapshotOf(routine.header, initialBlocks));
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

  const current = useMemo(() => snapshotOf(header, blocks), [header, blocks]);
  const dirty = current !== snapshot;
  useUnsavedGuard(dirty, t("leaveConfirm"));

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

  const pick = (exercise: ExerciseRef) =>
    setBlocks((previous) => addItem(previous, newItem(exercise, newKey)));
  const picker = (
    <ExercisePicker
      categories={categories}
      recent={recent}
      initial={exercises}
      disabledReason={canAddItem(blocks) ? null : tPicker("full", { max: MAX_ITEMS })}
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
        ...toSaveBlocks(blocks),
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
        dirty={dirty}
        saving={saving}
        saved={savedAt !== null}
        onSave={save}
        focusToken={focusToken}
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
            <Sheet>
              <SheetTrigger asChild>
                <Button type="button" variant="outline">
                  <PlusIcon aria-hidden />
                  {tPicker("open")}
                </Button>
              </SheetTrigger>
              {/* The title says it all (no description), and Done is the localized way out. */}
              <SheetContent
                side="bottom"
                showCloseButton={false}
                className="max-h-[85dvh]"
                aria-describedby={undefined}
              >
                <SheetHeader>
                  <SheetTitle>{tPicker("title")}</SheetTitle>
                </SheetHeader>
                <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-2">{picker}</div>
                <SheetFooter>
                  <SheetClose asChild>
                    <Button type="button">{tPicker("close")}</Button>
                  </SheetClose>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          </div>
          <BlockList
            blocks={blocks}
            onChange={setBlocks}
            newKey={newKey}
            expanded={expanded}
            invalid={invalidItems}
            onToggle={toggleExpanded}
          />
        </div>
        <aside
          aria-labelledby="picker-title"
          className="bg-card sticky top-6 hidden max-h-[calc(100dvh-3rem)] min-w-0 overflow-y-auto rounded-lg border p-4 lg:grid lg:gap-3"
        >
          <h2 id="picker-title" className="text-sm font-semibold">
            {tPicker("title")}
          </h2>
          {picker}
        </aside>
      </div>
    </div>
  );
}
