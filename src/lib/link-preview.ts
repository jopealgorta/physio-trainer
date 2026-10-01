/**
 * Link previews (docs/specs/11-link-previews.md): the Open Graph / Twitter card a patient link
 * unfurls into. Pure, so the layout, the popover and the tests share it. A preview only ever
 * carries the clinic's branding: it is shown to anyone the link is forwarded to.
 */
import type { Metadata } from "next";

import { mixOnWhite, type BrandTokens } from "./color";

export const PREVIEW_IMAGE_SIZE = { width: 1200, height: 630 } as const;
/** The image is served by `[slug]/og/route.tsx`, at `{link path}/og`. */
export const PREVIEW_IMAGE_SEGMENT = "og";

/** The app's own light-mode `--primary` (globals.css): the card of a physio without an accent. */
const NEUTRAL_ACCENT = "#171717";
const NEUTRAL_ON_ACCENT = "#fafafa";
const TINT_AMOUNT = 0.07;

/** What the card draws: a change to any of these changes the image. */
export type PreviewBranding = {
  clinicName: string;
  logoUrl: string | null;
  accentColor: string | null;
  /** The shared routine's or plan's name; null on a customer-level link (the card is just the clinic). */
  title?: string | null;
};

/**
 * Cache-busting token for the image URL: a 32-bit FNV-1a hash of what the card draws, so a new
 * logo, name, accent or title gives new shares a fresh image, and unrelated profile edits (time zone,
 * handle) do not invalidate every cached card. The logo URL carries a new uuid per upload.
 */
export function previewVersion({
  clinicName,
  logoUrl,
  accentColor,
  title,
}: PreviewBranding): string {
  let hash = 0x811c9dc5;
  const drawn = [clinicName, logoUrl ?? "", accentColor ?? ""];
  // Appended only when set, so a link without a title keeps its pre-title version.
  if (title) drawn.push(title);
  for (const char of drawn.join("\n")) {
    hash = Math.imul(hash ^ char.codePointAt(0)!, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** `path` is the canonical `/{handle}/{slug}-{code}`. */
export const previewImagePath = (path: string, version: string): string =>
  `${path}/${PREVIEW_IMAGE_SEGMENT}?v=${encodeURIComponent(version)}`;

export type PreviewMetadataInput = {
  path: string;
  version: string;
  /** Already localised to the customer's language. */
  title: string;
  description: string;
  clinicName: string;
  imageAlt: string;
};

export function buildPreviewMetadata(input: PreviewMetadataInput): Metadata {
  const image = previewImagePath(input.path, input.version);
  return {
    // The clinic, never the customer: titles end up in history, bookmarks and chat previews.
    title: { absolute: input.title },
    description: input.description,
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      title: input.title,
      description: input.description,
      siteName: input.clinicName,
      images: [
        {
          url: image,
          width: PREVIEW_IMAGE_SIZE.width,
          height: PREVIEW_IMAGE_SIZE.height,
          alt: input.imageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
      images: [image],
    },
  };
}

/** The card's solid accent, readable text on it, and a very light tint for the background. */
export function cardColors(tokens: BrandTokens | null): {
  accent: string;
  onAccent: string;
  tint: string;
} {
  const accent = tokens?.light.primary ?? NEUTRAL_ACCENT;
  return {
    accent,
    onAccent: tokens?.light.primaryForeground ?? NEUTRAL_ON_ACCENT,
    tint: mixOnWhite(accent, TINT_AMOUNT),
  };
}
