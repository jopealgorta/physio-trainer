import { ImageResponse } from "next/og";

// ImageResponse can't read CSS variables: these match light-mode --primary and
// --primary-foreground in globals.css.
const PRIMARY = "#171717";
const PRIMARY_FOREGROUND = "#fafafa";

// lucide "activity", the mark in <Logo />.
const ACTIVITY_PATH =
  "M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2";

/**
 * The app icon as a PNG. `rounded` draws the Logo's rounded square on a transparent background;
 * otherwise the colour fills the canvas (maskable and Apple icons, which the OS masks itself).
 * `glyph` is the mark's share of the canvas: keep maskable icons inside the 80% safe zone.
 */
export function appIconImage(
  size: number,
  { rounded, glyph }: { rounded: boolean; glyph: number },
) {
  const glyphSize = Math.round(size * glyph);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: PRIMARY,
        borderRadius: rounded ? Math.round(size * 0.22) : 0,
      }}
    >
      <svg
        width={glyphSize}
        height={glyphSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke={PRIMARY_FOREGROUND}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={ACTIVITY_PATH} />
      </svg>
    </div>,
    { width: size, height: size },
  );
}
