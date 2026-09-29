"use client";

import { useTranslations } from "next-intl";
import { startTransition, useActionState, useId, useState, type FormEvent } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ACTIVITY_MAX,
  CUSTOMER_SEXES,
  EMAIL_MAX,
  FIRST_NAME_MAX,
  LAST_NAME_MAX,
  MEDICAL_HISTORY_MAX,
  OCCUPATION_MAX,
  PHONE_MAX,
  type CustomerSex,
} from "@/lib/customers";
import { languageOptions, type Locale } from "@/i18n/config";
import { fromSelectValue, toSelectValue } from "@/lib/select-value";
import type {
  CustomerField,
  CustomerFieldErrors,
  CustomerFormState,
} from "@/server/customers/schemas";

export type CustomerFormValues = {
  id?: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  sex: CustomerSex | null;
  occupation: string | null;
  activity: string | null;
  medicalHistory: string | null;
  locale: Locale;
};

const initialState: CustomerFormState = { status: "idle" };

const FORM_ERROR_CODES = [
  "nameRequired",
  "nameTooLong",
  "emailInvalid",
  "phoneTooLong",
  "dateInvalid",
  "sexInvalid",
  "localeInvalid",
  "tooLong",
  "invalid",
] as const;

const MAX_BY_FIELD: Record<CustomerField, number> = {
  firstName: FIRST_NAME_MAX,
  lastName: LAST_NAME_MAX,
  email: EMAIL_MAX,
  phone: PHONE_MAX,
  dateOfBirth: 0,
  sex: 0,
  occupation: OCCUPATION_MAX,
  activity: ACTIVITY_MAX,
  medicalHistory: MEDICAL_HISTORY_MAX,
  locale: 0,
};

// Locale always has a value, so it never opens the disclosure on its own (only an error does).
const DETAIL_VALUE_FIELDS = [
  "dateOfBirth",
  "sex",
  "occupation",
  "activity",
  "medicalHistory",
] as const satisfies readonly CustomerField[];
const DETAIL_FIELDS = [
  ...DETAIL_VALUE_FIELDS,
  "locale",
] as const satisfies readonly CustomerField[];

