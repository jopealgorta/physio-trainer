"use client";

import { useTranslations } from "next-intl";
import {
  startTransition,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";

import { FormBody, FormFooter } from "@/components/form-layout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildBranding,
  LOGO_ACCEPT,
  LOGO_CONTENT_TYPES,
  LOGO_SOURCE_MAX_BYTES,
  normalizePhone,
  normalizeWebsite,
  type BrandingSource,
} from "@/lib/branding";
import { resizeLogo } from "@/lib/resize-image";
import { cn } from "@/lib/utils";
import type { BrandingFieldErrors, BrandingFormState } from "@/server/branding/schemas";

import { AccentPicker } from "./accent-picker";
import { BrandingPreview } from "./branding-preview";

export type BrandingFormValues = BrandingSource;

type LogoError = NonNullable<BrandingFieldErrors["logo"]>;

const initialState: BrandingFormState = { status: "idle" };
const ACCEPTED_TYPES: readonly string[] = Object.values(LOGO_CONTENT_TYPES);

const blankToNull = (value: string) => value.trim() || null;

/** A text field with its label and a hint that turns into the field's error. */
function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: (props: { "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode;
}) {
  const messageId = `${id}-message`;
  const message = error ?? hint;
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children({
        "aria-invalid": error !== undefined,
        "aria-describedby": message ? messageId : undefined,
      })}
      <p
        id={messageId}
        aria-live="polite"
        className={cn("text-sm", error ? "text-destructive" : "text-muted-foreground")}
      >
        {message}
      </p>
    </div>
  );
}

