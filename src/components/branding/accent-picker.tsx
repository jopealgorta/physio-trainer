"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ACCENT_PALETTE } from "@/lib/branding";
import { brandTokens, normalizeHex } from "@/lib/color";
import { cn } from "@/lib/utils";

/** What the native colour input shows while the app default (no accent) is selected. */
const COLOR_INPUT_FALLBACK = "#000000";

const optionClassName =
  "ring-offset-background focus-visible:outline-ring aria-checked:ring-foreground rounded-full outline-offset-4 transition-shadow focus-visible:outline-2 aria-checked:ring-2 aria-checked:ring-offset-2";

/**
 * Accent colour: app default, one of the palette swatches, or any custom hex (docs/specs/
 * 09-physio-branding.md). `value` is a normalised `#rrggbb` or null (app default). Posts the
 * value as `name` through a hidden input.
 */
export function AccentPicker({
  value,
  onChange,
  name,
  error,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  name?: string;
  /** Server-side error code (Settings.branding.errors.*). */
  error?: "accentInvalid";
}) {
  const t = useTranslations("Settings.branding");
  const id = useId();
  const labelId = `${id}-label`;
  const hexId = `${id}-hex`;
  const customId = `${id}-custom`;
  const messageId = `${id}-message`;

  // The hex field keeps what the user typed (e.g. "#fff" on the way to "#ffff00"); it only
  // follows `value` when the value changed from elsewhere (a swatch, the colour input).
  const [text, setText] = useState(value ?? "");
  const [textValue, setTextValue] = useState(value);
  if (value !== textValue) {
    setTextValue(value);
    setText(value ?? "");
  }

  const textInvalid = text.trim() !== "" && normalizeHex(text) === null;
  const adjusted = value ? brandTokens(value).adjusted : false;
  const errorCode = textInvalid ? "accentInvalid" : error;

  function onTextChange(next: string) {
    setText(next);
    const hex = next.trim() === "" ? null : normalizeHex(next);
    if (hex === null && next.trim() !== "") return;
    setTextValue(hex);
    onChange(hex);
  }

  return (
    <div className="grid gap-3">
      <span id={labelId} className="text-xs/relaxed leading-none font-medium">
        {t("accent")}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={`${id}-hint`}
        className="flex flex-wrap items-center gap-3"
      >
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          onClick={() => onChange(null)}
          className={cn(
            optionClassName,
            "border-border inline-flex h-8 items-center gap-1.5 border px-3 text-xs",
          )}
        >
          <span aria-hidden className="bg-primary size-3 rounded-full" />
          {t("accentDefault")}
        </button>
        {ACCENT_PALETTE.map((swatch) => (
          <button
            key={swatch.name}
            type="button"
            role="radio"
            aria-checked={value === swatch.hex}
            aria-label={t(`swatches.${swatch.name}`)}
            title={t(`swatches.${swatch.name}`)}
            onClick={() => onChange(swatch.hex)}
            className={cn(optionClassName, "size-8")}
            style={{ backgroundColor: swatch.hex }}
          />
        ))}
      </div>
      <p id={`${id}-hint`} className="text-muted-foreground text-sm">
        {t("accentHint")}
      </p>

      <div className="flex flex-wrap items-start gap-4">
        <div className="grid gap-2">
          <Label htmlFor={customId}>{t("accentCustom")}</Label>
          <input
            id={customId}
            type="color"
            value={value ?? COLOR_INPUT_FALLBACK}
            onChange={(event) => onChange(normalizeHex(event.target.value))}
            className="border-input h-8 w-14 cursor-pointer rounded-md border bg-transparent p-0.5"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={hexId}>{t("accentHex")}</Label>
          <Input
            id={hexId}
            value={text}
            maxLength={7}
            placeholder="#0f766e"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={errorCode !== undefined}
            aria-describedby={messageId}
            onChange={(event) => onTextChange(event.target.value)}
            className="w-28 font-mono"
          />
        </div>
      </div>
      <p
        id={messageId}
        aria-live="polite"
        className={cn("text-sm", errorCode ? "text-destructive" : "text-muted-foreground")}
      >
        {errorCode ? t(`errors.${errorCode}`) : adjusted ? t("accentAdjusted") : null}
      </p>

      {/* An invalid hex is posted as typed so the server rejects it; posting the previous valid
          accent would show "Saved" next to the inline error. */}
      {name ? <input type="hidden" name={name} value={textInvalid ? text : (value ?? "")} /> : null}
    </div>
  );
}
