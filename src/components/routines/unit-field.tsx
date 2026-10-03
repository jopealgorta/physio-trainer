"use client";

import { useTranslations } from "next-intl";
import { useId, useState, type ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import type { PrescriptionErrorCode } from "@/lib/prescription";
import { cn } from "@/lib/utils";

/** `undefined` = invalid text, `null` = blank. */
type Parse = (text: string) => number | null | undefined;

/**
 * Text input for a number typed in a friendly unit (minutes as "1:30", km as "2,5"). It keeps
 * the typed text locally and only emits a valid `number | null`; invalid text stays in the box
 * with its error until blur, when the box goes back to the stored value.
 */
export function UnitField({
  value,
  parse,
  format,
  errorCode,
  onValueChange,
  className,
  ...props
}: {
  value: number | null;
  parse: Parse;
  format: (value: number | null) => string;
  errorCode: PrescriptionErrorCode;
  onValueChange: (value: number | null) => void;
} & Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type">) {
  const t = useTranslations("Prescription.errors");
  const errorId = useId();
  const [draft, setDraft] = useState<string | null>(null);

  // A draft that no longer parses to the stored value (set changed from outside) is stale.
  const [seenValue, setSeenValue] = useState(value);
  if (value !== seenValue) {
    setSeenValue(value);
    if (draft !== null && parse(draft) !== value) setDraft(null);
  }

  const invalid = draft !== null && parse(draft) === undefined;
  return (
    <div className="grid min-w-0 gap-1">
      <Input
        {...props}
        type="text"
        value={draft ?? format(value)}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        className={cn("min-w-0", className)}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          const next = parse(text);
          if (next !== undefined) onValueChange(next);
        }}
        onBlur={() => setDraft(null)}
      />
      {invalid ? (
        <p id={errorId} role="alert" className="text-destructive text-xs">
          {t(errorCode)}
        </p>
      ) : null}
    </div>
  );
}
