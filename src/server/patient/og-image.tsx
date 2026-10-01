import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";
import type { ReactElement } from "react";

import { ACTIVITY_PATH } from "@/lib/app-icon-image";
import { LOGO_CONTENT_TYPES, LOGO_MAX_BYTES, sniffImageType } from "@/lib/branding";
import { cardColors, PREVIEW_IMAGE_SIZE } from "@/lib/link-preview";
import type { BrandTokens } from "@/lib/color";

import { loadLink } from "./load";

/** What the card shows: branding only (spec 11). Never anything about the patient. */
export type PreviewCardInput = {
  clinicName: string;
  /** A `data:` URI the card can embed, or null for the initial circle. */
  logoSrc: string | null;
  tokens: BrandTokens | null;
};

const FETCH_TIMEOUT_MS = 3000;
const FONT_FILE = join(process.cwd(), "src/assets/fonts/Outfit-Bold.ttf");
const FOREGROUND = "#171717";
const MUTED = "#737373";
const FONT = "Outfit";

let font: Promise<Buffer> | null = null;
/** Bundled, so rendering never needs the network; read once per server instance. */
const outfit = () => (font ??= readFile(FONT_FILE));

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
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > LOGO_MAX_BYTES) return null;
    const type = sniffImageType(bytes);
    if (type !== "png" && type !== "jpeg") return null;
    return `data:${LOGO_CONTENT_TYPES[type]};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return null;
  }
}

/** Longer names get a smaller type so up to 80 characters fit on two lines. */
export const nameFontSize = (name: string): number =>
  name.length <= 24 ? 96 : name.length <= 48 ? 72 : 56;

function Card({ clinicName, logoSrc, tokens }: PreviewCardInput) {
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
        </div>
        <div style={{ display: "flex", fontSize: 28, color: MUTED }}>Powered by Physio Trainer</div>
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

/** Public, branding-only and identical for every link status, so it can be cached by anyone. */
const CACHE_CONTROL = "public, max-age=3600";

async function render(element: ReactElement) {
  return new ImageResponse(element, {
    ...PREVIEW_IMAGE_SIZE,
    fonts: [{ name: FONT, data: await outfit(), style: "normal", weight: 700 }],
    headers: { "Cache-Control": CACHE_CONTROL },
  });
}

export async function renderPreviewCard(input: PreviewCardInput) {
  return render(<Card {...input} />);
}

/**
 * The image for a link code. Revoked, expired and PIN-protected links get the same card as an
 * active one, so a crawler learns nothing about the link's status; an unknown code gets the
 * generic app card. Never touches `open_count` (crawler hits are not patient opens).
 */
export async function renderLinkPreview(code: string) {
  const resolved = await loadLink(code);
  if (resolved.status === "not_found") return render(<GenericCard />);
  const { branding } = resolved.shell;
  return renderPreviewCard({
    clinicName: branding.clinicName,
    logoSrc: await loadLogoDataUri(branding.logoUrl),
    tokens: branding.tokens,
  });
}
