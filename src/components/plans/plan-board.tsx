"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PlusIcon } from "lucide-react";
import type { Route } from "next";
import { useLocale, useTranslations } from "next-intl";
import { useId, useOptimistic, useState, useTransition } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  dayHasRoom,
  groupByDay,
  MAX_ENTRIES_PER_DAY,
  moveEntry,
  summarizeWeek,
  WEEKDAYS,
  weekdayName,
  type Weekday,
} from "@/lib/plans";
import { cn } from "@/lib/utils";
import {
  addEntryAction,
  copyEntryAction,
  makeSeparateCopyAction,
  moveEntryAction,
  removeEntryAction,
  setEntryLabelAction,
} from "@/server/plans/actions";
import type { PlanEntryDetail, AttachableRoutine } from "@/server/plans/queries";
import type { PlanActionError } from "@/server/plans/schemas";

import { EntryCard } from "./entry-card";
import { AttachRoutineDialog, EntryLabelDialog, RemoveEntryDialog } from "./entry-dialogs";
import { EntryMenu } from "./entry-menu";
import { NewRoutineEntryDialog } from "./new-routine-entry-dialog";

type Entry = PlanEntryDetail;

type OptimisticChange =
  | { type: "move"; id: string; weekday: number; index: number }
  | { type: "label"; id: string; label: string | null }
  | { type: "remove"; id: string };

function applyChange(entries: Entry[], change: OptimisticChange): Entry[] {
  switch (change.type) {
    case "move":
      return moveEntry(entries, change.id, change.weekday, change.index) ?? entries;
    case "label":
      return entries.map((entry) =>
        entry.id === change.id ? { ...entry, label: change.label } : entry,
      );
    case "remove": {
      const rest = entries.filter((entry) => entry.id !== change.id);
      return groupByDay(rest).flatMap((day) =>
        day.map((entry, position) => ({ ...entry, position })),
      );
    }
  }
}

type Dialog =
  | { kind: "label"; entryId: string }
  | { kind: "remove"; entryId: string }
  | { kind: "attach"; weekday: Weekday }
  | { kind: "new"; weekday: Weekday };

const dayDroppableId = (weekday: number) => `day-${weekday}`;
const weekdayOfDroppable = (id: string | number) => {
  const match = /^day-([1-7])$/.exec(String(id));
  return match ? Number(match[1]) : null;
};

/**
 * The 7-day board (spec 06). Every change is one small server action and shows up at once
 * (optimistically); when the server refuses, the board falls back to what it holds and says
 * why. Drag (desktop) and the entry menu (everywhere) both go through the same `run`.
 */
