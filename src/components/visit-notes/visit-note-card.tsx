"use client";

import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CALENDAR_DATE_FORMAT, calendarDateToDate } from "@/lib/calendar-date";
import { cn } from "@/lib/utils";
import { needsExpand, SOAP_FIELDS, wasEdited } from "@/lib/visit-notes";
import { deleteVisitNoteAction } from "@/server/visit-notes/actions";

import { NoteSheet } from "./note-sheet";

/** A note as the timeline shows it (serialisable, so it can cross the server/client boundary). */
export type VisitNoteView = {
  id: string;
  visitedOn: string;
  caseId: string | null;
  pain: number | null;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function VisitNoteCard({
  note,
  customerId,
  customerName,
  cases,
  today,
  timeZone,
}: {
  note: VisitNoteView;
  customerId: string;
  customerName: string;
  cases: { id: string; title: string }[];
  today: string;
  timeZone: string;
}) {
  const t = useTranslations("VisitNotes");
  const format = useFormatter();
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<"notFound" | "unknown" | null>(null);

  const date = format.dateTime(calendarDateToDate(note.visitedOn), CALENDAR_DATE_FORMAT);
  const caseTitle = cases.find((item) => item.id === note.caseId)?.title ?? null;
  const sections = SOAP_FIELDS.filter((field) => (note[field] ?? "").trim() !== "");
  const expandable = needsExpand(note);
  const bodyId = `note-${note.id}-body`;

  function remove() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteVisitNoteAction(note.id);
        if (result.ok) router.refresh();
        else setError(result.error);
      } catch {
        setError("unknown");
      }
    });
  }

  return (
    <Card>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1.5">
            <h3 className="text-base font-semibold">{date}</h3>
            <div className="flex flex-wrap items-center gap-2">
              {caseTitle ? <Badge variant="secondary">{caseTitle}</Badge> : null}
              {note.pain !== null ? (
                <Badge variant="outline">{t("painValue", { value: note.pain })}</Badge>
              ) : null}
              {wasEdited(note.createdAt, note.updatedAt) ? (
                <span className="text-muted-foreground text-xs">
                  {t("edited", {
                    date: format.dateTime(note.updatedAt, { dateStyle: "medium", timeZone }),
                  })}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <NoteSheet
              customerId={customerId}
              customerName={customerName}
              cases={cases}
              today={today}
              dateLabel={date}
              note={{
                id: note.id,
                visitedOn: note.visitedOn,
                caseId: note.caseId ?? "",
                subjective: note.subjective ?? "",
                objective: note.objective ?? "",
                assessment: note.assessment ?? "",
                plan: note.plan ?? "",
                pain: note.pain === null ? "" : String(note.pain),
              }}
            />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  aria-label={t("deleteFor", { date })}
                >
                  {t("delete")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("deleteBody")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={remove}>
                    {t("deleteConfirm")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <dl id={bodyId} className="grid gap-3">
          {sections.map((field) => (
            <div key={field} className="grid gap-0.5">
              <dt className="text-muted-foreground text-xs font-medium">
                {t(`soap.${field}.label`)}
              </dt>
              <dd
                className={cn(
                  "text-sm wrap-anywhere whitespace-pre-wrap",
                  !expanded && "line-clamp-2",
                )}
              >
                {note[field]}
              </dd>
            </div>
          ))}
        </dl>

        {expandable ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-self-start"
            aria-expanded={expanded}
            aria-controls={bodyId}
            onClick={() => setExpanded((value) => !value)}
          >
            {t(expanded ? "collapse" : "expand")}
          </Button>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
