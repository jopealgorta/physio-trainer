"use client";

import { ArrowLeftIcon, HistoryIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";

import { usePageAction, usePageNotice } from "@/components/page-actions";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { diffPlans, diffRoutines, type PlanDiff, type RoutineDiff } from "@/lib/history/diff";
import type { PlanSnapshot, RoutineSnapshot } from "@/lib/history/snapshot";
import { fromSelectValue, toSelectValue } from "@/lib/select-value";
import {
  getSnapshotsAction,
  listVersionsAction,
  restoreVersionAction,
} from "@/server/history/actions";
import type { RestoreError, VersionMeta } from "@/server/history/schemas";

import { PlanDiffView } from "./plan-diff-view";
import { RoutineDiffView } from "./routine-diff-view";
import { useVersionDate, VersionList } from "./version-list";

type Diff = { kind: "routine"; diff: RoutineDiff } | { kind: "plan"; diff: PlanDiff };
type Loadable<T> = { state: "loading" } | { state: "error" } | { state: "ready"; value: T };
type ShownError = "needsItems" | "needsEntries" | "conflict" | "generic";

const shownError = (error: RestoreError | "generic"): ShownError =>
  error === "needsItems" || error === "needsEntries" || error === "conflict" ? error : "generic";

/**
 * The "History" button of a routine or plan (spec 15): a side sheet listing its versions; a
 * version opens a diff against another one (the current one by default) and can be restored.
 * After a restore the sheet closes, says so next to the button and calls `onRestored`
 * (default: refresh the page, for Server Component pages that cannot pass a callback).
 */
export function HistorySheet({
  kind,
  id,
  dirty = false,
  onRestored,
}: {
  kind: "routine" | "plan";
  id: string;
  /** The editor has unsaved changes: the restore confirmation warns that they are discarded. */
  dirty?: boolean;
  onRestored?: () => void;
}) {
  const t = useTranslations("History");
  const router = useRouter();
  const date = useVersionDate();
  const compareId = useId();

  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<Loadable<VersionMeta[]>>({ state: "loading" });
  const [selected, setSelected] = useState<number | null>(null);
  const [compare, setCompare] = useState<number | null>(null);
  const [diff, setDiff] = useState<Loadable<Diff> | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<ShownError | null>(null);
  const [restored, setRestored] = useState<{ dropped: number } | null>(null);
  // Only the latest request may land: an older answer would show the wrong pair.
  const request = useRef(0);

  async function loadVersions() {
    const token = ++request.current;
    setVersions({ state: "loading" });
    try {
      const result = await listVersionsAction({ kind, id });
      if (token !== request.current) return;
      setVersions(result.ok ? { state: "ready", value: result.data } : { state: "error" });
    } catch {
      if (token === request.current) setVersions({ state: "error" });
    }
  }

  async function loadDiff(a: number, b: number | null) {
    const token = ++request.current;
    if (b === null) {
      setDiff(null);
      return;
    }
    const [older, newer] = a < b ? [a, b] : [b, a];
    setDiff({ state: "loading" });
    try {
      const result = await getSnapshotsAction({ kind, id, versions: [older, newer] });
      if (token !== request.current) return;
      if (!result.ok) {
        setDiff({ state: "error" });
        return;
      }
      const before = result.data[older];
      const after = result.data[newer];
      setDiff({
        state: "ready",
        value:
          kind === "routine"
            ? {
                kind,
                diff: diffRoutines(before as RoutineSnapshot, after as RoutineSnapshot),
              }
            : { kind, diff: diffPlans(before as PlanSnapshot, after as PlanSnapshot) },
      });
    } catch {
      if (token === request.current) setDiff({ state: "error" });
    }
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setSelected(null);
    setDiff(null);
    setRestoreError(null);
    setRestored(null);
    void loadVersions();
  }

  const list = versions.state === "ready" ? versions.value : [];
  const current = list[0]?.version ?? null;
  const metaOf = (version: number | null) => list.find((meta) => meta.version === version);
  const optionLabel = (meta: VersionMeta) =>
    meta.version === current ? t("currentOption", { date: date(meta.at) }) : date(meta.at);

  function select(version: number) {
    // The current version compares with the one before it; any other with the current one.
    const other = version === current ? (list[1]?.version ?? null) : current;
    setSelected(version);
    setCompare(other);
    setRestoreError(null);
    void loadDiff(version, other);
  }

  function back() {
    request.current++;
    setSelected(null);
    setDiff(null);
    setRestoreError(null);
  }

  async function restore() {
    if (selected === null || restoring) return;
    // Back and the compare select are disabled meanwhile, but the sheet can be closed and
    // reopened on another version: a refusal then belongs to a view that is gone.
    const token = request.current;
    setRestoring(true);
    setRestoreError(null);
    try {
      const result = await restoreVersionAction({ kind, id, version: selected });
      if (result.ok) {
        // Reported whatever is on screen now: the content did change.
        setOpen(false);
        setRestored({ dropped: result.data.dropped });
        if (onRestored) onRestored();
        else router.refresh();
      } else if (token === request.current) {
        setRestoreError(shownError(result.error));
      }
    } catch {
      if (token === request.current) setRestoreError("generic");
    } finally {
      setRestoring(false);
    }
  }

  const selectedMeta = metaOf(selected);
  const restoredText = restored
    ? [
        t("restored"),
        restored.dropped > 0
          ? t(kind === "routine" ? "restoredDroppedExercises" : "restoredDroppedRoutines", {
              count: restored.dropped,
            })
          : null,
      ]
        .filter(Boolean)
        .join(" ")
    : null;
  const { onCloseAutoFocus } = usePageAction("history", {
    label: t("button"),
    order: 20,
    icon: <HistoryIcon aria-hidden />,
    opensDialog: true,
    onSelect: () => onOpenChange(true),
  });
  usePageNotice("history", restoredText ? { text: restoredText, tone: "info" } : null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Kept in the accessibility tree for announcements, out of the layout while empty. */}
      <p role="status" className="text-muted-foreground text-sm empty:sr-only">
        {restoredText}
      </p>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger asChild>
          <Button type="button" variant="outline">
            <HistoryIcon aria-hidden />
            {t("button")}
          </Button>
        </SheetTrigger>
        <SheetContent
          className="data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <SheetHeader>
            <SheetTitle>{t("title")}</SheetTitle>
            <SheetDescription>{t("description")}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            {versions.state === "loading" ? (
              <p className="text-muted-foreground text-sm">{t("loading")}</p>
            ) : versions.state === "error" ? (
              <Alert variant="destructive">
                <AlertDescription>{t("loadError")}</AlertDescription>
              </Alert>
            ) : selectedMeta === undefined ? (
              list.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("empty")}</p>
              ) : (
                <VersionList target={kind} versions={list} onSelect={select} />
              )
            ) : (
              <div className="grid gap-4">
                <div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={restoring}
                    onClick={back}
                  >
                    <ArrowLeftIcon aria-hidden />
                    {t("back")}
                  </Button>
                </div>
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {date(selectedMeta.at)}
                  {selectedMeta.version === current ? <Badge>{t("current")}</Badge> : null}
                </p>

                {compare === null ? (
                  <p className="text-muted-foreground text-sm">{t("onlyVersion")}</p>
                ) : (
                  <div className="grid gap-2">
                    <Label htmlFor={compareId}>{t("compareWith")}</Label>
                    <Select
                      value={toSelectValue(String(compare))}
                      disabled={restoring}
                      onValueChange={(next) => {
                        // "" only comes from Radix's internal <select> (see select-value).
                        if (next === "") return;
                        const version = Number(fromSelectValue(next));
                        if (!Number.isInteger(version) || version === compare) return;
                        setCompare(version);
                        void loadDiff(selectedMeta.version, version);
                      }}
                    >
                      <SelectTrigger id={compareId} className="w-full">
                        <SelectValue>
                          {metaOf(compare) ? optionLabel(metaOf(compare)!) : null}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {list
                          .filter((meta) => meta.version !== selectedMeta.version)
                          .map((meta) => (
                            <SelectItem
                              key={meta.version}
                              value={toSelectValue(String(meta.version))}
                            >
                              {optionLabel(meta)}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {diff === null ? null : diff.state === "loading" ? (
                  <p className="text-muted-foreground text-sm">{t("loading")}</p>
                ) : diff.state === "error" ? (
                  <Alert variant="destructive">
                    <AlertDescription>{t("loadError")}</AlertDescription>
                  </Alert>
                ) : diff.value.kind === "routine" ? (
                  <RoutineDiffView diff={diff.value.diff} />
                ) : (
                  <PlanDiffView diff={diff.value.diff} />
                )}

                {restoreError ? (
                  <Alert variant="destructive">
                    <AlertDescription>{t(`errors.${restoreError}`)}</AlertDescription>
                  </Alert>
                ) : null}

                {selectedMeta.version === current ? null : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button type="button" disabled={restoring} className="justify-self-start">
                        {restoring ? t("restoring") : t("restore")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("restoreTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("restoreBody")}
                          {dirty ? (
                            <>
                              {" "}
                              <strong className="text-foreground font-medium">
                                {t("restoreUnsaved")}
                              </strong>
                            </>
                          ) : null}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => void restore()}>
                          {t("restoreConfirm")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
