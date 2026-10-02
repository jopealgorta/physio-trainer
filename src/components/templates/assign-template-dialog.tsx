"use client";

import { useTranslations } from "next-intl";
import { startTransition, useActionState, useId, useRef, useState, type FormEvent } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fromSelectValue, toSelectValue } from "@/lib/select-value";
import { ASSIGN_STATUSES, NAME_MAX, type AssignStatus, type TemplateKind } from "@/lib/templates";
import {
  assignTemplateAction,
  listCasesAction,
  type TemplateFormState,
} from "@/server/templates/actions";

const initialState: TemplateFormState = { status: "idle" };

const NAME_ERRORS = ["nameRequired", "nameTooLong"] as const;
const FORM_ERRORS = [
  "templateNotFound",
  "templateArchived",
  "customerNotFound",
  "customerArchived",
  "caseNotFound",
  "needsItems",
  "needsEntries",
  "invalid",
] as const;

type Named = { id: string; name: string };
type Case = { id: string; title: string };

export type AssignTemplateProps = {
  kind: TemplateKind;
  template: Named;
  /** The customer is fixed (their own page): no picker. */
  customer?: Named;
  /** Otherwise the customers to choose from. */
  customers?: Named[];
  /** The fixed customer's cases, so the form needs no round trip. */
  cases?: Case[];
};

/** "Assign to customer…" as a dialog the caller opens and closes. */
export function AssignTemplateDialog({
  open,
  onOpenChange,
  onCloseAutoFocus,
  ...form
}: AssignTemplateProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where focus goes on close (it has no trigger of its own). */
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const t = useTranslations("Templates.assign");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { name: form.template.name })}</DialogDescription>
        </DialogHeader>
        <AssignTemplateForm {...form} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * The assign form: customer (fixed or chosen), optional case, name and the status of the copy.
 * A successful assign redirects to the copy from the server action.
 */
export function AssignTemplateForm({
  kind,
  template,
  customer,
  customers = [],
  cases: initialCases = [],
  onCancel,
}: AssignTemplateProps & { onCancel: () => void }) {
  const t = useTranslations("Templates.assign");
  const tErrors = useTranslations("Templates.errors");
  const tStatus = useTranslations("Routines.status");
  const [state, formAction, pending] = useActionState(assignTemplateAction, initialState);
  const [customerId, setCustomerId] = useState(customer?.id ?? "");
  const [cases, setCases] = useState<Case[]>(initialCases);
  const [caseId, setCaseId] = useState("");
  const [status, setStatus] = useState<AssignStatus>("draft");
  const requests = useRef(0);
  const id = useId();

  // A slow answer for a customer that is no longer selected is dropped.
  function chooseCustomer(next: string) {
    setCustomerId(next);
    setCaseId("");
    setCases([]);
    const request = ++requests.current;
    listCasesAction(next)
      .then((list) => {
        if (requests.current === request) setCases(list);
      })
      .catch(() => {});
  }

  const nameCode =
    state.status === "error" && state.fieldErrors.name
      ? (NAME_ERRORS.find((code) => code === state.fieldErrors.name) ?? "nameRequired")
      : null;
  const formCode =
    state.status === "error" && state.formError
      ? (FORM_ERRORS.find((code) => code === state.formError) ?? "invalid")
      : null;
  const nameErrorId = `${id}-name-error`;

  // React resets a form after its `action` resolves, wiping typed values. Dispatching from
  // onSubmit skips that reset; `action` stays for submits before hydration.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  const customerNames = new Map(customers.map((item) => [item.id, item.name]));
  const caseTitles = new Map(cases.map((item) => [item.id, item.title]));

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-4">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="templateId" value={template.id} />
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="status" value={status} />

      {customer ? (
        <div className="grid gap-1">
          <p className="text-muted-foreground text-sm">{t("customer")}</p>
          <p className="text-sm font-medium">{customer.name}</p>
        </div>
      ) : (
        <div className="grid gap-2">
          <Label htmlFor={`${id}-customer`}>{t("customer")}</Label>
          <Select
            value={toSelectValue(customerId)}
            onValueChange={(next) => {
              // "" only comes from Radix's internal <select>, never from a choice (see select-value).
              if (next === "") return;
              chooseCustomer(fromSelectValue(next));
            }}
          >
            <SelectTrigger id={`${id}-customer`} className="w-full">
              <SelectValue>
                {customerId ? customerNames.get(customerId) : t("noCustomer")}
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
      )}

      {cases.length > 0 ? (
        <div className="grid gap-2">
          <Label htmlFor={`${id}-case`}>{t("case")}</Label>
          <Select
            value={toSelectValue(caseId)}
            onValueChange={(next) => {
              if (next === "") return;
              setCaseId(fromSelectValue(next));
            }}
          >
            <SelectTrigger id={`${id}-case`} className="w-full">
              <SelectValue>{caseId ? caseTitles.get(caseId) : t("noCase")}</SelectValue>
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value={toSelectValue("")}>{t("noCase")}</SelectItem>
              {cases.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor={`${id}-name`}>{t("name")}</Label>
        <Input
          id={`${id}-name`}
          name="name"
          defaultValue={template.name}
          maxLength={NAME_MAX[kind]}
          autoComplete="off"
          required
          aria-invalid={nameCode !== null}
          aria-describedby={nameCode ? nameErrorId : undefined}
        />
        {nameCode ? (
          <p id={nameErrorId} className="text-destructive text-sm">
            {tErrors(nameCode, { max: NAME_MAX[kind] })}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${id}-status`}>{t("status")}</Label>
        <Select
          value={status}
          onValueChange={(next) => {
            const found = ASSIGN_STATUSES.find((candidate) => candidate === next);
            if (found) setStatus(found);
          }}
        >
          <SelectTrigger id={`${id}-status`} className="w-full">
            <SelectValue>{tStatus(status)}</SelectValue>
          </SelectTrigger>
          <SelectContent position="popper">
            {ASSIGN_STATUSES.map((option) => (
              <SelectItem key={option} value={option}>
                {tStatus(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {formCode ? (
        <Alert variant="destructive">
          <AlertDescription>{tErrors(formCode)}</AlertDescription>
        </Alert>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t("submitting") : t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
