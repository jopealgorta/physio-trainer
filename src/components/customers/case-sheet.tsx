"use client";

import { PencilIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { saveCaseAction } from "@/server/customers/actions";

import { CaseForm, type CaseFormValues } from "./case-form";

const EMPTY_CASE: CaseFormValues = {
  title: "",
  diagnosis: null,
  bodyArea: null,
  side: null,
  injuryOn: null,
  surgeryOn: null,
  precautions: null,
  goals: null,
  initialPain: null,
  notes: null,
  openedOn: null,
};

/** "New case" / "Edit case" button that opens the case form in a side sheet. */
export function CaseSheet({
  customerId,
  customerName,
  case: existing,
}: {
  customerId: string;
  customerName: string;
  /** The case to edit; omit to create one for the customer. */
  case?: CaseFormValues;
}) {
  const t = useTranslations("Cases");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const editing = existing !== undefined;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant={editing ? "outline" : "default"}
          aria-label={editing ? t("editFor", { title: existing.title }) : undefined}
        >
          {editing ? <PencilIcon aria-hidden /> : <PlusIcon aria-hidden />}
          {t(editing ? "edit" : "new")}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t(editing ? "edit" : "new")}</SheetTitle>
          <SheetDescription>{t("sheetDescription", { name: customerName })}</SheetDescription>
        </SheetHeader>
        <div
          data-slot="form-scroll"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6"
        >
          <CaseForm
            action={saveCaseAction}
            customerId={customerId}
            defaults={existing ?? EMPTY_CASE}
            onSaved={() => {
              setOpen(false);
              router.refresh();
            }}
            onCancel={() => setOpen(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
