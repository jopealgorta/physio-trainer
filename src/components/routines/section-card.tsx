"use client";

import { EllipsisVerticalIcon, PencilIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import type { SortableHandleProps } from "@/components/sortable/sortable-list";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { SECTION_NAME_MAX } from "@/lib/routines";

import { DragHandle } from "./drag-handle";

/**
 * One section of the routine: drag handle, its name (renamed in place: pencil, then Enter or
 * blur confirms, Escape cancels), a menu (rename, move up/down, delete) and its blocks as
 * `children`. Deleting a section that holds exercises asks first; the only section can't be
 * deleted or moved (and shows no drag handle).
 */
export function SectionCard({
  name,
  itemCount,
  index,
  count,
  handle,
  onRename,
  onMove,
  onDelete,
  children,
}: {
  name: string;
  /** Exercises in this section (the delete confirmation names them). */
  itemCount: number;
  index: number;
  /** How many sections the routine has. */
  count: number;
  handle: SortableHandleProps;
  /** Takes a trimmed, valid name. */
  onRename: (name: string) => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("Routines.sections");
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // "Rename" from the menu: keep the menu from taking focus back from the input.
  const renaming = useRef(false);

  function remove() {
    if (itemCount > 0) setConfirming(true);
    else onDelete();
  }

  return (
    <section
      aria-label={name}
      data-testid="section-card"
      className="bg-muted/20 grid min-w-0 gap-3 rounded-xl border p-3"
    >
      <div className="flex min-w-0 items-center gap-2">
        {/* Nothing to reorder with one section. */}
        {count > 1 ? <DragHandle handle={handle} /> : null}
        <SectionName
          name={name}
          editing={editing}
          onEditingChange={setEditing}
          onRename={onRename}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto shrink-0"
              aria-label={t("menu")}
              data-section-menu
            >
              <EllipsisVerticalIcon aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-48"
            onCloseAutoFocus={(event) => {
              if (renaming.current) {
                renaming.current = false;
                event.preventDefault();
              }
            }}
          >
            <DropdownMenuItem
              onSelect={() => {
                renaming.current = true;
                setEditing(true);
              }}
            >
              {t("renameItem")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={index === 0} onSelect={() => onMove(-1)}>
              {t("moveUp")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={index === count - 1} onSelect={() => onMove(1)}>
              {t("moveDown")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={count <= 1} onSelect={remove}>
              {t("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {children}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle", { name, count: itemCount })}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onDelete}>
              {t("deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/** The section's name as a heading with a pencil, or the input that renames it. */
function SectionName({
  name,
  editing,
  onEditingChange,
  onRename,
}: {
  name: string;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onRename: (name: string) => void;
}) {
  const t = useTranslations("Routines.sections");
  const id = useId();
  const [draft, setDraft] = useState(name);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const pencil = useRef<HTMLButtonElement>(null);
  // Enter and Escape send the keyboard user back to the pencil; a click elsewhere keeps focus there.
  const refocus = useRef(false);
  // Escape unmounts the focused input, and its blur must not confirm what was cancelled.
  const closing = useRef(false);

  // Each edit starts from the current name (also when the menu's "Rename" opens it).
  const [wasEditing, setWasEditing] = useState(editing);
  if (editing !== wasEditing) {
    setWasEditing(editing);
    if (editing) {
      setDraft(name);
      setProblem(null);
    }
  }

  useEffect(() => {
    if (editing) {
      closing.current = false;
      input.current?.focus();
      input.current?.select();
    } else if (refocus.current) {
      refocus.current = false;
      pencil.current?.focus();
    }
  }, [editing]);

  function stop(viaKeyboard: boolean) {
    closing.current = true;
    refocus.current = viaKeyboard;
    setProblem(null);
    onEditingChange(false);
  }

  function confirm(viaKeyboard: boolean) {
    if (closing.current) return;
    const trimmed = draft.trim();
    if (trimmed.length === 0 || trimmed.length > SECTION_NAME_MAX) {
      setProblem(t("nameError", { max: SECTION_NAME_MAX }));
      return;
    }
    if (trimmed !== name) onRename(trimmed);
    stop(viaKeyboard);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      confirm(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      stop(true);
    }
  }

  if (editing) {
    const errorId = `${id}-error`;
    return (
      <div className="grid min-w-0 flex-1 gap-1">
        <Input
          ref={input}
          value={draft}
          maxLength={SECTION_NAME_MAX}
          onChange={(event) => {
            setDraft(event.target.value);
            setProblem(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => confirm(false)}
          aria-label={t("name")}
          aria-invalid={problem !== null}
          aria-describedby={problem ? errorId : undefined}
          autoComplete="off"
          enterKeyHint="done"
          className="h-8 font-semibold"
        />
        {problem ? (
          <p id={errorId} role="alert" className="text-destructive text-sm">
            {problem}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <h2 className="min-w-0 truncate text-base font-semibold">{name}</h2>
      <Button
        ref={pencil}
        type="button"
        variant="ghost"
        size="icon-lg"
        className="text-muted-foreground shrink-0"
        aria-label={t("rename", { name })}
        onClick={() => onEditingChange(true)}
      >
        <PencilIcon aria-hidden />
      </Button>
    </div>
  );
}