export function PlanBoard({
  planId,
  entries: serverEntries,
  routines,
}: {
  planId: string;
  entries: PlanEntryDetail[];
  /** The routines that can be attached: the customer's, or the template routines for a template. */
  routines: AttachableRoutine[];
}) {
  const t = useTranslations("Plans.board");
  const locale = useLocale();
  const dndId = useId();
  const [entries, applyOptimistic] = useOptimistic(serverEntries, applyChange);
  const [, startAction] = useTransition();
  const [error, setError] = useState<PlanActionError | "generic" | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const days = groupByDay(entries);
  const summary = summarizeWeek(entries);
  const fullDays = new Set(
    WEEKDAYS.filter((weekday) => !dayHasRoom(entries, weekday)),
  ) as ReadonlySet<number>;
  const dayName = (weekday: number) => weekdayName(locale, weekday as Weekday);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /** Shows `change` at once, then runs the server action; a refusal rolls the board back. */
  function run(
    change: OptimisticChange | null,
    call: () => Promise<{ ok: true } | { ok: false; error: PlanActionError }>,
  ) {
    setError(null);
    startAction(async () => {
      if (change) applyOptimistic(change);
      try {
        const result = await call();
        if (!result.ok) setError(result.error);
      } catch {
        setError("generic");
      }
    });
  }

  const move = (entryId: string, weekday: number, index: number) =>
    run({ type: "move", id: entryId, weekday, index }, () =>
      moveEntryAction({ planId, entryId, weekday, index }),
    );

  const shiftWithinDay = (entry: Entry, delta: -1 | 1) => {
    const index = days[entry.weekday - 1].findIndex((candidate) => candidate.id === entry.id);
    move(entry.id, entry.weekday, index + delta);
  };

  function onDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id));
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const entryId = String(active.id);
    const overDay = weekdayOfDroppable(over.id);
    if (overDay !== null) {
      // Dropped on a day's empty area (or below its cards): append.
      const length = days[overDay - 1].filter((entry) => entry.id !== entryId).length;
      move(entryId, overDay, length);
      return;
    }
    const target = byId.get(String(over.id));
    if (!target) return;
    const index = days[target.weekday - 1].findIndex((entry) => entry.id === target.id);
    move(entryId, target.weekday, index);
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      t("dnd.picked", { item: byId.get(String(active.id))?.routineName ?? "" }),
    onDragOver: ({ active, over }) => announce("dnd.moved", active.id, over?.id),
    onDragEnd: ({ active, over }) => announce("dnd.dropped", active.id, over?.id),
    onDragCancel: ({ active }) =>
      t("dnd.cancelled", { item: byId.get(String(active.id))?.routineName ?? "" }),
  };
  function announce(
    key: "dnd.moved" | "dnd.dropped",
    activeKey: string | number,
    overKey?: string | number,
  ) {
    if (overKey === undefined) return undefined;
    const item = byId.get(String(activeKey))?.routineName ?? "";
    const overDay = weekdayOfDroppable(overKey);
    const target = overDay === null ? byId.get(String(overKey)) : null;
    const weekday = overDay ?? target?.weekday;
    if (!weekday) return undefined;
    const list = days[weekday - 1];
    const position =
      overDay !== null ? list.length : list.findIndex((entry) => entry.id === target?.id) + 1;
    return t(key, {
      item,
      day: dayName(weekday),
      position,
      total: Math.max(list.length, position),
    });
  }

  const activeEntry = activeId ? byId.get(activeId) : undefined;
  const dialogEntry =
    dialog && (dialog.kind === "label" || dialog.kind === "remove")
      ? byId.get(dialog.entryId)
      : undefined;

  const cardData = (entry: Entry) => ({
    id: entry.id,
    label: entry.label,
    routineId: entry.routineId,
    routineName: entry.routineName,
    routineStatus: entry.routineStatus,
    exerciseCount: entry.exerciseCount,
    shared: entry.routineEntryCount,
  });

  function requestRemove(entry: Entry) {
    // The last reference to a routine that exists only for the plan asks about deleting it.
    if (entry.routineEntryCount <= 1 && !entry.routineIsStandalone) {
      setDialog({ kind: "remove", entryId: entry.id });
      return;
    }
    removeEntry(entry, false);
  }

  const removeEntry = (entry: Entry, deleteRoutine: boolean) =>
    run({ type: "remove", id: entry.id }, () =>
      removeEntryAction({ planId, entryId: entry.id, deleteRoutine }),
    );

  return (
    <section aria-labelledby={`${dndId}-week`} className="grid gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${dndId}-week`} className="text-lg font-semibold">
          {t("week")}
        </h2>
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {[
            t("summary.routines", { count: summary.totalSessions }),
            t("summary.exercises", { count: summary.totalExercises }),
            t("summary.days", { count: summary.activeDays }),
          ].join(" · ")}
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{t(`errors.${error}`, { max: MAX_ENTRIES_PER_DAY })}</AlertDescription>
        </Alert>
      ) : null}

      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: t("dnd.instructions") },
        }}
      >
        <div className="grid gap-3 lg:auto-cols-[minmax(11rem,1fr)] lg:grid-flow-col lg:overflow-x-auto lg:pb-2">
          {WEEKDAYS.map((weekday) => {
            const dayEntries = days[weekday - 1];
            return (
              <DayColumn
                key={weekday}
                weekday={weekday}
                name={dayName(weekday)}
                count={dayEntries.length}
                full={fullDays.has(weekday)}
                onAddExisting={() => setDialog({ kind: "attach", weekday })}
                onAddNew={() => setDialog({ kind: "new", weekday })}
              >
                <SortableContext
                  items={dayEntries.map((entry) => entry.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="grid gap-2">
                    {dayEntries.map((entry, index) => (
                      <SortableEntry
                        key={entry.id}
                        id={entry.id}
                        handleLabel={t("dnd.handle", { item: entry.routineName })}
                      >
                        {(handle) => (
                          <EntryCard
                            entry={cardData(entry)}
                            planId={planId}
                            handle={handle}
                            menu={
                              <EntryMenu
                                routineName={entry.routineName}
                                routineHref={`/routines/${entry.routineId}?plan=${planId}` as Route}
                                weekday={entry.weekday}
                                fullDays={fullDays}
                                canMoveUp={index > 0}
                                canMoveDown={index < dayEntries.length - 1}
                                canSeparateCopy={
                                  entry.routineEntryCount > 1 || entry.routineIsStandalone
                                }
                                actions={{
                                  editLabel: () => setDialog({ kind: "label", entryId: entry.id }),
                                  moveTo: (to) => move(entry.id, to, MAX_ENTRIES_PER_DAY),
                                  copyTo: (to) =>
                                    run(null, () =>
                                      copyEntryAction({ planId, entryId: entry.id, weekday: to }),
                                    ),
                                  moveUp: () => shiftWithinDay(entry, -1),
                                  moveDown: () => shiftWithinDay(entry, 1),
                                  separateCopy: () =>
                                    run(null, () =>
                                      makeSeparateCopyAction({ planId, entryId: entry.id }),
                                    ),
                                  remove: () => requestRemove(entry),
                                }}
                              />
                            }
                            className={activeId === entry.id ? "opacity-40" : undefined}
                          />
                        )}
                      </SortableEntry>
                    ))}
                  </ul>
                </SortableContext>
              </DayColumn>
            );
          })}
        </div>
        <DragOverlay>
          {activeEntry ? (
            <EntryCard
              entry={cardData(activeEntry)}
              planId={planId}
              handle={null}
              menu={null}
              className="shadow-md"
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      <EntryLabelDialog
        open={dialog?.kind === "label" && dialogEntry !== undefined}
        onOpenChange={(open) => !open && setDialog(null)}
        routineName={dialogEntry?.routineName ?? ""}
        initialLabel={dialogEntry?.label ?? null}
        onSave={(label) => {
          if (!dialogEntry) return;
          run({ type: "label", id: dialogEntry.id, label }, () =>
            setEntryLabelAction({ planId, entryId: dialogEntry.id, label }),
          );
        }}
      />
      <RemoveEntryDialog
        open={dialog?.kind === "remove" && dialogEntry !== undefined}
        onOpenChange={(open) => !open && setDialog(null)}
        routineName={dialogEntry?.routineName ?? ""}
        dayName={dialogEntry ? dayName(dialogEntry.weekday) : ""}
        onConfirm={(deleteRoutine) => {
          if (dialogEntry) removeEntry(dialogEntry, deleteRoutine);
        }}
      />
      <AttachRoutineDialog
        open={dialog?.kind === "attach"}
        onOpenChange={(open) => !open && setDialog(null)}
        dayName={dialog?.kind === "attach" ? dayName(dialog.weekday) : ""}
        routines={routines}
        onAdd={({ routineId, label, standalone }) => {
          if (dialog?.kind !== "attach") return;
          const weekday = dialog.weekday;
          run(null, () =>
            addEntryAction({
              planId,
              weekday,
              routineId,
              label,
              ...(standalone === undefined ? {} : { standalone }),
            }),
          );
        }}
      />
      <NewRoutineEntryDialog
        open={dialog?.kind === "new"}
        onOpenChange={(open) => !open && setDialog(null)}
        planId={planId}
        weekday={dialog?.kind === "new" ? dialog.weekday : 1}
        dayName={dialog?.kind === "new" ? dayName(dialog.weekday) : ""}
      />
    </section>
  );
}

function DayColumn({
  weekday,
  name,
  count,
  full,
  onAddExisting,
  onAddNew,
  children,
}: {
  weekday: number;
  name: string;
  count: number;
  full: boolean;
  onAddExisting: () => void;
  onAddNew: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("Plans.board.day");
  const headingId = useId();
  const { setNodeRef, isOver } = useDroppable({ id: dayDroppableId(weekday) });

  return (
    <section
      aria-labelledby={headingId}
      data-weekday={weekday}
      className={cn(
        "bg-muted/40 grid content-start gap-2 rounded-lg border p-2 transition-colors",
        isOver && "border-primary/50 bg-primary/5",
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={headingId} className="truncate text-sm font-semibold capitalize">
            {name}
          </h3>
          <p className="text-muted-foreground text-xs">
            {count === 0 ? t("rest") : t("count", { count })}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={full}
              aria-label={t("add", { day: name })}
              title={full ? t("full", { max: MAX_ENTRIES_PER_DAY }) : t("add", { day: name })}
            >
              <PlusIcon aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onAddExisting}>{t("addExisting")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={onAddNew}>{t("addNew")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      {/* The droppable covers the whole list so an empty day can still receive a card. */}
      <div ref={setNodeRef} className="min-h-10 rounded-md">
        {children}
      </div>
    </section>
  );
}

function SortableEntry({
  id,
  handleLabel,
  children,
}: {
  id: string;
  handleLabel: string;
  children: (
    handle: {
      ref: (node: HTMLElement | null) => void;
    } & Record<string, unknown>,
  ) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } =
    useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="min-w-0"
    >
      {children({
        ...attributes,
        ...listeners,
        ref: setActivatorNodeRef,
        "aria-label": handleLabel,
      })}
    </li>
  );
}
