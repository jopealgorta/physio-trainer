"use client";

import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_SECTIONS, SECTION_NAME_MAX } from "@/lib/routines";

const CHIPS = ["warmUp", "mobility", "main", "coolDown"] as const;

/**
 * "Add section", below the last section: a name typed in (Enter or the button) or a localized
 * suggestion chip appends a section. Everything is disabled once the routine has `MAX_SECTIONS`.
 */
export function AddSection({ full, onAdd }: { full: boolean; onAdd: (name: string) => void }) {
  const t = useTranslations("Routines.sections");
  const id = useId();
  const [draft, setDraft] = useState("");
  const name = draft.trim();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (full || name.length === 0) return;
    onAdd(name);
    setDraft("");
  }

  return (
    <div
      role="group"
      aria-label={t("add")}
      className="grid min-w-0 gap-3 rounded-lg border border-dashed p-3"
    >
      <form onSubmit={submit} className="flex min-w-0 gap-2">
        <Label htmlFor={`${id}-name`} className="sr-only">
          {t("newName")}
        </Label>
        <Input
          id={`${id}-name`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t("newName")}
          maxLength={SECTION_NAME_MAX}
          disabled={full}
          autoComplete="off"
          enterKeyHint="done"
          aria-describedby={full ? `${id}-limit` : undefined}
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="outline" disabled={full || name.length === 0}>
          <PlusIcon aria-hidden />
          {t("add")}
        </Button>
      </form>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span id={`${id}-chips`} className="text-muted-foreground text-xs">
          {t("suggestions")}
        </span>
        {CHIPS.map((chip) => (
          <Button
            key={chip}
            type="button"
            variant="outline"
            size="sm"
            disabled={full}
            aria-describedby={`${id}-chips`}
            onClick={() => onAdd(t(`chips.${chip}`))}
          >
            {t(`chips.${chip}`)}
          </Button>
        ))}
      </div>
      {full ? (
        <p id={`${id}-limit`} className="text-muted-foreground text-xs">
          {t("limit", { max: MAX_SECTIONS })}
        </p>
      ) : null}
    </div>
  );
}
