"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { CategoryNode } from "@/lib/category-tree";
import { toSaveBlocks, type EditorBlock } from "@/lib/routine-editor";
import { validateHeader, type HeaderErrors } from "@/lib/routine-validation";
import { saveRoutineAction, type SaveRoutineActionError } from "@/server/routines/actions";
import type { ExerciseSummary } from "@/server/library/queries";

import { BlockList } from "./block-list";
import { RoutineHeader, type HeaderValues } from "./routine-header";
import { useUnsavedGuard } from "./use-unsaved-guard";

export type { HeaderValues } from "./routine-header";

export type RoutineEditorProps = {
  routine: {
    id: string;
    version: number;
    customerId: string;
    customerName: string;
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
 * with an optimistic version check. Task 11 fills the picker slot.
 */
export function RoutineEditor({ routine, initialBlocks }: RoutineEditorProps) {
  const t = useTranslations("Routines.editor");
  const router = useRouter();

  const [header, setHeader] = useState(routine.header);
  const [blocks, setBlocks] = useState(initialBlocks);
  const [version, setVersion] = useState(routine.version);
  const [snapshot, setSnapshot] = useState(() => snapshotOf(routine.header, initialBlocks));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<SaveError | null>(null);
  const [fieldErrors, setFieldErrors] = useState<HeaderErrors>({});
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // The page re-renders with fresh data after a conflict's Reload. Only then does a newer
  // version replace local state (someone else's change, which the user chose to load). Otherwise
  // it is the version we just saved ourselves (the action revalidates this page): record it and
  // keep any edits made while the save was in flight.
  const [seenVersion, setSeenVersion] = useState(routine.version);
  if (routine.version !== seenVersion) {
    setSeenVersion(routine.version);
    if (error === "conflict" && routine.version > version) {
      setHeader(routine.header);
      setBlocks(initialBlocks);
      setVersion(routine.version);
      setSnapshot(snapshotOf(routine.header, initialBlocks));
      setError(null);
      setFieldErrors({});
      setSavedAt(null);
    }
  }

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

  async function save() {
    if (saving || !dirty) return;
    const validation = validateHeader(header);
    if (!validation.ok) {
      setFieldErrors(validation.errors);
      return;
    }
    setFieldErrors({});
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
        customerId={routine.customerId}
        customerName={routine.customerName}
        cases={routine.cases}
        dirty={dirty}
        saving={saving}
        saved={savedAt !== null}
        onSave={save}
      />

      {error === "conflict" ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            {t("conflict")}
            <Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}>
              {t("reload")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_22rem]">
        <BlockList blocks={blocks} onChange={setBlocks} newKey={newKey} />
        <div data-testid="picker-slot" />
      </div>
    </div>
  );
}
