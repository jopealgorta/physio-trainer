"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";

export type SortableHandleProps = { ref: (node: HTMLElement | null) => void } & Record<
  string,
  unknown
>;

/** Vertical drag-to-reorder list with keyboard support and translated announcements. */
export function SortableList<T extends { key: string }>({
  items,
  onReorder,
  label,
  renderItem,
  className,
}: {
  items: T[];
  onReorder: (items: T[]) => void;
  label: (item: T) => string;
  renderItem: (item: T, handle: SortableHandleProps) => ReactNode;
  className?: string;
}) {
  const t = useTranslations("Sortable");
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const position = (key: unknown) => items.findIndex((item) => item.key === key) + 1;
  const name = (key: unknown) => {
    const item = items.find((candidate) => candidate.key === key);
    return item ? label(item) : "";
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => t("picked", { item: name(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? t("moved", { item: name(active.id), position: position(over.id), total: items.length })
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? t("dropped", { item: name(active.id), position: position(over.id), total: items.length })
        : undefined,
    onDragCancel: ({ active }) => t("cancelled", { item: name(active.id) }),
  };

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    onReorder(arrayMove(items, position(active.id) - 1, position(over.id) - 1));
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{ announcements, screenReaderInstructions: { draggable: t("instructions") } }}
    >
      <SortableContext items={items.map((item) => item.key)} strategy={verticalListSortingStrategy}>
        <ul className={className}>
          {items.map((item) => (
            <SortableRow
              key={item.key}
              id={item.key}
              handleLabel={t("handle", { item: label(item) })}
            >
              {(handle) => renderItem(item, handle)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  handleLabel,
  children,
}: {
  id: string;
  handleLabel: string;
  children: (handle: SortableHandleProps) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "relative z-10 opacity-80" : undefined}
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
