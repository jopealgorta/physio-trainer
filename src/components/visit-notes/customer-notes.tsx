import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { SectionHeader } from "@/components/section-header";
import { LinkPendingHint } from "@/components/navigation-pending";
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
      <SectionHeader
        id="customer-notes-title"
        title={t("title")}
        description={t("tabDescription")}
        actions={
          <NoteSheet
            customerId={customerId}
            customerName={customerName}
            cases={cases}
            today={today}
          />
        }
      />

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
            className="relative"
          >
            {t("loadMore")}
            <LinkPendingHint className="inset-x-3 bottom-1" />
          </Link>
        </Button>
      ) : null}
    </section>
  );
}
