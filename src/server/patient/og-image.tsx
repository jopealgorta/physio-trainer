import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { ACTIVITY_PATH } from "@/lib/app-icon-image";
import { LOGO_MAX_BYTES } from "@/lib/branding";
import { cardColors, PREVIEW_IMAGE_SIZE } from "@/lib/link-preview";
import type { BrandTokens } from "@/lib/color";
import { fetchImageDataUri } from "@/server/export/images";

import { loadLink } from "./load";

/**
 * What the card shows (spec 11): branding and the shared routine's or plan's name. Never anything
 * about the patient.
 */
export type PreviewCardInput = {
  clinicName: string;
  /** The routine's or plan's name; null draws the clinic name as the headline. */
  title: string | null;
  /** "Powered by Physio Trainer" in the customer's language. */
  footer: string;
  /** A `data:` URI the card can embed, or null for the initial circle. */
  logoSrc: string | null;
  tokens: BrandTokens | null;
};

const FETCH_TIMEOUT_MS = 3000;
const FONT_FILE = join(process.cwd(), "src/assets/fonts/Outfit-Bold.ttf");
const FOREGROUND = "#171717";
const MUTED = "#737373";
const SECONDARY = "#525252";
const FONT = "Outfit";

let font: Buffer | null = null;
/** Bundled, so rendering never needs the network; read once per server instance. */
async function outfit(): Promise<Buffer> {
  // Cache the bytes, not the promise: a failed read must not poison every later request.
  return (font ??= await readFile(FONT_FILE));
}

const LOGO_CACHE_SIZE = 50;
/** Logo data URIs by URL. A new upload gets a new URL, so entries never go stale. */
const logoCache = new Map<string, string>();

/**
 * The clinic's logo as a data URI. Satori cannot fetch for us reliably, so it is fetched here:
 * only PNG and JPEG (the types the bucket stores) up to the bucket's limit are accepted, and any
 * failure means "no logo", which draws the initial instead of failing the card.
 */
export async function loadLogoDataUri(
  url: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (!url) return null;
  const cached = logoCache.get(url);
  if (cached) return cached;
  const dataUri = await fetchImageDataUri(url, {
    maxBytes: LOGO_MAX_BYTES,
    timeoutMs: FETCH_TIMEOUT_MS,
    fetchImpl,
  });
  if (!dataUri) return null;
  if (logoCache.size >= LOGO_CACHE_SIZE) logoCache.delete(logoCache.keys().next().value!);
  logoCache.set(url, dataUri);
  return dataUri;
}

/** Longer names get a smaller type so up to 80 characters fit on two lines. */
export const nameFontSize = (name: string): number =>
  name.length <= 24 ? 96 : name.length <= 48 ? 72 : 56;

/** Routine and plan names go up to 80 characters; they get two lines at most. */
export const titleFontSize = (title: string): number =>
  title.length <= 28 ? 88 : title.length <= 56 ? 68 : 54;