export function BrandingForm({
  action,
  defaults,
  linkHost,
}: {
  action: (state: BrandingFormState, formData: FormData) => Promise<BrandingFormState>;
  defaults: BrandingFormValues;
  /** Host of the app's public URL, shown on the shared-link preview. */
  linkHost: string;
}) {
  const t = useTranslations("Settings.branding");
  const id = useId();
  const [state, formAction, pending] = useActionState(action, initialState);

  const [clinicName, setClinicName] = useState(defaults.clinicName ?? "");
  const [accent, setAccent] = useState(defaults.accentColor);
  const [email, setEmail] = useState(defaults.contactEmail ?? "");
  const [phone, setPhone] = useState(defaults.contactPhone ?? "");
  const [website, setWebsite] = useState(defaults.website ?? "");
  const [showContact, setShowContact] = useState(defaults.showContactToPatients);

  const [savedLogoUrl, setSavedLogoUrl] = useState(defaults.logoUrl);
  const [logoFile, setLogoFile] = useState<{ file: File; previewUrl: string } | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [logoError, setLogoError] = useState<LogoError | null>(null);
  const pickCounter = useRef(0);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // After a save, the stored logo replaces the pending file and a pending removal is done.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.status === "saved") {
      setSavedLogoUrl(state.logoUrl);
      setLogoFile(null);
      setRemoveLogo(false);
    }
  }

  const previewUrl = logoFile?.previewUrl;
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const displayedLogo = logoFile?.previewUrl ?? (removeLogo ? null : savedLogoUrl);
  const websiteResult = website.trim() ? normalizeWebsite(website) : null;
  const branding = buildBranding({
    displayName: defaults.displayName,
    clinicName,
    logoUrl: displayedLogo,
    accentColor: accent,
    contactEmail: blankToNull(email),
    contactPhone: normalizePhone(phone),
    website: websiteResult?.ok ? websiteResult.url : null,
    showContactToPatients: showContact,
  });

  const errors = state.status === "error" ? state.fieldErrors : {};
  const logoMessage = logoError ?? errors.logo;

  async function onLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared so picking the same file again still fires `change`; the file lives in state.
    event.target.value = "";
    if (!file) return;
    const pick = ++pickCounter.current;
    if (!ACCEPTED_TYPES.includes(file.type)) return setLogoError("logoInvalidType");
    if (file.size > LOGO_SOURCE_MAX_BYTES) return setLogoError("logoTooLarge");
    setLogoError(null);
    let resized: File;
    try {
      resized = await resizeLogo(file);
    } catch {
      if (pick === pickCounter.current) setLogoError("logoInvalidType");
      return;
    }
    if (pick !== pickCounter.current) return;
    setLogoFile({ file: resized, previewUrl: URL.createObjectURL(resized) });
    setRemoveLogo(false);
  }

  function onRemoveLogo() {
    pickCounter.current++;
    setLogoFile(null);
    setLogoError(null);
    setRemoveLogo(savedLogoUrl !== null);
    // The button unmounts with the logo; keep keyboard focus in the logo controls.
    logoInputRef.current?.focus();
  }

  // Dispatched from onSubmit (not the form's `action`) so the resized logo can be added and
  // React does not reset the form; `action` stays for submits before hydration.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (logoFile) formData.set("logo", logoFile.file);
    startTransition(() => formAction(formData));
  }

  const fieldId = (name: string) => `${id}-${name}`;
  const logoInputId = fieldId("logo");
  const formId = fieldId("form");

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,42rem)_minmax(0,22rem)] lg:items-start">
        <form id={formId} action={formAction} onSubmit={onSubmit} noValidate>
          <FormBody>
            <Field
              id={fieldId("clinicName")}
              label={t("clinicName")}
              hint={t("clinicNameHint", { name: defaults.displayName })}
              error={errors.clinicName && t(`errors.${errors.clinicName}`)}
            >
              {(aria) => (
                <Input
                  id={fieldId("clinicName")}
                  name="clinicName"
                  value={clinicName}
                  maxLength={80}
                  autoComplete="organization"
                  onChange={(event) => setClinicName(event.target.value)}
                  {...aria}
                />
              )}
            </Field>

            <div className="grid gap-1.5">
              <Label htmlFor={logoInputId}>{t("logo")}</Label>
              <div className="flex items-center gap-4">
                <div className="bg-muted flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border">
                  {displayedLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- ≤512 px logo from a public bucket (or a blob: preview); next/image refuses local Supabase (private IP) and blob URLs.
                    <img
                      src={displayedLogo}
                      alt={t("logoAlt", { clinic: branding.clinicName })}
                      className="size-full object-contain"
                    />
                  ) : (
                    <span className="text-muted-foreground px-1 text-center text-xs">
                      {t("logoEmpty")}
                    </span>
                  )}
                </div>
                <div className="grid min-w-0 gap-2">
                  {/* No `name`: a submit before hydration must not post the raw, unresized file. */}
                  <Input
                    ref={logoInputRef}
                    id={logoInputId}
                    type="file"
                    accept={LOGO_ACCEPT}
                    aria-invalid={logoMessage !== undefined && logoMessage !== null}
                    aria-describedby={`${logoInputId}-message`}
                    onChange={onLogoChange}
                    className="h-auto py-1"
                  />
                  {displayedLogo ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-fit"
                      onClick={onRemoveLogo}
                    >
                      {t("removeLogo")}
                    </Button>
                  ) : null}
                </div>
              </div>
              <p
                id={`${logoInputId}-message`}
                aria-live="polite"
                className={cn(
                  "text-sm",
                  logoMessage ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {logoMessage ? t(`errors.${logoMessage}`) : t("logoHint")}
              </p>
              {removeLogo ? <input type="hidden" name="removeLogo" value="1" /> : null}
            </div>

            <AccentPicker
              value={accent}
              onChange={setAccent}
              name="accentColor"
              error={errors.accentColor}
            />

            <fieldset className="grid gap-4">
              <legend className="mb-3 text-sm font-medium">{t("contactTitle")}</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id={fieldId("contactEmail")}
                  label={t("contactEmail")}
                  error={errors.contactEmail && t(`errors.${errors.contactEmail}`)}
                >
                  {(aria) => (
                    <Input
                      id={fieldId("contactEmail")}
                      name="contactEmail"
                      type="email"
                      value={email}
                      maxLength={254}
                      autoComplete="email"
                      onChange={(event) => setEmail(event.target.value)}
                      {...aria}
                    />
                  )}
                </Field>
                <Field
                  id={fieldId("contactPhone")}
                  label={t("contactPhone")}
                  hint={t("contactPhoneHint")}
                  error={errors.contactPhone && t(`errors.${errors.contactPhone}`)}
                >
                  {(aria) => (
                    <Input
                      id={fieldId("contactPhone")}
                      name="contactPhone"
                      type="tel"
                      value={phone}
                      maxLength={32}
                      autoComplete="tel"
                      onChange={(event) => setPhone(event.target.value)}
                      {...aria}
                    />
                  )}
                </Field>
              </div>
              <Field
                id={fieldId("website")}
                label={t("website")}
                hint={t("websiteHint")}
                error={errors.website && t(`errors.${errors.website}`)}
              >
                {(aria) => (
                  <Input
                    id={fieldId("website")}
                    name="website"
                    type="url"
                    inputMode="url"
                    value={website}
                    maxLength={2048}
                    autoComplete="url"
                    onChange={(event) => setWebsite(event.target.value)}
                    {...aria}
                  />
                )}
              </Field>
              <div className="grid gap-1">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={fieldId("showContact")}
                    checked={showContact}
                    onCheckedChange={(checked) => setShowContact(checked === true)}
                    aria-describedby={`${fieldId("showContact")}-hint`}
                  />
                  <Label htmlFor={fieldId("showContact")}>{t("showContact")}</Label>
                </div>
                <p id={`${fieldId("showContact")}-hint`} className="text-muted-foreground text-sm">
                  {t("showContactHint")}
                </p>
                {/* The checkbox is a Radix button; this is what the form posts. */}
                {showContact ? (
                  <input type="hidden" name="showContactToPatients" value="on" />
                ) : null}
              </div>
            </fieldset>

            {state.status === "error" && state.formError ? (
              <Alert variant="destructive">
                <AlertDescription>{t(`errors.${state.formError}`)}</AlertDescription>
              </Alert>
            ) : null}
          </FormBody>
        </form>

        <section aria-labelledby={`${id}-preview`} className="grid gap-4 lg:sticky lg:top-6">
          <h3 id={`${id}-preview`} className="text-sm font-medium">
            {t("preview.title")}
          </h3>
          <BrandingPreview branding={branding} linkHost={linkHost} />
        </section>
      </div>

      <FormFooter wide status={state.status === "saved" && !pending ? t("saved") : null}>
        {/* Outside the form, like the preview: the fields alone are what it posts. */}
        <Button type="submit" form={formId} disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
      </FormFooter>
    </div>
  );
}
