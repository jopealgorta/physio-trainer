import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { nextLimit, notesHref, type NotesFilters } from "@/lib/visit-notes";
import { withPhysio } from "@/server/auth/session";
import { listVisitNotes } from "@/server/visit-notes/queries";

import { NoteSheet } from "./note-sheet";
import { NotesCaseFilter } from "./notes-case-filter";
import { VisitNoteCard } from "./visit-note-card";

/** A customer's Notes tab: the visit-note timeline, a case filter and "New note". */
export async function CustomerNotes({
  customerId,
  customerName,
  cases,
  today,
  timeZone,
  filters,
}: {
  customerId: string;
  customerName: string;
  cases: { id: string; title: string }[];
  /** The physio's calendar day (`YYYY-MM-DD`). */
  today: string;
  timeZone: string;
  filters: NotesFilters;
}) {
  const t = await getTranslations("VisitNotes");
  // A filter on a case that isn't this customer's is treated as no filter.
  const caseId = cases.some((item) => item.id === filters.caseId) ? filters.caseId : null;
  const active: NotesFilters = { caseId, limit: filters.limit };
  const { notes, hasMore } = await withPhysio((tx, physioId) =>
    listVisitNotes(tx, physioId, customerId, active),
  );

  return (
    <section className="grid gap-4" aria-labelledby="customer-notes-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="customer-notes-title" className="text-lg font-semibold">
            {t("title")}
          </h2>
          <p className="text-muted-foreground text-sm">{t("tabDescription")}</p>
        </div>
        <NoteSheet
          customerId={customerId}
          customerName={customerName}
          cases={cases}
          today={today}
        />
      </div>

      {cases.length > 0 ? (
        <NotesCaseFilter customerId={customerId} cases={cases} caseId={caseId} />
      ) : null}

      {notes.length > 0 ? (
        <ol className="grid gap-3">
          {notes.map((note) => (
            <li key={note.id}>
              <VisitNoteCard
                note={{
                  id: note.id,
                  visitedOn: note.visitedOn,
                  caseId: note.caseId,
                  pain: note.pain,
                  subjective: note.subjective,
                  objective: note.objective,
                  assessment: note.assessment,
                  plan: note.plan,
                  createdAt: note.createdAt,
                  updatedAt: note.updatedAt,
                }}
                customerId={customerId}
                customerName={customerName}
                cases={cases}
                today={today}
                timeZone={timeZone}
              />
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          {caseId ? t("emptyFiltered") : t("empty", { name: customerName })}
        </p>
      )}

      {hasMore && nextLimit(active.limit) !== null ? (
        <Button asChild variant="outline" className="justify-self-center">
          <Link
            href={notesHref(customerId, active, { limit: nextLimit(active.limit)! })}
            scroll={false}
          >
            {t("loadMore")}
          </Link>
        </Button>
      ) : null}
    </section>
  );
}