/** A headline of at most `lines` lines: Satori only clamps text in a block, not in a flex item. */
function Clamped({
  lines,
  style,
  children,
}: {
  lines: number;
  style: Record<string, string | number>;
  children: string;
}) {
  return (
    <div style={{ display: "flex" }}>
      <div
        style={{
          display: "block",
          lineClamp: lines,
          textOverflow: "ellipsis",
          wordBreak: "break-word",
          ...style,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Card({ clinicName, title, footer, logoSrc, tokens }: PreviewCardInput) {
  const { accent, onAccent, tint } = cardColors(tokens);
  const initial = Array.from(clinicName.trim())[0]?.toLocaleUpperCase() ?? "";
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: tint,
        fontFamily: FONT,
        fontWeight: 700,
        color: FOREGROUND,
      }}
    >
      <div style={{ width: 28, height: "100%", background: accent }} />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px 56px 76px",
        }}
      >
        <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 56 }}>
          <div
            style={{
              width: 220,
              height: 220,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: logoSrc ? "#ffffff" : accent,
              color: onAccent,
              borderRadius: logoSrc ? 40 : 110,
              fontSize: 120,
              padding: logoSrc ? 20 : 0,
            }}
          >
            {logoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- rendered by Satori, not the browser.
              <img
                src={logoSrc}
                alt=""
                width={180}
                height={180}
                style={{ width: 180, height: 180, objectFit: "contain" }}
              />
            ) : (
              initial
            )}
          </div>
          {title ? (
            <div style={{ display: "flex", flex: 1, flexDirection: "column", gap: 24 }}>
              <Clamped
                lines={2}
                style={{ fontSize: titleFontSize(title), lineHeight: 1.1, letterSpacing: -2 }}
              >
                {title}
              </Clamped>
              <Clamped lines={1} style={{ fontSize: 40, color: SECONDARY }}>
                {clinicName}
              </Clamped>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flex: 1,
                fontSize: nameFontSize(clinicName),
                lineHeight: 1.1,
                letterSpacing: -2,
                wordBreak: "break-word",
              }}
            >
              {clinicName}
            </div>
          )}
        </div>
        <div style={{ display: "flex", fontSize: 28, color: MUTED }}>{footer}</div>
      </div>
    </div>
  );
}

/** Card for a code that does not exist: the app itself, nothing that could identify a physio. */
function GenericCard() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 40,
        background: "#f5f5f5",
        fontFamily: FONT,
        fontWeight: 700,
        color: FOREGROUND,
      }}
    >
      <div
        style={{
          width: 180,
          height: 180,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: FOREGROUND,
          borderRadius: 40,
        }}
      >
        <svg
          width={110}
          height={110}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fafafa"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={ACTIVITY_PATH} />
        </svg>
      </div>
      <div style={{ display: "flex", fontSize: 96, letterSpacing: -2 }}>Physio Trainer</div>
    </div>
  );
}

/**
 * Public, branding-only and identical for every link status, so shared caches may keep it. Not
 * under the patient pages' `no-store` (spec 10): that is for the page, which holds health data.
 * `noindex` keeps the image (whose URL carries the link code) out of image search.
 */
const CACHE_CONTROL = "public, max-age=3600";
/** A card drawn without its logo because loading it failed: retry soon instead of pinning it. */
const DEGRADED_CACHE_CONTROL = "public, max-age=60";

async function render(element: ReactElement, cacheControl = CACHE_CONTROL) {
  return new ImageResponse(element, {
    ...PREVIEW_IMAGE_SIZE,
    fonts: [{ name: FONT, data: await outfit(), style: "normal", weight: 700 }],
    headers: { "Cache-Control": cacheControl, "X-Robots-Tag": "noindex, nofollow" },
  });
}

export async function renderPreviewCard(input: PreviewCardInput, cacheControl?: string) {
  return render(<Card {...input} />, cacheControl);
}

/**
 * The image for a link code. Revoked, expired and PIN-protected links get the same card as an
 * active one (title included), so a crawler learns nothing about the link's status; an unknown code gets the
 * generic app card. Never touches `open_count` (crawler hits are not patient opens).
 */
export async function renderLinkPreview(code: string) {
  const resolved = await loadLink(code);
  if (resolved.status === "not_found") return render(<GenericCard />);
  const { branding, locale } = resolved.shell;
  const [logoSrc, t] = await Promise.all([
    loadLogoDataUri(branding.logoUrl),
    getTranslations({ locale, namespace: "Branding" }),
  ]);
  const degraded = branding.logoUrl !== null && logoSrc === null;
  return renderPreviewCard(
    {
      clinicName: branding.clinicName,
      title: resolved.shell.title,
      footer: t("poweredBy"),
      logoSrc,
      tokens: branding.tokens,
    },
    degraded ? DEGRADED_CACHE_CONTROL : CACHE_CONTROL,
  );
}
