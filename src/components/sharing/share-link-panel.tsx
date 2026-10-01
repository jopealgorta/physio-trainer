"use client";

import { CheckIcon, CopyIcon, ExternalLinkIcon, MailIcon, MessageCircleIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SLUG_MAX } from "@/lib/share-links";
import type { ShareError, SharePreview, ShareState } from "@/server/sharing/schemas";

import { QrCode } from "./qr-code";

export type PanelError = ShareError | "generic";

/** What the panel can ask for; the parent runs it and feeds the new state back. */
export type PanelActions = {
  busy: boolean;
  /** The PIN, shown only right after it was generated. */
  pin: string | null;
  saveSlug: (slug: string) => void;
  saveExpiry: (expiresOn: string | null) => void;
  setPin: (enabled: boolean) => void;
  regenerate: () => void;
  revoke: () => void;
  createNew: () => void;
};

const STATUS_VARIANT = { active: "secondary", expired: "outline", revoked: "destructive" } as const;

/** Everything inside the Share popover once a link is known. */
export function ShareLinkPanel({
  state,
  error,
  actions,
}: {
  state: ShareState;
  error: PanelError | null;
  actions: PanelActions;
}) {
  const t = useTranslations("Sharing");
  const format = useFormatter();
  const id = useId();
  const [copied, setCopied] = useState(false);
  const link = state.link;
  if (!link) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link!.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the field is selectable, so the physio can still copy by hand.
    }
  }

  const revoked = link.status === "revoked";

  return (
    <div className="grid gap-4">
      {state.itemStatus === "draft" || state.itemStatus === "archived" ? (
        <Alert role="status">
          <AlertDescription>{t(`notActive.${state.itemStatus}`)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_VARIANT[link.status]}>{t(`status.${link.status}`)}</Badge>
        <span className="text-muted-foreground text-xs">
          {link.openCount === 0
            ? t("usage.never")
            : [
                t("usage.opened", { count: link.openCount }),
                link.lastOpenedAt
                  ? t("usage.last", {
                      date: format.dateTime(new Date(link.lastOpenedAt), { dateStyle: "medium" }),
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
        </span>
      </div>

      {revoked ? (
        <div className="grid gap-3">
          <p className="text-sm">{t("revoked.note")}</p>
          <Button type="button" onClick={actions.createNew} disabled={actions.busy}>
            {t("revoked.createNew")}
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-url`}>{t("linkLabel")}</Label>
            <div className="flex gap-2">
              <Input
                id={`${id}-url`}
                readOnly
                value={link.url}
                onFocus={(event) => event.currentTarget.select()}
                className="min-w-0 flex-1"
              />
              <Button type="button" variant="outline" onClick={copy}>
                {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
                {copied ? t("copied") : t("copy")}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button asChild variant="secondary" size="sm">
                <a href={state.whatsappHref} target="_blank" rel="noopener noreferrer">
                  <MessageCircleIcon aria-hidden />
                  {t("whatsapp")}
                </a>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <a href={state.mailtoHref}>
                  <MailIcon aria-hidden />
                  {t("email")}
                </a>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLinkIcon aria-hidden />
                  {t("preview")}
                </a>
              </Button>
            </div>
          </div>

          {state.preview ? <LinkCard preview={state.preview} /> : null}

          <QrCode
            size={link.qr.size}
            path={link.qr.path}
            label={t("qrLabel")}
            className="mx-auto size-40 rounded-md border"
          />

          <SlugField
            key={link.slug}
            slug={link.slug}
            busy={actions.busy}
            error={error === "slugRequired"}
            onSave={actions.saveSlug}
          />

          <ExpiryField
            key={link.expiresOn ?? ""}
            expiresOn={link.expiresOn}
            today={state.today}
            busy={actions.busy}
            error={error === "expiryInPast"}
            onSave={actions.saveExpiry}
          />

          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id={`${id}-pin`}
                checked={link.hasPin}
                disabled={actions.busy}
                onCheckedChange={(checked) => actions.setPin(checked === true)}
              />
              <Label htmlFor={`${id}-pin`}>{t("pin.label")}</Label>
            </div>
            {link.hasPin ? (
              <div className="grid gap-2">
                {actions.pin ? (
                  <div role="status" className="grid gap-1 rounded-md border p-2">
                    <p className="font-mono text-lg font-semibold tracking-widest">
                      {t("pin.shown", { pin: actions.pin })}
                    </p>
                    <p className="text-muted-foreground text-xs">{t("pin.shownOnce")}</p>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">{t("pin.set")}</p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-self-start"
                  disabled={actions.busy}
                  onClick={() => actions.setPin(true)}
                >
                  {t("pin.regenerate")}
                </Button>
              </div>
            ) : null}
            <p className="text-muted-foreground text-xs">{t("pin.hint")}</p>
          </div>

          <div className="grid gap-2 border-t pt-3">
            <ConfirmButton
              action="regenerate"
              disabled={actions.busy}
              onConfirm={actions.regenerate}
              variant="outline"
            />
            <p className="text-muted-foreground text-xs">{t("regenerate.hint")}</p>
            <ConfirmButton
              action="revoke"
              disabled={actions.busy}
              onConfirm={actions.revoke}
              variant="destructive"
            />
          </div>
        </>
      )}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

/** How chat apps unfurl the link (spec 11): the real image, then the title and description. */
function LinkCard({ preview }: { preview: SharePreview }) {
  const t = useTranslations("Sharing.linkCard");
  const id = useId();
  return (
    <figure role="group" aria-labelledby={id} className="grid gap-1.5">
      <figcaption id={id} className="text-sm font-medium">
        {t("label")}
      </figcaption>
      <div className="bg-background overflow-hidden rounded-lg border">
        {/* eslint-disable-next-line @next/next/no-img-element -- same-origin generated PNG; next/image would re-encode it. */}
        <img
          src={preview.imagePath}
          alt={t("imageAlt")}
          width={1200}
          height={630}
          loading="lazy"
          className="bg-muted aspect-[1200/630] w-full object-cover"
        />
        <div className="grid gap-0.5 p-2.5">
          <p className="text-muted-foreground text-[0.625rem] tracking-wide uppercase">
            {preview.host}
          </p>
          <p className="text-sm font-semibold">{preview.title}</p>
          <p className="text-muted-foreground text-xs">{preview.description}</p>
        </div>
      </div>
      <p className="text-muted-foreground text-xs">{t("hint")}</p>
    </figure>
  );
}

/** The slug is edited locally and saved with its button (changing it changes the URL). */
function SlugField({
  slug,
  busy,
  error,
  onSave,
}: {
  slug: string;
  busy: boolean;
  error: boolean;
  onSave: (slug: string) => void;
}) {
  const t = useTranslations("Sharing.slug");
  const id = useId();
  const [value, setValue] = useState(slug);
  return (
    <form
      className="grid gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (value !== slug) onSave(value);
      }}
    >
      <Label htmlFor={id}>{t("label")}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          maxLength={SLUG_MAX}
          autoComplete="off"
          aria-invalid={error}
          aria-describedby={`${id}-hint`}
          onChange={(event) => setValue(event.target.value)}
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="outline" disabled={busy || value === slug}>
          {t("save")}
        </Button>
      </div>
      <p id={`${id}-hint`} className="text-muted-foreground text-xs">
        {t("hint")}
      </p>
    </form>
  );
}

/** A date input is saved with its button: while typing a year it passes through other valid dates. */
function ExpiryField({
  expiresOn,
  today,
  busy,
  error,
  onSave,
}: {
  expiresOn: string | null;
  today: string;
  busy: boolean;
  error: boolean;
  onSave: (expiresOn: string | null) => void;
}) {
  const t = useTranslations("Sharing.expiry");
  const id = useId();
  const [value, setValue] = useState(expiresOn ?? "");
  return (
    <form
      className="grid gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (value !== (expiresOn ?? "")) onSave(value || null);
      }}
    >
      <Label htmlFor={id}>{t("label")}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          type="date"
          min={today}
          value={value}
          aria-invalid={error}
          aria-describedby={`${id}-hint`}
          onChange={(event) => setValue(event.target.value)}
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="outline" disabled={busy || value === (expiresOn ?? "")}>
          {t("save")}
        </Button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {expiresOn ? t("hint") : t("none")}
        </p>
        {expiresOn ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onSave(null)}
          >
            {t("clear")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function ConfirmButton({
  action,
  disabled,
  onConfirm,
  variant,
}: {
  action: "regenerate" | "revoke";
  disabled: boolean;
  onConfirm: () => void;
  variant: "outline" | "destructive";
}) {
  const t = useTranslations("Sharing");
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant={variant} size="sm" disabled={disabled}>
          {t(`${action}.action`)}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t(`${action}.confirmTitle`)}</AlertDialogTitle>
          <AlertDialogDescription>{t(`${action}.confirmBody`)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{t(`${action}.confirm`)}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
