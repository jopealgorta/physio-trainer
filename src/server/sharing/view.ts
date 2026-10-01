import "server-only";

import type { ShareLink } from "@/db/schema";
import { lastDayBefore, todayIn } from "@/lib/calendar-date";
import { qrCode } from "@/lib/qr";
import { previewImagePath } from "@/lib/link-preview";
import { buildShareUrl, mailtoShareHref, whatsappShareHref } from "@/lib/share-links";

import type { ShareContext } from "./mutations";
import type { ShareLinkStatus, ShareLinkView, SharePreview, ShareState } from "./schemas";

/** Localised card text plus the branding version that busts cached images. */
export type PreviewCopy = { title: string; description: string; version: string };

export function linkStatus(link: ShareLink, now: Date): ShareLinkStatus {
  if (link.revokedAt !== null) return "revoked";
  if (link.expiresAt !== null && link.expiresAt <= now) return "expired";
  return "active";
}

export function toLinkView(
  link: ShareLink,
  context: ShareContext,
  appUrl: string,
  now: Date = new Date(),
): ShareLinkView {
  const url = buildShareUrl(appUrl, context.handle, link.slug, link.code);
  return {
    id: link.id,
    target: link.target,
    slug: link.slug,
    code: link.code,
    url,
    status: linkStatus(link, now),
    hasPin: link.pinHash !== null,
    expiresOn: link.expiresAt ? lastDayBefore(context.timeZone, link.expiresAt) : null,
    openCount: link.openCount,
    lastOpenedAt: link.lastOpenedAt ? link.lastOpenedAt.toISOString() : null,
    qr: qrCode(url),
  };
}

export function toShareState(
  link: ShareLink | null,
  context: ShareContext,
  appUrl: string,
  message: { subject: string; body: string },
  now: Date = new Date(),
  preview?: PreviewCopy,
): ShareState {
  const view = link ? toLinkView(link, context, appUrl, now) : null;
  // `message.body` still holds the {url} placeholder: the URL is only known once a link exists.
  const body = view ? message.body.replace("{url}", view.url) : message.body;
  return {
    link: view,
    preview: view && view.status !== "revoked" && preview ? toPreview(view, appUrl, preview) : null,
    itemStatus: context.itemStatus,
    whatsappHref: whatsappShareHref(body, context.customer.phone),
    mailtoHref: mailtoShareHref(context.customer.email, message.subject, body),
    today: todayIn(context.timeZone, now),
  };
}

function toPreview(link: ShareLinkView, appUrl: string, copy: PreviewCopy): SharePreview {
  return {
    imagePath: previewImagePath(new URL(link.url).pathname, copy.version),
    title: copy.title,
    description: copy.description,
    host: new URL(appUrl).host,
  };
}
