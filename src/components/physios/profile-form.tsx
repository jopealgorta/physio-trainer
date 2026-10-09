"use client";

import { useTranslations } from "next-intl";
import {
  startTransition,
  useActionState,
  useEffect,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";

import { Field, FieldRow, FormBody, FormFooter } from "@/components/form-layout";
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
import {
  HANDLE_MAX_LENGTH,
  handleFromName,
  handleProblem,
  type HandleProblem,
} from "@/lib/handles";
import { normalizeTimeZone, type TimeZoneOption } from "@/lib/timezones";
import { cn } from "@/lib/utils";
import type { ProfileFormState } from "@/server/physios/schemas";

export type ProfileFormValues = {
  displayName: string;
  handle: string;
  locale: string;
  timezone: string;
};

type HandleMessage = HandleProblem | "taken" | "available" | "checking";

const initialState: ProfileFormState = { status: "idle" };
const CHECK_DELAY_MS = 400;
const PREVIEW_SLUG = "ana-7k2m9qpx";

// The browser's zone is only known on the client; the server snapshot is null.
const subscribeNever = () => () => {};
const readBrowserTimeZone = () =>
  normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);

export function ProfileForm({
  mode,
  action,
  checkHandle,
  defaults,
  savedHandle,
  linkBase,
  timeZones,
  languages,
  next,
}: {
  mode: "onboarding" | "settings";
  action: (state: ProfileFormState, formData: FormData) => Promise<ProfileFormState>;
  checkHandle: (handle: string) => Promise<boolean>;
  defaults: ProfileFormValues;
  savedHandle: string;
  linkBase: string;
  timeZones: TimeZoneOption[];
  languages: { value: string; label: string }[];
  next?: string;
}) {
  const t = useTranslations("ProfileForm");
  const [state, formAction, pending] = useActionState(action, initialState);

  const [displayName, setDisplayName] = useState(defaults.displayName);
  const [handle, setHandle] = useState(defaults.handle);
  const [handleEdited, setHandleEdited] = useState(mode === "settings");
  const [locale, setLocale] = useState(defaults.locale);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [remote, setRemote] = useState<{ handle: string; available: boolean } | null>(null);
  const browserTimeZone = useSyncExternalStore(subscribeNever, readBrowserTimeZone, () => null);

  const localProblem = handleProblem(handle);
  const unchanged = handle === savedHandle;

  useEffect(() => {
    if (localProblem || unchanged) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const available = await checkHandle(handle);
      if (!cancelled) setRemote({ handle, available });
    }, CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [handle, localProblem, unchanged, checkHandle]);

  const errors = state.status === "error" ? state.fieldErrors : {};
  const serverHandleError =
    state.status === "error" && state.submittedHandle === handle ? errors.handle : undefined;
  const handleMessage: HandleMessage | undefined =
    serverHandleError ??
    localProblem ??
    (unchanged
      ? undefined
      : remote?.handle === handle
        ? remote.available
          ? "available"
          : "taken"
        : "checking");
  const handleInvalid =
    handleMessage !== undefined && !["available", "checking"].includes(handleMessage);

  // Onboarding starts from the browser's zone. A zone the server's list lacks (e.g. a newer
  // alias from the browser's ICU) is still offered; profileSchema normalises it on save.
  const initialTimezone =
    mode === "onboarding" && browserTimeZone !== null ? browserTimeZone : defaults.timezone;
  const timeZoneChoices = timeZones.some((zone) => zone.value === initialTimezone)
    ? timeZones
    : [{ value: initialTimezone, label: initialTimezone.replaceAll("_", " ") }, ...timeZones];
  const effectiveTimezone = timezone ?? initialTimezone;

  function onDisplayNameChange(value: string) {
    setDisplayName(value);
    if (handleEdited) return;
    const derived = handleFromName(value);
    if (derived) setHandle(derived);
  }

  // React resets a form after its `action` resolves, which can snap controlled fields back to
  // their first-render value while state keeps the new one. Dispatching from onSubmit skips
  // that reset; `action` stays for submits before hydration.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form action={formAction} onSubmit={onSubmit} className="grid gap-6" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <FormBody>
        <FieldRow>
          <Field>
            <Label htmlFor="displayName">{t("displayName")}</Label>
            <Input
              id="displayName"
              name="displayName"
              value={displayName}
              maxLength={80}
              autoComplete="name"
              required
              aria-invalid={errors.displayName !== undefined}
              aria-describedby="displayName-message"
              onChange={(event) => onDisplayNameChange(event.target.value)}
            />
            <p
              id="displayName-message"
              aria-live="polite"
              className={cn(
                "text-sm",
                errors.displayName ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {errors.displayName ? t(`errors.${errors.displayName}`) : t("displayNameHint")}
            </p>
          </Field>

          <Field>
            <Label htmlFor="handle">{t("handle")}</Label>
            <Input
              id="handle"
              name="handle"
              value={handle}
              maxLength={HANDLE_MAX_LENGTH}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              aria-invalid={handleInvalid}
              aria-describedby="handle-status handle-preview"
              onChange={(event) => {
                setHandle(event.target.value.toLowerCase());
                setHandleEdited(true);
              }}
            />
            <p
              id="handle-status"
              aria-live="polite"
              className={cn(
                "text-sm",
                handleInvalid ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {handleMessage ? t(`handleStatus.${handleMessage}`) : t("handleHint")}
            </p>
            <p id="handle-preview" className="text-muted-foreground text-sm break-all">
              {t("linkPreview", { url: `${linkBase}/${handle}/${PREVIEW_SLUG}` })}
            </p>
          </Field>
        </FieldRow>

        {mode === "settings" && !unchanged ? (
          // The handle status region already announces changes; this notice must not interrupt.
          <Alert role="status">
            <AlertDescription>{t("handleChangeNotice")}</AlertDescription>
          </Alert>
        ) : null}

        <FieldRow>
          <Field>
            <Label htmlFor="locale">{t("language")}</Label>
            <input type="hidden" name="locale" value={locale} />
            <Select value={locale} onValueChange={(next) => next && setLocale(next)}>
              <SelectTrigger id="locale" className="w-full">
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
            {errors.locale ? (
              <p role="alert" className="text-destructive text-sm">
                {t(`errors.${errors.locale}`)}
              </p>
            ) : null}
          </Field>
          <Field>
            <Label htmlFor="timezone">{t("timezone")}</Label>
            <input type="hidden" name="timezone" value={effectiveTimezone} />
            {/* When the browser's zone replaces the server default, its option and the value arrive in
              one commit; Radix's internal <select> then briefly reports "". A zone is never empty. */}
            <Select value={effectiveTimezone} onValueChange={(zone) => zone && setTimezone(zone)}>
              <SelectTrigger id="timezone" className="w-full">
                <SelectValue>
                  {timeZoneChoices.find((zone) => zone.value === effectiveTimezone)?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent position="popper">
                {timeZoneChoices.map((zone) => (
                  <SelectItem key={zone.value} value={zone.value}>
                    {zone.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.timezone ? (
              <p role="alert" className="text-destructive text-sm">
                {t(`errors.${errors.timezone}`)}
              </p>
            ) : null}
          </Field>
        </FieldRow>

        {state.status === "error" && state.formError ? (
          <Alert variant="destructive">
            <AlertDescription>{t("errors.unknown")}</AlertDescription>
          </Alert>
        ) : null}
      </FormBody>

      {/* Onboarding is a short card on its own: one full-width button, nothing to cancel. */}
      {mode === "onboarding" ? (
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? t("saving") : t("submitOnboarding")}
        </Button>
      ) : (
        <FormFooter status={state.status === "saved" && !pending ? t("saved") : null}>
          <Button type="submit" disabled={pending}>
            {pending ? t("saving") : t("submitSettings")}
          </Button>
        </FormFooter>
      )}
    </form>
  );
}
