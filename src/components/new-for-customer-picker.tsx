"use client";

import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useId, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fromSelectValue, toSelectValue } from "@/lib/select-value";
import { createPlanAction, type CreatePlanFormState } from "@/server/plans/actions";
import { createRoutineAction, type CreateRoutineFormState } from "@/server/routines/actions";

type FormState = CreateRoutineFormState | CreatePlanFormState;

const initialState: FormState = { status: "idle" };

const FORM_ERRORS = ["customerNotFound", "invalid"] as const;

const ACTIONS = { routine: createRoutineAction, plan: createPlanAction } as const;

const NAMESPACES = { routine: "Routines.new", plan: "Plans.new" } as const;

type Kind = keyof typeof ACTIONS;

type Customer = { id: string; name: string };

/**
 * "New routine" or "New plan" from its list: asks only for the customer, then creates a draft with
 * a default name and no case; the server action redirects to the editor.
 */
export function NewForCustomerPicker({ kind, customers }: { kind: Kind; customers: Customer[] }) {
  const t = useTranslations(NAMESPACES[kind]);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button">
          <PlusIcon aria-hidden /> {t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("pick.title")}</DialogTitle>
        </DialogHeader>
        <PickerForm kind={kind} customers={customers} />
      </DialogContent>
    </Dialog>
  );
}

function PickerForm({ kind, customers }: { kind: Kind; customers: Customer[] }) {
  const t = useTranslations(NAMESPACES[kind]);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    ACTIONS[kind],
    initialState,
  );
  const [customerId, setCustomerId] = useState("");
  const id = useId();

  const formCode =
    state.status === "error"
      ? (FORM_ERRORS.find((code) => code === state.formError) ?? "invalid")
      : null;
  const customerNames = new Map(customers.map((item) => [item.id, item.name]));

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="name" value={t("defaultName")} />
      <div className="grid gap-2">
        <Label htmlFor={`${id}-customer`}>{t("pick.customer")}</Label>
        <Select
          value={toSelectValue(customerId)}
          onValueChange={(next) => {
            // "" only comes from Radix's internal <select>, never from a choice (see select-value).
            if (next === "") return;
            setCustomerId(fromSelectValue(next));
          }}
        >
          <SelectTrigger id={`${id}-customer`} className="w-full">
            <SelectValue>
              {customerId ? customerNames.get(customerId) : t("pick.noCustomer")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent position="popper">
            {customers.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {formCode ? (
        <Alert variant="destructive">
          <AlertDescription>{t(`errors.${formCode}`)}</AlertDescription>
        </Alert>
      ) : null}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            {t("pick.cancel")}
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending || customerId === ""}>
          {pending ? t("creating") : t("pick.create")}
        </Button>
      </DialogFooter>
    </form>
  );
}
