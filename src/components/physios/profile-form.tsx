"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState, useSyncExternalStore } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const selectClassName =
  "border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm";

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

  const browserZoneListed =
    browserTimeZone !== null && timeZones.some((zone) => zone.value === browserTimeZone);
  const effectiveTimezone =
    timezone ?? (mode === "onboarding" && browserZoneListed ? browserTimeZone : defaults.timezone);

  function onDisplayNameChange(value: string) {
    setDisplayName(value);
    if (handleEdited) return;
    const derived = handleFromName(value);
    if (derived) setHandle(derived);
  }

  return (
    <form action={formAction} className="grid gap-6" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="grid gap-2">
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
          className={cn(
            "text-sm",
            errors.displayName ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {errors.displayName ? t(`errors.${errors.displayName}`) : t("displayNameHint")}
        </p>
      </div>

      <div className="grid gap-2">
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
          className={cn("text-sm", handleInvalid ? "text-destructive" : "text-muted-foreground")}
        >
          {handleMessage ? t(`handleStatus.${handleMessage}`) : t("handleHint")}
        </p>
        <p id="handle-preview" className="text-muted-foreground text-sm break-all">
          {t("linkPreview", { url: `${linkBase}/${handle}/${PREVIEW_SLUG}` })}
        </p>
      </div>

      {mode === "settings" && !unchanged ? (
        <Alert>
          <AlertDescription>{t("handleChangeNotice")}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="locale">{t("language")}</Label>
          <select
            id="locale"
            name="locale"
            value={locale}
            onChange={(event) => setLocale(event.target.value)}
            className={selectClassName}
          >
            {languages.map((language) => (
              <option key={language.value} value={language.value}>
                {language.label}
              </option>
            ))}
          </select>
          {errors.locale ? (
            <p className="text-destructive text-sm">{t(`errors.${errors.locale}`)}</p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="timezone">{t("timezone")}</Label>
          <select
            id="timezone"
            name="timezone"
            value={effectiveTimezone}
            onChange={(event) => setTimezone(event.target.value)}
            className={selectClassName}
          >
            {timeZones.map((zone) => (
              <option key={zone.value} value={zone.value}>
                {zone.label}
              </option>
            ))}
          </select>
          {errors.timezone ? (
            <p className="text-destructive text-sm">{t(`errors.${errors.timezone}`)}</p>
          ) : null}
        </div>
      </div>

      {state.status === "error" && state.formError ? (
        <Alert variant="destructive">
          <AlertDescription>{t("errors.unknown")}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t(mode === "onboarding" ? "submitOnboarding" : "submitSettings")}
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
