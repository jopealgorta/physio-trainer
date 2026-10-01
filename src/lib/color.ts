/**
 * Colour maths for physio branding (docs/specs/09-physio-branding.md): hex parsing, OKLCH
 * (Björn Ottosson's OKLab), WCAG 2.x contrast, and readable light/dark accent tokens.
 * Pure, no DOM: shared by the server (patient pages, OG images, PDFs) and the settings preview.
 */

export type Oklch = { l: number; c: number; h: number };
export type ModeTokens = { primary: string; primaryForeground: string };
export type BrandTokens = { light: ModeTokens; dark: ModeTokens; adjusted: boolean };

/** WCAG 2.x minimum for large text and UI components (buttons against the page). */
export const MIN_UI_CONTRAST = 3;
/** `--background`/`--card` in light mode. */
export const LIGHT_SURFACE = "#ffffff";
/** `--card` in dark mode (oklch 0.205): lighter than the dark background, so the stricter check. */
export const DARK_SURFACE = "#171717";

const WHITE = "#ffffff";
const BLACK = "#000000";
const L_STEP = 0.005;

type Rgb = [number, number, number];

export function normalizeHex(input: string): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!match) return null;
  const digits = match[1].toLowerCase();
  const full = digits.length === 3 ? [...digits].map((d) => d + d).join("") : digits;
  return `#${full}`;
}

function hexToRgb(hex: string): Rgb {
  const normalized = normalizeHex(hex);
  if (!normalized) throw new Error(`Invalid hex colour: ${hex}`);
  const n = Number.parseInt(normalized.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(rgb: Rgb): string {
  return `#${rgb
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** `hex` at `amount` (0–1) opacity over white, as a hex colour: a soft tint of an accent. */
export function mixOnWhite(hex: string, amount: number): string {
  return rgbToHex(hexToRgb(hex).map((v) => 255 - (255 - v) * amount) as Rgb);
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => toLinear(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb(hex).map((v) => toLinear(v / 255));
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const c = Math.hypot(A, B);
  const h = c < 1e-4 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

/** Linear sRGB (0–1, may be out of gamut). */
function oklchToLinearRgb({ l, c, h }: Oklch): Rgb {
  const rad = (h * Math.PI) / 180;
  const A = c * Math.cos(rad);
  const B = c * Math.sin(rad);
  const l3 = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m3 = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s3 = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ];
}

const inGamut = (rgb: Rgb) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** OKLCH → hex, reducing chroma (same L and hue) until the colour fits in sRGB. */
export function oklchToHex(color: Oklch): string {
  const l = Math.min(1, Math.max(0, color.l));
  let rgb = oklchToLinearRgb({ ...color, l });
  if (!inGamut(rgb)) {
    let lo = 0;
    let hi = color.c;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinearRgb({ l, c: mid, h: color.h }))) lo = mid;
      else hi = mid;
    }
    rgb = oklchToLinearRgb({ l, c: lo, h: color.h });
  }
  return rgbToHex(rgb.map((v) => fromLinear(Math.min(1, Math.max(0, v))) * 255) as Rgb);
}

/** Moves lightness (keeping hue) towards black or white until `surface` contrast is enough. */
function readableOn(accent: string, surface: string, direction: -1 | 1): string {
  if (contrastRatio(accent, surface) >= MIN_UI_CONTRAST) return accent;
  const lch = hexToOklch(accent);
  for (let l = lch.l; l >= 0 && l <= 1; l += direction * L_STEP) {
    const candidate = oklchToHex({ ...lch, l });
    if (contrastRatio(candidate, surface) >= MIN_UI_CONTRAST) return candidate;
  }
  return direction < 0 ? BLACK : WHITE;
}

function foregroundFor(primary: string): string {
  return contrastRatio(primary, WHITE) >= contrastRatio(primary, BLACK) ? WHITE : BLACK;
}

/** Readable `--primary` / `--primary-foreground` for light and dark mode from one accent. */
export function brandTokens(accent: string): BrandTokens {
  const hex = normalizeHex(accent);
  if (!hex) throw new Error(`Invalid accent colour: ${accent}`);
  const light = readableOn(hex, LIGHT_SURFACE, -1);
  const dark = readableOn(hex, DARK_SURFACE, 1);
  return {
    light: { primary: light, primaryForeground: foregroundFor(light) },
    dark: { primary: dark, primaryForeground: foregroundFor(dark) },
    adjusted: light !== hex || dark !== hex,
  };
}
