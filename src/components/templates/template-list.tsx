"use client";

import { CalendarDaysIcon, DumbbellIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { StatusBadge } from "@/components/routines/status-badge";
import { WeekStrip } from "@/components/plans/week-strip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DEFAULT_PLAN_FILTERS, plansHref } from "@/lib/plan-params";
import { DEFAULT_ROUTINE_FILTERS, routinesHref } from "@/lib/routine-params";
import type { RoutineStatus } from "@/lib/routines";
import type { TemplateKind } from "@/lib/templates";
import { duplicateTemplateAction } from "@/server/templates/actions";

import { AssignTemplateDialog } from "./assign-template-dialog";
import { NewTemplateDialog } from "./new-template-dialog";
import { TemplateRowMenu } from "./template-row-menu";

/** A template as the list shows it. Routines carry `itemCount`, plans `sessionsPerDay` (Monday first). */
export type TemplateRow = {
  id: string;
  name: string;
  status: RoutineStatus;
  updatedAt: Date;
  itemCount?: number;
  sessionsPerDay?: number[];
};

const PATHS = { routine: "/routines", plan: "/plans" } as const;

/**
 * The physio's templates of one kind: a table from `md` up, cards below. A row menu duplicates
 * a template (and opens the copy).
 */
export function TemplateList({
  kind,
  rows,
  customers = [],
  timeZone,
}: {
  kind: TemplateKind;
  rows: TemplateRow[];
  /** Active customers a template can be assigned to; with none, the row menu has no Assign. */
  customers?: { id: string; name: string }[];
  /** The physio's time zone, so "Updated" shows their calendar day. */
  timeZone?: string;
}) {
  const t = useTranslations("Templates.list");
  const tRoutines = useTranslations("Routines.list");
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const [assigning, setAssigning] = useState<TemplateRow | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  const updated = (row: TemplateRow) =>
    format.dateTime(row.updatedAt, { dateStyle: "medium", timeZone });
  const detail = (row: TemplateRow) =>
    kind === "routine" ? (
      tRoutines("items", { count: row.itemCount ?? 0 })
    ) : (
      <WeekStrip sessionsPerDay={row.sessionsPerDay ?? []} />
    );

  const duplicate = (row: TemplateRow) => {
    setFailed(false);
    startTransition(async () => {
      const result = await duplicateTemplateAction({ kind, templateId: row.id });
      if (result.ok) router.push(`${PATHS[kind]}/${result.data.id}`);
      else setFailed(true);
    });
  };

  const menu = (row: TemplateRow) => (
    <TemplateRowMenu
      name={row.name}
      onAssign={
        customers.length > 0
          ? () => {
              setAssigning(row);
              setAssignOpen(true);
            }
          : undefined
      }
      onDuplicate={() => duplicate(row)}
      disabled={pending}
    />
  );
  const link = (row: TemplateRow) => (
    <Link
      href={`${PATHS[kind]}/${row.id}`}
      className="focus-visible:ring-ring/30 block min-w-0 truncate rounded-md font-medium outline-none hover:underline focus-visible:ring-2"
    >
      {row.name}
    </Link>
  );

  return (
    <div className="grid gap-3">
      {failed ? (
        <Alert variant="destructive">
          <AlertDescription>{t("duplicateFailed")}</AlertDescription>
        </Alert>
      ) : null}
      <table aria-label={t(`label.${kind}`)} className="hidden w-full table-fixed text-sm md:table">
        <thead>
          <tr className="text-muted-foreground border-b text-left text-xs">
            <th scope="col" className="w-1/3 py-2 pr-3 font-medium">
              {t("columns.name")}
            </th>
            <th scope="col" className="w-24 py-2 pr-3 font-medium">
              {t("columns.status")}
            </th>
            <th
              scope="col"
              className={kind === "plan" ? "w-48 py-2 pr-3" : "py-2 pr-3 font-medium"}
            >
              {kind === "routine" ? t("columns.exercises") : t("columns.week")}
            </th>
            <th scope="col" className="w-28 py-2 font-medium">
              {t("columns.updated")}
            </th>
            <th scope="col" className="w-10 py-2">
              <span className="sr-only">{t("columns.actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="min-w-0 py-2 pr-3">{link(row)}</td>
              <td className="py-2 pr-3">
                <StatusBadge status={row.status} />
              </td>
              <td className="py-2 pr-3">{detail(row)}</td>
              <td className="text-muted-foreground py-2">{updated(row)}</td>
              <td className="py-2 text-right">{menu(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="grid gap-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="grid min-w-0 gap-2 rounded-lg border p-3">
            <div className="flex min-w-0 items-center justify-between gap-2">
              {link(row)}
              <div className="flex shrink-0 items-center gap-1">
                <StatusBadge status={row.status} />
                {menu(row)}
              </div>
            </div>
            {kind === "plan" ? detail(row) : null}
            <p className="text-muted-foreground text-xs">
              {kind === "routine" ? `${detail(row)} · ${updated(row)}` : updated(row)}
            </p>
          </li>
        ))}
      </ul>
      {assigning ? (
        <AssignTemplateDialog
          key={assigning.id}
          kind={kind}
          template={{ id: assigning.id, name: assigning.name }}
          customers={customers}
          open={assignOpen}
          onOpenChange={setAssignOpen}
        />
      ) : null}
    </div>
  );
}

/** The physio has no templates of this kind yet. */
export function EmptyTemplates({ kind }: { kind: TemplateKind }) {
  const t = useTranslations("Templates.list.empty");
  const Icon = kind === "routine" ? DumbbellIcon : CalendarDaysIcon;
  return (
    <Card>
      <CardContent className="mx-auto grid max-w-md justify-items-center gap-3 py-10 text-center">
        <Icon aria-hidden className="text-primary size-8" />
        <h2 className="text-base font-semibold">{t(`${kind}.title`)}</h2>
        <p className="text-muted-foreground text-sm">{t(`${kind}.body`)}</p>
        <NewTemplateDialog kind={kind} />
      </CardContent>
    </Card>
  );
}

/** Filters matched nothing; "Clear filters" only appears when there is a filter to clear. */
export function NoTemplateResults({ kind, canClear }: { kind: TemplateKind; canClear: boolean }) {
  const t = useTranslations("Templates.list");
  const href =
    kind === "routine"
      ? routinesHref({ ...DEFAULT_ROUTINE_FILTERS, tab: "templates" })
      : plansHref({ ...DEFAULT_PLAN_FILTERS, tab: "templates" });
  return (
    <Card>
      <CardContent className="mx-auto grid max-w-md justify-items-center gap-3 py-10 text-center">
        <p className="text-muted-foreground text-sm">{t("noResults")}</p>
        {canClear ? (
          <Button asChild variant="outline">
            <Link href={href}>{t("clearFilters")}</Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