export function CustomerForm({
  action,
  defaults,
}: {
  action: (state: CustomerFormState, formData: FormData) => Promise<CustomerFormState>;
  defaults: CustomerFormValues;
}) {
  const t = useTranslations("Customers.form");
  const [state, formAction, pending] = useActionState(action, initialState);
  const id = useId();
  const editing = defaults.id !== undefined;
  const [sex, setSex] = useState<CustomerSex | "">(defaults.sex ?? "");
  const [locale, setLocale] = useState<Locale>(defaults.locale);
  const languages = languageOptions();

  const errors: CustomerFieldErrors = state.status === "error" ? state.fieldErrors : {};

  const message = (field: CustomerField) => {
    const code = errors[field];
    if (!code) return null;
    const known = FORM_ERROR_CODES.find((candidate) => candidate === code) ?? "invalid";
    return t(`errors.${known}`, { max: MAX_BY_FIELD[field] });
  };
  const errorId = (field: string) => `${id}-${field}-error`;
  const errorText = (field: CustomerField) => {
    const text = message(field);
    return text ? (
      <p id={errorId(field)} className="text-destructive text-sm">
        {text}
      </p>
    ) : null;
  };
  const invalid = (field: CustomerField) => errors[field] !== undefined;
  const describedBy = (field: CustomerField, hint?: string) => {
    const ids = [hint, errors[field] ? errorId(field) : undefined].filter(Boolean);
    return ids.length > 0 ? ids.join(" ") : undefined;
  };

  const detailsOpen =
    editing ||
    DETAIL_VALUE_FIELDS.some((field) => Boolean(defaults[field])) ||
    DETAIL_FIELDS.some((field) => errors[field] !== undefined);

  // React resets a form after its `action` resolves, wiping typed values. Dispatching from
  // onSubmit skips that reset; `action` stays for submits before hydration.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid max-w-2xl gap-6">
      {editing ? <input type="hidden" name="id" value={defaults.id} /> : null}

      <div className="grid gap-2">
        <Label htmlFor={`${id}-firstName`}>{t("firstName")}</Label>
        <Input
          id={`${id}-firstName`}
          name="firstName"
          defaultValue={defaults.firstName}
          maxLength={FIRST_NAME_MAX}
          autoComplete="off"
          required
          aria-invalid={invalid("firstName")}
          aria-describedby={describedBy("firstName")}
        />
        {errorText("firstName")}
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${id}-lastName`}>{t("lastName")}</Label>
        <Input
          id={`${id}-lastName`}
          name="lastName"
          defaultValue={defaults.lastName ?? ""}
          maxLength={LAST_NAME_MAX}
          autoComplete="off"
          aria-invalid={invalid("lastName")}
          aria-describedby={describedBy("lastName")}
        />
        {errorText("lastName")}
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${id}-email`}>{t("email")}</Label>
        <Input
          id={`${id}-email`}
          name="email"
          type="email"
          defaultValue={defaults.email ?? ""}
          maxLength={EMAIL_MAX}
          autoComplete="off"
          aria-invalid={invalid("email")}
          aria-describedby={describedBy("email")}
        />
        {errorText("email")}
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${id}-phone`}>{t("phone")}</Label>
        <Input
          id={`${id}-phone`}
          name="phone"
          type="tel"
          defaultValue={defaults.phone ?? ""}
          maxLength={PHONE_MAX}
          autoComplete="off"
          aria-invalid={invalid("phone")}
          aria-describedby={describedBy("phone", `${id}-phone-hint`)}
        />
        <p id={`${id}-phone-hint`} className="text-muted-foreground text-sm">
          {t("phoneHint")}
        </p>
        {errorText("phone")}
      </div>

      <details open={detailsOpen} className="grid">
        <summary className="cursor-pointer text-sm font-medium select-none">
          {t("moreDetails")}
        </summary>
        <div className="mt-6 grid gap-6">
          <div className="grid gap-2">
            <Label htmlFor={`${id}-dateOfBirth`}>{t("dateOfBirth")}</Label>
            <Input
              id={`${id}-dateOfBirth`}
              name="dateOfBirth"
              type="date"
              defaultValue={defaults.dateOfBirth ?? ""}
              aria-invalid={invalid("dateOfBirth")}
              aria-describedby={describedBy("dateOfBirth")}
            />
            {errorText("dateOfBirth")}
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${id}-sex`}>{t("sex")}</Label>
            <input type="hidden" name="sex" value={sex} />
            <Select
              value={toSelectValue(sex)}
              onValueChange={(next) => {
                // "" only comes from Radix's internal <select>, never from a choice.
                if (next === "") return;
                const value = fromSelectValue(next);
                setSex(CUSTOMER_SEXES.find((candidate) => candidate === value) ?? "");
              }}
            >
              <SelectTrigger
                id={`${id}-sex`}
                aria-invalid={invalid("sex")}
                aria-describedby={describedBy("sex")}
                className="w-full"
              >
                <SelectValue>{sex ? t(`sexes.${sex}`) : t("sexNone")}</SelectValue>
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value={toSelectValue("")}>{t("sexNone")}</SelectItem>
                {CUSTOMER_SEXES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`sexes.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errorText("sex")}
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${id}-occupation`}>{t("occupation")}</Label>
            <Input
              id={`${id}-occupation`}
              name="occupation"
              defaultValue={defaults.occupation ?? ""}
              maxLength={OCCUPATION_MAX}
              aria-invalid={invalid("occupation")}
              aria-describedby={describedBy("occupation")}
            />
            {errorText("occupation")}
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${id}-activity`}>{t("activity")}</Label>
            <Input
              id={`${id}-activity`}
              name="activity"
              defaultValue={defaults.activity ?? ""}
              maxLength={ACTIVITY_MAX}
              aria-invalid={invalid("activity")}
              aria-describedby={describedBy("activity")}
            />
            {errorText("activity")}
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${id}-medicalHistory`}>{t("medicalHistory")}</Label>
            <Textarea
              id={`${id}-medicalHistory`}
              name="medicalHistory"
              rows={5}
              defaultValue={defaults.medicalHistory ?? ""}
              maxLength={MEDICAL_HISTORY_MAX}
              aria-invalid={invalid("medicalHistory")}
              aria-describedby={describedBy("medicalHistory", `${id}-medicalHistory-hint`)}
            />
            <p id={`${id}-medicalHistory-hint`} className="text-muted-foreground text-sm">
              {t("medicalHistoryHint")}
            </p>
            {errorText("medicalHistory")}
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${id}-locale`}>{t("locale")}</Label>
            <input type="hidden" name="locale" value={locale} />
            <Select
              value={locale}
              onValueChange={(next) => {
                const option = languages.find((language) => language.value === next);
                if (option) setLocale(option.value);
              }}
            >
              <SelectTrigger
                id={`${id}-locale`}
                aria-invalid={invalid("locale")}
                aria-describedby={describedBy("locale")}
                className="w-full"
              >
                <SelectValue>
                  {languages.find((language) => language.value === locale)?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent position="popper">
                {languages.map((language) => (
                  <SelectItem key={language.value} value={language.value}>
                    {language.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errorText("locale")}
          </div>
        </div>
      </details>

      {state.status === "error" && state.formError ? (
        <Alert variant="destructive">
          <AlertDescription>{t(`errors.${state.formError}`)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t(editing ? "save" : "create")}
        </Button>
        {state.status === "saved" && !pending ? (
          <p role="status" className="text-muted-foreground text-sm">
            {t("saved")}
          </p>
        ) : null}
      </div>
    </form>
  );
}
