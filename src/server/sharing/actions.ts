"use server";

import { getTranslations } from "next-intl/server";

import { env } from "@/env";
import { resolveLocale } from "@/i18n/config";
import { withPhysio } from "@/server/auth/session";
import { previewVersion } from "@/lib/link-preview";
import { getBranding } from "@/server/branding/queries";

import {
  ensureShareLink,
  renewShareLink,
  revokeShareLink,
  setSharePin,
  updateShareLink,
  type ShareContext,
} from "./mutations";
import {
  setPinSchema,
  shareRefSchema,
  updateLinkSchema,
  type Result,
  type ShareError,
  type ShareState,
} from "./schemas";
import { toShareState } from "./view";
import type { ShareLink } from "@/db/schema";

type Loaded = {
  link: ShareLink;
  context: ShareContext;
  clinicName: string;
  /** `physios.updated_at`: the link-preview image URL changes with it. */
  brandingUpdatedAt: Date;
};
type Outcome<T> = Result<T, ShareError>;

const appUrl = () => env.NEXT_PUBLIC_APP_URL;

/** Share message in the customer's language; `{url}` is filled in by `toShareState`. */
async function stateOf({
  link,
  context,
  clinicName,
  brandingUpdatedAt,
}: Loaded): Promise<ShareState> {
  const locale = resolveLocale(context.customer.locale);
  const [t, meta] = await Promise.all([
    getTranslations({ locale, namespace: "Sharing.message" }),
    getTranslations({ locale, namespace: "Patient.meta" }),
  ]);
  const values = { name: context.customer.firstName, clinic: clinicName, url: "{url}" };
  return toShareState(
    link,
    context,
    appUrl(),
    { subject: t("subject", values), body: t("body", values) },
    new Date(),
    {
      title: meta("title", { clinic: clinicName }),
      description: meta("description", { clinic: clinicName }),
      version: previewVersion(brandingUpdatedAt),
    },
  );
}

/** Runs a mutation under the physio's session and adds the clinic name the message needs. */
async function run(
  fn: Parameters<typeof withPhysio<Outcome<{ link: ShareLink; context: ShareContext }>>>[0],
): Promise<Outcome<ShareState>> {
  const result = await withPhysio(async (tx, physioId) => {
    const outcome = await fn(tx, physioId);
    if (!outcome.ok) return outcome;
    const branding = await getBranding(tx, physioId);
    return {
      ok: true,
      data: {
        ...outcome.data,
        clinicName: branding?.clinicName ?? "",
        brandingUpdatedAt: branding?.updatedAt ?? new Date(0),
      },
    } as const;
  });
  return result.ok ? { ok: true, data: await stateOf(result.data) } : result;
}

/** The popover's first load: the live link, creating it the first time a target is shared. */
export async function loadShareAction(input: unknown): Promise<Outcome<ShareState>> {
  const ref = shareRefSchema.safeParse(input);
  if (!ref.success) return { ok: false, error: "notFound" };
  return run((tx, physioId) => ensureShareLink(tx, physioId, ref.data));
}

/** "Regenerate" and "Create new link": a new code; the old one stops working. */
export async function renewShareLinkAction(input: unknown): Promise<Outcome<ShareState>> {
  const ref = shareRefSchema.safeParse(input);
  if (!ref.success) return { ok: false, error: "notFound" };
  return run((tx, physioId) => renewShareLink(tx, physioId, ref.data));
}

export async function updateShareLinkAction(input: unknown): Promise<Outcome<ShareState>> {
  const parsed = updateLinkSchema.safeParse(input);
  if (!parsed.success) {
    const slug = parsed.error.issues.some((issue) => issue.path[0] === "slug");
    return { ok: false, error: slug ? "slugRequired" : "invalid" };
  }
  return run((tx, physioId) => updateShareLink(tx, physioId, parsed.data));
}

/** The PIN comes back once, here; only its hash is stored. */
export async function setSharePinAction(
  input: unknown,
): Promise<Outcome<{ state: ShareState; pin: string | null }>> {
  const parsed = setPinSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "notFound" };
  let pin: string | null = null;
  const result = await run(async (tx, physioId) => {
    const outcome = await setSharePin(tx, physioId, parsed.data.id, parsed.data.enabled);
    if (!outcome.ok) return outcome;
    pin = outcome.data.pin;
    return outcome;
  });
  return result.ok ? { ok: true, data: { state: result.data, pin } } : result;
}

export async function revokeShareLinkAction(id: string): Promise<Outcome<ShareState>> {
  const parsed = setPinSchema.shape.id.safeParse(id);
  if (!parsed.success) return { ok: false, error: "notFound" };
  return run((tx, physioId) => revokeShareLink(tx, physioId, parsed.data));
}
