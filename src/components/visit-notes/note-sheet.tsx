"use client";

import { PencilIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { saveVisitNoteAction } from "@/server/visit-notes/actions";

import { shouldOpenNewNote } from "./new-note-shortcut";
import { NoteEditor, type NoteFormValues } from "./note-editor";

/**
 * "New note" / "Edit" button that opens the note editor in a sheet (full width on mobile).
 * The new-note button also answers to the `N` key while it is mounted (the Notes tab).
 */
export function NoteSheet({
  customerId,
  customerName,
  cases,
  today,
  note,
  dateLabel,
}: {
  customerId: string;
  customerName: string;
  cases: { id: string; title: string }[];
  /** The physio's calendar day (`YYYY-MM-DD`): the default visit date of a new note. */
  today: string;
  /** The note to edit; omit to write a new one. */
  note?: NoteFormValues;
  /** The edited note's formatted visit date, for the button's accessible name. */
  dateLabel?: string;
}) {
  const t = useTranslations("VisitNotes");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const editing = note !== undefined;

  useEffect(() => {
    if (editing) return;
    function onKeyDown(event: KeyboardEvent) {
      if (!shouldOpenNewNote(event)) return;
      event.preventDefault();
      setOpen(true);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [editing]);

  const defaults: NoteFormValues = note ?? {
    visitedOn: today,
    caseId: "",
    subjective: "",
    objective: "",
    assessment: "",
    plan: "",
    pain: "",
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant={editing ? "outline" : "default"}
          size={editing ? "sm" : "default"}
          aria-label={editing ? t("editFor", { date: dateLabel ?? "" }) : undefined}
        >
          {editing ? <PencilIcon aria-hidden /> : <PlusIcon aria-hidden />}
          {t(editing ? "edit" : "new")}
        </Button>
      </SheetTrigger>
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t(editing ? "sheetTitleEdit" : "sheetTitleNew")}</SheetTitle>
          <SheetDescription>{t("sheetDescription", { name: customerName })}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <NoteEditor
            action={saveVisitNoteAction}
            customerId={customerId}
            cases={cases}
            defaults={defaults}
            onSaved={() => {
              setOpen(false);
              router.refresh();
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
