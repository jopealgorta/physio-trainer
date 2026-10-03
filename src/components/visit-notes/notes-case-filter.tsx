"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId } from "react";

import { usePendingNavigation } from "@/components/navigation-pending";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fromSelectValue, toSelectValue } from "@/lib/select-value";
import { notesHref, PAGE_SIZE } from "@/lib/visit-notes";

/** Filters the timeline by case; the choice lives in the URL (`?case=`). */
export function NotesCaseFilter({
  customerId,
  cases,
  caseId,
}: {
  customerId: string;
  cases: { id: string; title: string }[];
  caseId: string | null;
}) {
  const t = useTranslations("VisitNotes.filter");
  const router = useRouter();
  // The customer page's pending scope dims the timeline until the filtered one arrives.
  const { navigate } = usePendingNavigation();
  const id = useId();
  const current = cases.find((item) => item.id === caseId);

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="text-muted-foreground shrink-0 text-sm">
        {t("label")}
      </Label>
      <Select
        value={toSelectValue(caseId ?? "")}
        onValueChange={(next) => {
          // "" only comes from Radix's internal <select>, never from a choice.
          if (next === "") return;
          const chosen = fromSelectValue(next);
          navigate(() =>
            router.replace(
              notesHref(customerId, { caseId: chosen === "" ? null : chosen, limit: PAGE_SIZE }),
              { scroll: false },
            ),
          );
        }}
      >
        <SelectTrigger id={id} className="min-w-44">
          <SelectValue>{current ? current.title : t("all")}</SelectValue>
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value={toSelectValue("")}>{t("all")}</SelectItem>
          {cases.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
