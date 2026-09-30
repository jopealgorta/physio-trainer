"use client";

import { useTranslations } from "next-intl";
import { useId, useState, type ComponentProps } from "react";
import type { ZodType } from "zod";

import { Input } from "@/components/ui/input";
import type { PrescriptionErrorCode } from "@/lib/prescription";
import { cn } from "@/lib/utils";

type Limits = { min: number; max: number };
type Parsed = { ok: true; value: number | null } | { ok: false; error: PrescriptionErrorCode };

/** Blank is `null`; anything else must be a whole number the field's zod schema accepts. */
function parse(schema: ZodType<number | null>, text: string): Parsed {
  const trimmed = text.trim();
  if (trimmed !== "" && !/^-?\d+$/.test(trimmed)) return { ok: false, error: "notAWholeNumber" };
  const result = schema.safeParse(trimmed);
  if (result.success) return { ok: true, value: result.data };
  const code = result.error.issues[0]?.message;
  return { ok: false, error: code === "outOfRange" ? "outOfRange" : "notAWholeNumber" };
}

/**
 * Whole-number input for the prescription fields. It emits a valid `number | null` and nothing
 * else: invalid text stays in the box (with its error) while the stored value keeps the last valid
 * number. `extraError` shows a cross-field error (e.g. max reps not above reps) in the same slot.
 */
export function NumberField({
  value,
  onValueChange,
  schema,
  limits,
  extraError,
  className,
  ...props
}: {
  value: number | null;
  onValueChange: (value: number | null) => void;
  schema: ZodType<number | null>;
  limits: Limits;
  extraError?: PrescriptionErrorCode | null;
} & Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type" | "inputMode">) {
  const t = useTranslations("Prescription.errors");
  const errorId = useId();
  const [draft, setDraft] = useState<string | null>(null);

  const parsed = draft === null ? null : parse(schema, draft);
  const code = parsed && !parsed.ok ? parsed.error : (extraError ?? null);
  const shown = draft ?? (value === null ? "" : String(value));

  return (
    <div className="grid min-w-0 gap-1">
      <Input
        {...props}
        type="text"
        inputMode="numeric"
        value={shown}
        aria-invalid={code !== null}
        aria-describedby={code !== null ? errorId : undefined}
        className={cn("min-w-0", className)}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          const next = parse(schema, text);
          if (next.ok) onValueChange(next.value);
        }}
        onBlur={() => {
          if (draft !== null && parse(schema, draft).ok) setDraft(null);
        }}
      />
      {code !== null ? (
        <p id={errorId} role="alert" className="text-destructive text-xs">
          {t(code, limits)}
        </p>
      ) : null}
    </div>
  );
}
