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

/**
 * Cache-busting token for the image URL: it changes whenever the physio row changes (logo,
 * clinic name, accent), so a new share gets a fresh image instead of a cached one.
 */
export const previewVersion = (updatedAt: Date): string => updatedAt.getTime().toString(36);

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
