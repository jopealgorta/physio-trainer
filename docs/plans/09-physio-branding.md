# Spec 09 · Physio branding: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Physios set a clinic name, logo, accent colour and contact details in Settings →
Branding with a live preview; `getBranding()` + `<BrandingStyle>` are ready for the patient
page (10), link previews (11) and PDFs (14).

**Architecture:** Seven nullable branding columns on `physios` (with DB check constraints) and
a public `branding` Storage bucket whose write policies check the first path segment against
`auth.uid()`. Pure colour maths in `src/lib/color.ts` derive readable light/dark `--primary`
tokens (auto-adjusting lightness at the same hue until ≥ 3:1 against the background). Pure
helpers in `src/lib/branding.ts` normalise contact fields and build the `Branding` view model
used by both the server (`getBranding`) and the client preview. The settings page becomes
URL-driven tabs (`?section=profile|branding|account`). One Server Action saves everything; the
logo is resized in the browser (≤ 512 px WebP, PNG fallback), sniffed by magic bytes on the
server, uploaded with the user's Supabase session (Storage RLS applies) inside
`saveBranding`, and the replaced logo is deleted after the transaction commits.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, next-intl 4, Drizzle ORM +
drizzle-kit, Supabase Storage (`@supabase/ssr`, `@supabase/supabase-js`), zod v4, Vitest 5 +
Testing Library, Playwright 1.63. No new dependencies.

**Spec:** [`docs/specs/09-physio-branding.md`](../specs/09-physio-branding.md) (read it and
[`docs/architecture.md`](../architecture.md) before starting).

## Global Constraints

- Node 24: run `source ~/.nvm/nvm.sh && nvm use 24` before `pnpm` if `node -v` is below 22.
- Branch `feat/09-physio-branding` (already checked out in this worktree).
- Next.js 16: `searchParams`, `cookies()` are async. Check `node_modules/next/dist/docs/`
  before using an unfamiliar API.
- **Local Supabase is shared with the main checkout.** Never run `pnpm db:reset`. Apply new
  migrations with `pnpm exec supabase migration up`.
- Logos: PNG, WebP or JPEG only (no SVG). Stored file ≤ 2 MB (`LOGO_MAX_BYTES`); stored path
  `{physio_id}/logo-{uuid}.{png|webp|jpg}` in bucket `branding` (public read).
- Accent colour: lowercase `#rrggbb` or null. Contrast guard: primary vs background ≥ 3:1 in
  light (`#ffffff`) and dark (card `#171717`) mode; button text (black/white) ≥ 4.5:1.
- Patient surfaces show a small "Powered by Physio Trainer" line (not white-label).
- Settings sections: `profile` (default), `branding`, `account`, selected by `?section=`.
- Every user-visible string in **both** `messages/en.json` and `messages/es.json` (same keys,
  same ICU args). Spanish is Rioplatense voseo ("elegí", "subí", "ingresá"), sentence case.
- Accent colour uses the `primary` token only; never hard-code colours in components (the
  swatch buttons themselves may use inline `style={{ backgroundColor: hex }}`: that _is_ the
  data being displayed).
- Never pass non-action functions from Server to Client Components. Server Actions as props
  are fine (`ProfileForm` pattern).
- No new top-level routes (`RESERVED_HANDLES` unchanged).
- Forms: native `<form action>` + `useActionState`, dispatch from `onSubmit` via
  `startTransition` (see `src/components/physios/profile-form.tsx` for why).
- Status/validation text in `aria-live` regions; no toast library.
- Run `pnpm format` before every commit; `pnpm check` must pass before every commit.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Extreme custom colours** (`#ffff00`, `#fafafa`, `#ffffff`, `#000000`, `#0a0a0a`, pure
   saturated primaries) must still produce readable buttons in light _and_ dark mode, never
   throw, never loop. → Task 1 grid sweep test over 4 096 colours.
2. **Phone typed the local way** (`+54 9 11 1234-5678`, `(011) 1234 5678`, `0054…`) must
   normalise to `+5491112345678` or give a clear "include country code" error; WhatsApp link is
   digits only. → Task 2 unit tests.
3. **A non-image renamed `.png`**, a 0-byte file, or a > 2 MB file posted straight to the action
   (bypassing the browser resize) must be rejected with a field error, nothing uploaded. →
   Task 4 unit tests for `checkLogo` and action test.
4. **Physio A writing into physio B's logo folder** (forged Storage call, or a DB update with
   B's path) must fail at both Storage RLS and the DB check. → Task 3 integration tests.
5. **Replacing a logo** must leave exactly one object in the physio's folder (old one deleted
   after commit) and change the public URL (cache-bust); a failed DB update must delete the
   just-uploaded object. → Task 4 integration + unit tests.
6. **Clearing a field** saves `null`, not `""`; turning "show contact" off makes
   `getBranding().contact` null. → Task 2 + Task 4 tests.

---

## File map

| File                                                  | Task | Responsibility                                          |
| ----------------------------------------------------- | ---- | ------------------------------------------------------- |
| `docs/specs/09-physio-branding.md`                    | 1, 9 | Answers to open questions; status + decisions           |
| `src/lib/color.ts` (+ `.test.ts`)                     | 1    | Hex/OKLCH/WCAG maths, `brandTokens`                     |
| `src/lib/branding.ts` (+ `.test.ts`)                  | 2    | Palette, normalisers, `sniffImageType`, `buildBranding` |
| `src/db/schema/physios.ts`                            | 3    | Branding columns + checks                               |
| `supabase/migrations/*_physios-branding.sql` (+ meta) | 3    | Generated                                               |
| `supabase/migrations/*_branding-storage.sql` (+ meta) | 3    | Custom: bucket + storage policies                       |
| `src/db/branding.int.test.ts`                         | 3    | DB checks + storage policies                            |
| `src/server/branding/schemas.ts` (+ `.test.ts`)       | 4    | zod `brandingSchema`, `checkLogo`, form state types     |
| `src/server/branding/queries.ts`                      | 4    | `getBranding`                                           |
| `src/server/branding/mutations.ts` (+ `.test.ts`)     | 4    | `saveBranding` (DB + injected logo storage)             |
| `src/server/branding/storage.ts`                      | 4    | `supabaseLogoStorage(client)`                           |
| `src/server/branding/actions.ts` (+ `.test.ts`)       | 4    | `updateBrandingAction`                                  |
| `src/server/branding/branding.int.test.ts`            | 4    | save/get via `runAsPhysio` + real storage               |
| `next.config.ts`                                      | 4    | `experimental.serverActions.bodySizeLimit: "3mb"`       |
| `src/components/branding/branding-style.tsx` (+ test) | 5    | `<BrandingStyle tokens scope>`                          |
| `src/components/branding/powered-by.tsx`              | 5    | "Powered by …" line                                     |
| `src/config/settings.ts` (+ `.test.ts`)               | 6    | Section list + parser                                   |
| `src/components/settings/settings-tabs.tsx`           | 6    | Link tabs                                               |
| `src/app/(app)/settings/page.tsx`                     | 6, 7 | Tabs + sections                                         |
| `e2e/settings.spec.ts`                                | 6    | Account tab moved                                       |
| `src/lib/resize-image.ts`                             | 7    | Browser-only canvas resize                              |
| `src/components/branding/branding-form.tsx` (+ test)  | 7    | Form                                                    |
| `src/components/branding/accent-picker.tsx`           | 7    | Swatches + custom                                       |
| `src/components/branding/branding-preview.tsx`        | 7    | Patient header, PDF header, link preview mocks          |
| `messages/en.json`, `messages/es.json`                | 5–7  | `Settings.tabs`, `Settings.branding`, `Branding`        |
| `e2e/branding.spec.ts`                                | 8    | Accent → preview; persist; logo upload                  |
| `docs/architecture.md`, `docs/specs/README.md`        | 9    | Public-bucket exception; status                         |

---

### Task 1: Spec answers + colour maths

**Files:**

- Modify: `docs/specs/09-physio-branding.md` (Open questions → answered)
- Create: `src/lib/color.ts`, `src/lib/color.test.ts`

**Interfaces:**

- Produces:
  - `normalizeHex(input: string): string | null` → lowercase `#rrggbb`; accepts `#RGB`,
    `RGB`, `#RRGGBB`, `RRGGBB`, surrounding whitespace.
  - `contrastRatio(a: string, b: string): number` (hex inputs, WCAG 2.x).
  - `hexToOklch(hex: string): { l: number; c: number; h: number }`,
    `oklchToHex(lch): string` (clamps chroma into sRGB gamut, same L and h).
  - `type BrandTokens = { light: ModeTokens; dark: ModeTokens; adjusted: boolean }`,
    `type ModeTokens = { primary: string; primaryForeground: string }` (hex strings).
  - `brandTokens(accent: string): BrandTokens` (throws `Error` on invalid hex).
  - Constants `MIN_UI_CONTRAST = 3`, `LIGHT_SURFACE = "#ffffff"`, `DARK_SURFACE = "#171717"`.

- [ ] **Step 1: Record the answers in the spec.** Replace the "Open questions" list with:

```markdown
## Open questions

1. SVG logos? → **No.** PNG, WebP and JPEG only (a public bucket serving SVG is a stored-XSS
   risk; raster works for OG images and PDFs).
2. App name on patient pages? → **Yes, a small "Powered by Physio Trainer" line** at the
   bottom of patient-facing surfaces, not fully white-label.
3. (Added) Low-contrast custom accent? → **Auto-adjust**: keep the chosen colour, derive
   light/dark tokens at the same hue with lightness nudged until ≥ 3:1; the form says so.
4. (Added) Settings layout? → **Tabs** driven by `?section=profile|branding|account`.
```

- [ ] **Step 2: Write the failing tests** in `src/lib/color.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  brandTokens,
  contrastRatio,
  DARK_SURFACE,
  hexToOklch,
  LIGHT_SURFACE,
  normalizeHex,
  oklchToHex,
} from "./color";

describe("normalizeHex", () => {
  it.each([
    ["#0F766E", "#0f766e"],
    ["0f766e", "#0f766e"],
    ["#abc", "#aabbcc"],
    ["  #ABC ", "#aabbcc"],
  ])("normalises %j", (input, expected) => expect(normalizeHex(input)).toBe(expected));

  it.each(["", "#", "#12", "#12345", "#1234567", "red", "#gggggg", "rgb(0,0,0)"])(
    "rejects %j",
    (input) => expect(normalizeHex(input)).toBeNull(),
  );
});

describe("contrastRatio", () => {
  it("matches known WCAG pairs", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });
  it("is symmetric", () => {
    expect(contrastRatio("#0f766e", "#ffffff")).toBe(contrastRatio("#ffffff", "#0f766e"));
  });
});

describe("OKLCH", () => {
  it("converts pure red", () => {
    const { l, c, h } = hexToOklch("#ff0000");
    expect(l).toBeCloseTo(0.628, 3);
    expect(c).toBeCloseTo(0.2577, 3);
    expect(h).toBeCloseTo(29.23, 1);
  });
  it.each(["#000000", "#ffffff", "#0f766e", "#2563eb", "#db2777", "#123456", "#fedcba"])(
    "round-trips %s",
    (hex) => expect(oklchToHex(hexToOklch(hex))).toBe(hex),
  );
  it("clamps out-of-gamut chroma instead of producing invalid hex", () => {
    expect(oklchToHex({ l: 0.9, c: 0.4, h: 260 })).toMatch(/^#[0-9a-f]{6}$/);
  });
  it("maps the app's surfaces", () => {
    expect(oklchToHex({ l: 0.205, c: 0, h: 0 })).toBe(DARK_SURFACE);
    expect(oklchToHex({ l: 1, c: 0, h: 0 })).toBe(LIGHT_SURFACE);
  });
});

describe("brandTokens", () => {
  it("keeps a readable accent as-is in light mode", () => {
    const tokens = brandTokens("#0f766e");
    expect(tokens.light.primary).toBe("#0f766e");
    expect(tokens.light.primaryForeground).toBe("#ffffff");
  });

  it("darkens a pale accent for light mode and says so", () => {
    const tokens = brandTokens("#ffff00");
    expect(tokens.adjusted).toBe(true);
    expect(tokens.light.primary).not.toBe("#ffff00");
    expect(contrastRatio(tokens.light.primary, LIGHT_SURFACE)).toBeGreaterThanOrEqual(3);
    // Same hue family: still yellow-ish.
    expect(Math.abs(hexToOklch(tokens.light.primary).h - hexToOklch("#ffff00").h)).toBeLessThan(15);
  });

  it("lightens a dark accent for dark mode", () => {
    const tokens = brandTokens("#1e3a8a");
    expect(tokens.dark.primary).not.toBe("#1e3a8a");
    expect(contrastRatio(tokens.dark.primary, DARK_SURFACE)).toBeGreaterThanOrEqual(3);
  });

  it("reports no adjustment when both modes pass", () => {
    // Mid-tone blue passes against white and #171717.
    expect(brandTokens("#2f6fdf").adjusted).toBe(false);
  });

  it("throws on an invalid colour", () => {
    expect(() => brandTokens("nope")).toThrow();
  });

  it("produces readable tokens for every colour in a 16-step RGB grid", () => {
    const steps = Array.from({ length: 16 }, (_, i) => i * 17);
    for (const r of steps)
      for (const g of steps)
        for (const b of steps) {
          const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
          const { light, dark } = brandTokens(hex);
          expect(contrastRatio(light.primary, LIGHT_SURFACE), hex).toBeGreaterThanOrEqual(3);
          expect(contrastRatio(dark.primary, DARK_SURFACE), hex).toBeGreaterThanOrEqual(3);
          expect(contrastRatio(light.primary, light.primaryForeground), hex).toBeGreaterThanOrEqual(
            4.5,
          );
          expect(contrastRatio(dark.primary, dark.primaryForeground), hex).toBeGreaterThanOrEqual(
            4.5,
          );
        }
  });
});
```

- [ ] **Step 3: Run** `pnpm test src/lib/color.test.ts` → FAIL (module not found).

- [ ] **Step 4: Implement** `src/lib/color.ts`:

```ts
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
```

Note: black/white foreground on any colour has max contrast ≥ 4.58 (proved at luminance
≈ 0.179), so the ≥ 4.5 assertion holds for every colour. If a single known-pair assertion is
off in the 3rd decimal (e.g. OKLCH of red), check the constant typed, not the test.

- [ ] **Step 5: Run** `pnpm test src/lib/color.test.ts` → PASS. If `#2f6fdf` turns out to be
      adjusted, pick another mid-tone that passes both (print both contrasts) and update the test.

- [ ] **Step 6: Commit**

```bash
pnpm format && pnpm check
git add docs/specs/09-physio-branding.md src/lib/color.ts src/lib/color.test.ts
git commit -m "feat(branding): colour maths and readable accent tokens (spec 09)"
```

---

### Task 2: Branding helpers (palette, normalisers, view model)

**Files:**

- Create: `src/lib/branding.ts`, `src/lib/branding.test.ts`

**Interfaces:**

- Consumes: `normalizeHex`, `brandTokens`, `BrandTokens` from `@/lib/color`.
- Produces:

```ts
export const BRANDING_BUCKET = "branding";
export const LOGO_MAX_BYTES = 2 * 1024 * 1024; // stored file
export const LOGO_SOURCE_MAX_BYTES = 10 * 1024 * 1024; // picked file, before browser resize
export const LOGO_MAX_DIMENSION = 512;
export const LOGO_ACCEPT = "image/png,image/webp,image/jpeg";
export type LogoType = "png" | "webp" | "jpeg";
export const LOGO_CONTENT_TYPES: Record<LogoType, string>; // image/png, image/webp, image/jpeg
export const LOGO_EXTENSIONS: Record<LogoType, string>; // png, webp, jpg
export const ACCENT_PALETTE: readonly { name: AccentName; hex: string }[]; // 10 entries
export type AccentName =
  "teal" | "sky" | "blue" | "indigo" | "violet" | "pink" | "red" | "orange" | "green" | "slate";
export function sniffImageType(bytes: Uint8Array): LogoType | null;
export function normalizePhone(input: string): string | null; // "+5491112345678"
export function whatsappUrl(phone: string): string; // "https://wa.me/5491112345678"
export function normalizeWebsite(
  input: string,
): { ok: true; url: string } | { ok: false; error: "websiteInvalid" | "websiteNotHttps" };
export function logoPublicUrl(supabaseUrl: string, path: string): string;
export type BrandingSource = {
  displayName: string;
  clinicName: string | null;
  logoUrl: string | null;
  accentColor: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  showContactToPatients: boolean;
};
export type BrandingContact = {
  email: string | null;
  phone: string | null;
  whatsappUrl: string | null;
  website: string | null;
};
export type Branding = {
  clinicName: string;
  logoUrl: string | null;
  accentColor: string | null;
  tokens: BrandTokens | null;
  contact: BrandingContact | null;
};
export function buildBranding(source: BrandingSource): Branding;
```

- [ ] **Step 1: Write the failing tests** in `src/lib/branding.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  ACCENT_PALETTE,
  buildBranding,
  logoPublicUrl,
  normalizePhone,
  normalizeWebsite,
  sniffImageType,
  whatsappUrl,
  type BrandingSource,
} from "./branding";
import { brandTokens } from "./color";

const bytes = (...values: number[]) => new Uint8Array(values);

describe("ACCENT_PALETTE", () => {
  it("has 10 distinct colours", () => {
    expect(ACCENT_PALETTE).toHaveLength(10);
    expect(new Set(ACCENT_PALETTE.map((s) => s.hex)).size).toBe(10);
  });
  it.each(ACCENT_PALETTE)("$name is used unchanged in light mode", ({ hex }) => {
    expect(brandTokens(hex).light.primary).toBe(hex);
  });
});

describe("sniffImageType", () => {
  it("detects PNG, JPEG and WebP by magic bytes", () => {
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("png");
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
    expect(sniffImageType(webp)).toBe("webp");
  });
  it.each([
    ["empty", bytes()],
    ["svg", new TextEncoder().encode("<svg xmlns=")],
    ["gif", new TextEncoder().encode("GIF89a")],
    ["riff but not webp", new TextEncoder().encode("RIFF\0\0\0\0WAVEfmt ")],
    ["text", new TextEncoder().encode("hello world")],
  ])("rejects %s", (_name, input) => expect(sniffImageType(input)).toBeNull());
});

describe("normalizePhone", () => {
  it.each([
    ["+54 9 11 1234-5678", "+5491112345678"],
    ["+34 (612) 345 678", "+34612345678"],
    ["  +1.415.555.0100 ", "+14155550100"],
    ["0054 9 11 1234 5678", "+5491112345678"],
  ])("normalises %j", (input, expected) => expect(normalizePhone(input)).toBe(expected));

  it.each(["", "12345678", "(011) 1234 5678", "+12", "+1234567890123456", "+54 abc 123"])(
    "rejects %j (needs an international number)",
    (input) => expect(normalizePhone(input)).toBeNull(),
  );
});

describe("whatsappUrl", () => {
  it("uses digits only", () =>
    expect(whatsappUrl("+5491112345678")).toBe("https://wa.me/5491112345678"));
});

describe("normalizeWebsite", () => {
  it.each([
    ["example.com", "https://example.com/"],
    ["https://Example.com/about", "https://example.com/about"],
    ["  www.kine.com.ar ", "https://www.kine.com.ar/"],
  ])("accepts %j", (input, url) => expect(normalizeWebsite(input)).toEqual({ ok: true, url }));

  it("rejects http", () =>
    expect(normalizeWebsite("http://example.com")).toEqual({
      ok: false,
      error: "websiteNotHttps",
    }));
  it.each([
    "not a url",
    "javascript:alert(1)",
    "ftp://x.com",
    "https://",
    "localhost",
    "x".repeat(2100),
  ])("rejects %j", (input) => expect(normalizeWebsite(input)).toMatchObject({ ok: false }));
});

describe("logoPublicUrl", () => {
  it("builds the public object URL", () => {
    expect(logoPublicUrl("http://127.0.0.1:54321", "abc/logo-1.webp")).toBe(
      "http://127.0.0.1:54321/storage/v1/object/public/branding/abc/logo-1.webp",
    );
  });
});

describe("buildBranding", () => {
  const source: BrandingSource = {
    displayName: "María López",
    clinicName: null,
    logoUrl: null,
    accentColor: null,
    contactEmail: null,
    contactPhone: null,
    website: null,
    showContactToPatients: true,
  };

  it("falls back to the display name and app defaults", () => {
    expect(buildBranding(source)).toEqual({
      clinicName: "María López",
      logoUrl: null,
      accentColor: null,
      tokens: null,
      contact: null,
    });
  });

  it("uses the clinic name and accent tokens when set", () => {
    const branding = buildBranding({ ...source, clinicName: "Kine Sur", accentColor: "#0f766e" });
    expect(branding.clinicName).toBe("Kine Sur");
    expect(branding.tokens).toEqual(brandTokens("#0f766e"));
  });

  it("exposes contact details with a WhatsApp link", () => {
    const branding = buildBranding({
      ...source,
      contactEmail: "hola@kine.com",
      contactPhone: "+5491112345678",
      website: "https://kine.com/",
    });
    expect(branding.contact).toEqual({
      email: "hola@kine.com",
      phone: "+5491112345678",
      whatsappUrl: "https://wa.me/5491112345678",
      website: "https://kine.com/",
    });
  });

  it("hides contact details when the physio turned them off", () => {
    const branding = buildBranding({
      ...source,
      contactEmail: "hola@kine.com",
      showContactToPatients: false,
    });
    expect(branding.contact).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `pnpm test src/lib/branding.test.ts` → FAIL.

- [ ] **Step 3: Implement** `src/lib/branding.ts`:

```ts
/**
 * Physio branding helpers (docs/specs/09-physio-branding.md). Pure: shared by the server
 * (getBranding) and the settings preview.
 */
import { brandTokens, type BrandTokens } from "./color";

export const BRANDING_BUCKET = "branding";
/** Stored logo (after the browser's resize). Matches the bucket's file_size_limit. */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
/** Picked file, before the browser resizes it; bigger images are too slow to decode. */
export const LOGO_SOURCE_MAX_BYTES = 10 * 1024 * 1024;
export const LOGO_MAX_DIMENSION = 512;
export const LOGO_ACCEPT = "image/png,image/webp,image/jpeg";

export type LogoType = "png" | "webp" | "jpeg";
export const LOGO_CONTENT_TYPES: Record<LogoType, string> = {
  png: "image/png",
  webp: "image/webp",
  jpeg: "image/jpeg",
};
export const LOGO_EXTENSIONS: Record<LogoType, string> = { png: "png", webp: "webp", jpeg: "jpg" };

export type AccentName =
  "teal" | "sky" | "blue" | "indigo" | "violet" | "pink" | "red" | "orange" | "green" | "slate";

/** Curated swatches; each is readable on white without adjustment (a test enforces it). */
export const ACCENT_PALETTE: readonly { name: AccentName; hex: string }[] = [
  { name: "teal", hex: "#0f766e" },
  { name: "sky", hex: "#0369a1" },
  { name: "blue", hex: "#2563eb" },
  { name: "indigo", hex: "#4f46e5" },
  { name: "violet", hex: "#7c3aed" },
  { name: "pink", hex: "#db2777" },
  { name: "red", hex: "#dc2626" },
  { name: "orange", hex: "#c2410c" },
  { name: "green", hex: "#15803d" },
  { name: "slate", hex: "#334155" },
];

const startsWith = (bytes: Uint8Array, prefix: number[], offset = 0) =>
  bytes.length >= offset + prefix.length && prefix.every((b, i) => bytes[offset + i] === b);
const ascii = (text: string) => [...text].map((ch) => ch.charCodeAt(0));

/** Real image type from the file's first bytes; the browser-supplied MIME type is not trusted. */
export function sniffImageType(bytes: Uint8Array): LogoType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return "webp";
  return null;
}

/**
 * International phone number as "+<digits>" (E.164 length 7–15 digits), or null. A leading
 * "00" counts as "+". Local numbers are rejected: WhatsApp links need the country code.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!/^(\+|00)[\d\s().-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/^00/, "").replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? `+${digits}` : null;
}

export function whatsappUrl(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}

const WEBSITE_MAX_LENGTH = 2048;

/** https URL; a bare domain gets "https://". Plain http is rejected, not silently upgraded. */
export function normalizeWebsite(
  input: string,
): { ok: true; url: string } | { ok: false; error: "websiteInvalid" | "websiteNotHttps" } {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > WEBSITE_MAX_LENGTH)
    return { ok: false, error: "websiteInvalid" };
  if (/^http:\/\//i.test(trimmed)) return { ok: false, error: "websiteNotHttps" };
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, error: "websiteInvalid" };
  }
  if (url.protocol !== "https:" || !url.hostname.includes(".")) {
    return { ok: false, error: "websiteInvalid" };
  }
  return { ok: true, url: url.toString() };
}

export function logoPublicUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl}/storage/v1/object/public/${BRANDING_BUCKET}/${path}`;
}

export type BrandingSource = {
  displayName: string;
  clinicName: string | null;
  logoUrl: string | null;
  accentColor: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  showContactToPatients: boolean;
};

export type BrandingContact = {
  email: string | null;
  phone: string | null;
  whatsappUrl: string | null;
  website: string | null;
};

export type Branding = {
  clinicName: string;
  logoUrl: string | null;
  accentColor: string | null;
  /** null = app default colours. */
  tokens: BrandTokens | null;
  /** null when hidden from patients or nothing is set. */
  contact: BrandingContact | null;
};

/** What patient-facing surfaces show; the settings preview builds it from form state. */
export function buildBranding(source: BrandingSource): Branding {
  const contact: BrandingContact = {
    email: source.contactEmail,
    phone: source.contactPhone,
    whatsappUrl: source.contactPhone ? whatsappUrl(source.contactPhone) : null,
    website: source.website,
  };
  const hasContact = Boolean(contact.email || contact.phone || contact.website);
  return {
    clinicName: source.clinicName?.trim() || source.displayName,
    logoUrl: source.logoUrl,
    accentColor: source.accentColor,
    tokens: source.accentColor ? brandTokens(source.accentColor) : null,
    contact: source.showContactToPatients && hasContact ? contact : null,
  };
}
```

- [ ] **Step 4: Run** `pnpm test src/lib/branding.test.ts` → PASS. If a palette colour fails
      "unchanged in light mode", darken that one swatch (keep hue) until it passes.

- [ ] **Step 5: Commit**

```bash
pnpm format && pnpm check
git add src/lib/branding.ts src/lib/branding.test.ts
git commit -m "feat(branding): palette, contact normalisers and branding view model"
```

---

### Task 3: Database columns, bucket and storage policies

**Files:**

- Modify: `src/db/schema/physios.ts`
- Create (generated): `supabase/migrations/<ts>_physios-branding.sql` + meta snapshot/journal
- Create (custom): `supabase/migrations/<ts>_branding-storage.sql` + meta
- Create: `src/db/branding.int.test.ts`

**Interfaces:**

- Produces: `Physio` gains `clinicName, logoPath, accentColor, contactEmail, contactPhone,
website: string | null` and `showContactToPatients: boolean`. Bucket `branding`.
  Constraint names: `physios_clinic_name_length`, `physios_accent_color_format`,
  `physios_logo_path_own`, `physios_contact_email_length`, `physios_contact_phone_format`,
  `physios_website_format`.

- [ ] **Step 1: Write the failing integration test** `src/db/branding.int.test.ts`:

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { physios } from "@/db/schema";
import { env } from "@/env";
import { BRANDING_BUCKET, logoPublicUrl } from "@/lib/branding";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";
import { adminClient, signInTestUser } from "@/test/int/supabase";

// 1×1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function clientFor(accessToken?: string): SupabaseClient {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
}

const logoPath = (physioId: string) => `${physioId}/logo-${crypto.randomUUID()}.png`;
const upload = (
  client: SupabaseClient,
  path: string,
  body: Buffer = PNG,
  contentType = "image/png",
) => client.storage.from(BRANDING_BUCKET).upload(path, body, { contentType });

describe("branding columns", () => {
  let maria: TestPhysio;
  let other: TestPhysio;

  beforeAll(async () => {
    [maria, other] = await Promise.all([createTestPhysio(), createTestPhysio()]);
  });
  afterAll(() => deleteTestPhysios(maria, other));

  const update = (values: Partial<typeof physios.$inferInsert>, id = maria.id) =>
    db.update(physios).set(values).where(eq(physios.id, id));

  it("defaults to no branding with contact shown", async () => {
    const [row] = await db.select().from(physios).where(eq(physios.id, maria.id));
    expect(row).toMatchObject({
      clinicName: null,
      logoPath: null,
      accentColor: null,
      contactEmail: null,
      contactPhone: null,
      website: null,
      showContactToPatients: true,
    });
  });

  it("accepts valid values", async () => {
    await expect(
      update({
        clinicName: "Kine Sur",
        accentColor: "#0f766e",
        logoPath: logoPath(maria.id),
        contactEmail: "hola@kine.com",
        contactPhone: "+5491112345678",
        website: "https://kine.com/",
      }),
    ).resolves.toBeDefined();
  });

  it.each([
    ["accent not lowercase hex", { accentColor: "#0F766E" }],
    ["accent named colour", { accentColor: "teal" }],
    ["clinic name too long", { clinicName: "x".repeat(81) }],
    ["empty clinic name", { clinicName: "" }],
    ["phone without +", { contactPhone: "5491112345678" }],
    ["http website", { website: "http://kine.com" }],
    [
      "logo in another physio's folder",
      { logoPath: "00000000-0000-0000-0000-000000000000/logo-x.png" },
    ],
    ["logo with svg extension", { logoPath: "SELF/logo-00000000-0000-0000-0000-000000000000.svg" }],
  ])("rejects %s", async (_name, values) => {
    const resolved = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [
        k,
        typeof v === "string" ? v.replace("SELF", maria.id) : v,
      ]),
    );
    await expect(update(resolved)).rejects.toThrow();
  });
});

describe("branding bucket", () => {
  let maria: TestPhysio;
  let other: TestPhysio;
  let mariaClient: SupabaseClient;
  const anon = clientFor();

  beforeAll(async () => {
    [maria, other] = await Promise.all([createTestPhysio(), createTestPhysio()]);
    mariaClient = clientFor(await signInTestUser(maria.email));
  });

  afterAll(async () => {
    for (const physio of [maria, other]) {
      const { data } = await adminClient.storage.from(BRANDING_BUCKET).list(physio.id);
      if (data?.length) {
        await adminClient.storage
          .from(BRANDING_BUCKET)
          .remove(data.map((f) => `${physio.id}/${f.name}`));
      }
    }
    await deleteTestPhysios(maria, other);
  });

  it("lets a physio upload into their own folder, readable publicly without auth", async () => {
    const path = logoPath(maria.id);
    expect((await upload(mariaClient, path)).error).toBeNull();
    const response = await fetch(logoPublicUrl(env.NEXT_PUBLIC_SUPABASE_URL, path));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
  });

  it("refuses uploads into another physio's folder", async () => {
    expect((await upload(mariaClient, logoPath(other.id))).error).not.toBeNull();
  });

  it("refuses anonymous uploads", async () => {
    expect((await upload(anon, logoPath(maria.id))).error).not.toBeNull();
  });

  it("refuses non-image types and files over 2 MB", async () => {
    const text = await upload(
      mariaClient,
      `${maria.id}/logo-${crypto.randomUUID()}.png`,
      Buffer.from("hi"),
      "text/plain",
    );
    expect(text.error).not.toBeNull();
    const big = await upload(mariaClient, logoPath(maria.id), Buffer.alloc(2 * 1024 * 1024 + 1));
    expect(big.error).not.toBeNull();
  });

  it("does not let a physio delete another physio's logo", async () => {
    const path = logoPath(other.id);
    expect((await upload(adminClient, path)).error).toBeNull();
    await mariaClient.storage.from(BRANDING_BUCKET).remove([path]);
    const { data } = await adminClient.storage.from(BRANDING_BUCKET).list(other.id);
    expect(data?.map((f) => `${other.id}/${f.name}`)).toContain(path);
  });

  it("lets a physio delete their own logo", async () => {
    const path = logoPath(maria.id);
    await upload(mariaClient, path);
    const { data, error } = await mariaClient.storage.from(BRANDING_BUCKET).remove([path]);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run** `pnpm test:int src/db/branding.int.test.ts` → FAIL (unknown columns).

- [ ] **Step 3: Add the columns** to `src/db/schema/physios.ts` (import `boolean`):

```ts
    onboardedAt: timestamp({ withTimezone: true }),
    // Branding (docs/specs/09-physio-branding.md). null = not set / app default.
    clinicName: text(),
    logoPath: text(),
    accentColor: text(),
    contactEmail: text(),
    contactPhone: text(),
    website: text(),
    showContactToPatients: boolean().notNull().default(true),
    ...timestamps,
```

and checks next to the existing ones:

```ts
    check("physios_clinic_name_length", sql`char_length(${table.clinicName}) between 1 and 80`),
    check("physios_accent_color_format", sql`${table.accentColor} ~ '^#[0-9a-f]{6}$'`),
    // The logo must live in the physio's own Storage folder (same rule as the bucket policies).
    check(
      "physios_logo_path_own",
      sql`${table.logoPath} ~ ('^' || ${table.id}::text || '/logo-[0-9a-f-]{36}\\.(png|webp|jpg)$')`,
    ),
    check("physios_contact_email_length", sql`char_length(${table.contactEmail}) between 3 and 254`),
    check("physios_contact_phone_format", sql`${table.contactPhone} ~ '^\\+[0-9]{7,15}$'`),
    check(
      "physios_website_format",
      sql`${table.website} ~ '^https://' and char_length(${table.website}) <= 2048`,
    ),
```

(Null passes a check constraint, so every column stays optional. Inspect the generated SQL: the
regex must read `'\.(png|webp|jpg)$'` and `'^\+[0-9]{7,15}$'` in SQL; adjust escaping in the TS
template if drizzle doubled or dropped a backslash.)

- [ ] **Step 4: Generate** `pnpm db:generate --name physios-branding`; review the SQL
      (`alter table … add column …`, `add constraint … check …`).

- [ ] **Step 5: Custom migration** `pnpm exec drizzle-kit generate --custom --name branding-storage`,
      then fill it:

```sql
-- Public bucket for physio logos (docs/specs/09-physio-branding.md). Logos appear in link
-- previews and PDFs and hold no patient data, so reads are public; writes are limited to the
-- owner's folder: object names start with "{physio_id}/".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 2097152, array['image/png', 'image/webp', 'image/jpeg'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "branding_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'branding' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "branding_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'branding' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "branding_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'branding' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'branding' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "branding_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'branding' and (storage.foldername(name))[1] = (select auth.uid())::text);
```

- [ ] **Step 6: Apply** `pnpm exec supabase migration up` (NOT `db:reset`). Then run
      `pnpm db:generate` again and confirm "No schema changes" (CI checks this).

- [ ] **Step 7: Run** `pnpm test:int` → all PASS (incl. `schema-conventions`).

- [ ] **Step 8: Commit**

```bash
pnpm format && pnpm check
git add src/db/schema/physios.ts supabase/migrations src/db/branding.int.test.ts
git commit -m "feat(branding): branding columns, public logo bucket and storage policies"
```

---

### Task 4: Branding server domain (schemas, getBranding, saveBranding, action)

**Files:**

- Create: `src/server/branding/schemas.ts` (+ `schemas.test.ts`), `queries.ts`,
  `mutations.ts` (+ `mutations.test.ts`), `storage.ts`, `actions.ts` (+ `actions.test.ts`),
  `branding.int.test.ts`
- Modify: `next.config.ts`

**Interfaces:**

- Consumes: Task 2 helpers; `Physio` columns (Task 3); `Tx`, `runAsPhysio` (`@/db/rls`);
  `withPhysio` (`@/server/auth/session`); `createClient` (`@/lib/supabase/server`).
- Produces:

```ts
// schemas.ts
export const brandingSchema: z.ZodType<…>;  // form fields → BrandingInput
export type BrandingInput = {
  clinicName: string | null; accentColor: string | null; contactEmail: string | null;
  contactPhone: string | null; website: string | null; showContactToPatients: boolean;
  removeLogo: boolean;
};
export type ValidLogo = { bytes: Uint8Array; type: LogoType };
export function checkLogo(file: File): Promise<{ ok: true; logo: ValidLogo } | { ok: false; error: "logoTooLarge" | "logoInvalidType" }>;
export type BrandingFieldErrors = {
  clinicName?: "clinicNameTooLong"; accentColor?: "accentInvalid"; contactEmail?: "emailInvalid";
  contactPhone?: "phoneInvalid"; website?: "websiteInvalid" | "websiteNotHttps";
  logo?: "logoTooLarge" | "logoInvalidType";
};
export type BrandingFormState =
  | { status: "idle" }
  | { status: "saved"; logoUrl: string | null }
  | { status: "error"; fieldErrors: BrandingFieldErrors; formError?: "unknown" | "uploadFailed" };
export function brandingFieldErrors(error: z.ZodError): BrandingFieldErrors;

// mutations.ts
export type LogoStorage = {
  upload(path: string, logo: ValidLogo): Promise<void>;
  remove(paths: string[]): Promise<void>;
};
export type SaveBrandingResult =
  | { ok: true; data: { physio: Physio; staleLogoPath: string | null } }
  | { ok: false; error: "notFound" | "uploadFailed" };
export function saveBranding(tx: Tx, physioId: string,
  input: BrandingInput & { logo: ValidLogo | null }, storage: LogoStorage): Promise<SaveBrandingResult>;

// storage.ts
export function supabaseLogoStorage(client: SupabaseClient): LogoStorage;

// queries.ts
export type Queryable = Tx | typeof db;
export function getBranding(q: Queryable, physioId: string): Promise<(Branding & { updatedAt: Date }) | null>;
export function brandingSource(row: Physio): BrandingSource; // logoPath → public URL via env

// actions.ts
export function updateBrandingAction(state: BrandingFormState, formData: FormData): Promise<BrandingFormState>;
```

Form field names (Task 7 relies on them): `clinicName`, `accentColor`, `contactEmail`,
`contactPhone`, `website`, `showContactToPatients` (checkbox, value `"on"`), `removeLogo`
(hidden, value `"1"`), `logo` (File, added by JS only).

- [ ] **Step 1: Failing schema tests** `src/server/branding/schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { brandingFieldErrors, brandingSchema, checkLogo } from "./schemas";

const form = (overrides: Record<string, string> = {}) => ({
  clinicName: "",
  accentColor: "",
  contactEmail: "",
  contactPhone: "",
  website: "",
  ...overrides,
});

describe("brandingSchema", () => {
  it("turns blank fields into null and a missing checkbox into false", () => {
    expect(brandingSchema.parse(form())).toEqual({
      clinicName: null,
      accentColor: null,
      contactEmail: null,
      contactPhone: null,
      website: null,
      showContactToPatients: false,
      removeLogo: false,
    });
  });

  it("normalises values", () => {
    expect(
      brandingSchema.parse(
        form({
          clinicName: "  Kine Sur ",
          accentColor: "#0F766E",
          contactEmail: " Hola@Kine.com ",
          contactPhone: "+54 9 11 1234-5678",
          website: "kine.com",
          showContactToPatients: "on",
          removeLogo: "1",
        }),
      ),
    ).toEqual({
      clinicName: "Kine Sur",
      accentColor: "#0f766e",
      contactEmail: "hola@kine.com",
      contactPhone: "+5491112345678",
      website: "https://kine.com/",
      showContactToPatients: true,
      removeLogo: true,
    });
  });

  it("maps problems to i18n keys", () => {
    const result = brandingSchema.safeParse(
      form({
        clinicName: "x".repeat(81),
        accentColor: "teal",
        contactEmail: "nope",
        contactPhone: "11 1234 5678",
        website: "http://kine.com",
      }),
    );
    expect(result.success).toBe(false);
    expect(brandingFieldErrors(result.error!)).toEqual({
      clinicName: "clinicNameTooLong",
      accentColor: "accentInvalid",
      contactEmail: "emailInvalid",
      contactPhone: "phoneInvalid",
      website: "websiteNotHttps",
    });
  });

  it("tolerates missing fields (a tampered post)", () => {
    expect(brandingSchema.safeParse({}).success).toBe(true);
  });
});

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe("checkLogo", () => {
  it("accepts a PNG by content, whatever it is called", async () => {
    const file = new File([new Uint8Array([...PNG_HEADER, 1, 2, 3])], "logo.txt", {
      type: "text/plain",
    });
    await expect(checkLogo(file)).resolves.toMatchObject({ ok: true, logo: { type: "png" } });
  });
  it("rejects a text file renamed .png", async () => {
    const file = new File(["hello"], "logo.png", { type: "image/png" });
    await expect(checkLogo(file)).resolves.toEqual({ ok: false, error: "logoInvalidType" });
  });
  it("rejects files over 2 MB before reading them", async () => {
    const file = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.png");
    await expect(checkLogo(file)).resolves.toEqual({ ok: false, error: "logoTooLarge" });
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `schemas.ts`:

```ts
import { z } from "zod";

import {
  LOGO_MAX_BYTES,
  normalizePhone,
  normalizeWebsite,
  sniffImageType,
  type LogoType,
} from "@/lib/branding";
import { normalizeHex } from "@/lib/color";

const blankToNull = (value: string) => (value.trim() === "" ? null : value.trim());

/** Branding form fields. Messages are i18n keys (Settings.branding.errors.*). */
export const brandingSchema = z.object({
  clinicName: z
    .string()
    .default("")
    .transform((value) => value.trim())
    .pipe(z.string().max(80, "clinicNameTooLong"))
    .transform((value) => value || null),
  accentColor: z
    .string()
    .default("")
    .transform((value, ctx) => {
      if (!value.trim()) return null;
      const hex = normalizeHex(value);
      if (hex) return hex;
      ctx.addIssue({ code: "custom", message: "accentInvalid" });
      return z.NEVER;
    }),
  contactEmail: z
    .string()
    .default("")
    .transform(blankToNull)
    .pipe(z.email("emailInvalid").max(254, "emailInvalid").toLowerCase().nullable()),
  contactPhone: z
    .string()
    .default("")
    .transform((value, ctx) => {
      if (!value.trim()) return null;
      const phone = normalizePhone(value);
      if (phone) return phone;
      ctx.addIssue({ code: "custom", message: "phoneInvalid" });
      return z.NEVER;
    }),
  website: z
    .string()
    .default("")
    .transform((value, ctx) => {
      if (!value.trim()) return null;
      const result = normalizeWebsite(value);
      if (result.ok) return result.url;
      ctx.addIssue({ code: "custom", message: result.error });
      return z.NEVER;
    }),
  showContactToPatients: z
    .literal("on")
    .optional()
    .transform((value) => value === "on"),
  removeLogo: z
    .literal("1")
    .optional()
    .transform((value) => value === "1"),
});

export type BrandingInput = z.output<typeof brandingSchema>;
export type ValidLogo = { bytes: Uint8Array; type: LogoType };

/** Size limit, then the real type from magic bytes (the browser's MIME type is not trusted). */
export async function checkLogo(
  file: File,
): Promise<
  { ok: true; logo: ValidLogo } | { ok: false; error: "logoTooLarge" | "logoInvalidType" }
> {
  if (file.size > LOGO_MAX_BYTES) return { ok: false, error: "logoTooLarge" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  return type ? { ok: true, logo: { bytes, type } } : { ok: false, error: "logoInvalidType" };
}

export type BrandingFieldErrors = {
  clinicName?: "clinicNameTooLong";
  accentColor?: "accentInvalid";
  contactEmail?: "emailInvalid";
  contactPhone?: "phoneInvalid";
  website?: "websiteInvalid" | "websiteNotHttps";
  logo?: "logoTooLarge" | "logoInvalidType";
};

export type BrandingFormState =
  | { status: "idle" }
  | { status: "saved"; logoUrl: string | null }
  | { status: "error"; fieldErrors: BrandingFieldErrors; formError?: "unknown" | "uploadFailed" };

type SchemaField = Exclude<keyof BrandingFieldErrors, "logo">;

const KNOWN_CODES: Record<SchemaField, readonly string[]> = {
  clinicName: ["clinicNameTooLong"],
  accentColor: ["accentInvalid"],
  contactEmail: ["emailInvalid"],
  contactPhone: ["phoneInvalid"],
  website: ["websiteInvalid", "websiteNotHttps"],
};
const FALLBACK_CODES: Record<SchemaField, string> = {
  clinicName: "clinicNameTooLong",
  accentColor: "accentInvalid",
  contactEmail: "emailInvalid",
  contactPhone: "phoneInvalid",
  website: "websiteInvalid",
};

export function brandingFieldErrors(error: z.ZodError): BrandingFieldErrors {
  const flattened = z.flattenError(error).fieldErrors as Partial<Record<SchemaField, string[]>>;
  const result: Record<string, string> = {};
  for (const field of Object.keys(KNOWN_CODES) as SchemaField[]) {
    const message = flattened[field]?.[0];
    if (message === undefined) continue;
    result[field] = KNOWN_CODES[field].includes(message) ? message : FALLBACK_CODES[field];
  }
  return result as BrandingFieldErrors;
}
```

(If `z.email(...).toLowerCase()` is not a zod v4 API, lower-case in the preceding transform.)
Run → PASS.

- [ ] **Step 4: Failing mutation unit test** `mutations.test.ts` with a fake `Tx` is awkward;
      test the orchestration via the integration test (Step 7) and keep a focused unit test for
      the cleanup rule only: `saveBranding` deletes the just-uploaded logo when the update throws.

```ts
import { describe, expect, it, vi } from "vitest";

import type { Tx } from "@/db/rls";

import { saveBranding, type LogoStorage } from "./mutations";

const input = {
  clinicName: null,
  accentColor: null,
  contactEmail: null,
  contactPhone: null,
  website: null,
  showContactToPatients: true,
  removeLogo: false,
  logo: { bytes: new Uint8Array([1]), type: "png" as const },
};

function fakeTx({ current, failUpdate }: { current: string | null; failUpdate?: boolean }): Tx {
  const selectChain = {
    from: () => selectChain,
    where: () => selectChain,
    for: async () => [{ logoPath: current }],
  };
  const updateChain = {
    set: () => updateChain,
    where: () => updateChain,
    returning: async () => {
      if (failUpdate) throw new Error("boom");
      return [{ id: "physio-1" }];
    },
  };
  return { select: () => selectChain, update: () => updateChain } as unknown as Tx;
}

function fakeStorage(): LogoStorage & {
  upload: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
} {
  return { upload: vi.fn(async () => {}), remove: vi.fn(async () => {}) };
}

describe("saveBranding", () => {
  it("uploads to a fresh path in the physio's folder and reports the replaced logo", async () => {
    const storage = fakeStorage();
    const result = await saveBranding(
      fakeTx({ current: "physio-1/logo-old.png" }),
      "physio-1",
      input,
      storage,
    );
    expect(storage.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^physio-1\/logo-[0-9a-f-]{36}\.png$/),
      input.logo,
    );
    expect(result).toMatchObject({ ok: true, data: { staleLogoPath: "physio-1/logo-old.png" } });
  });

  it("removes the uploaded logo when the update fails", async () => {
    const storage = fakeStorage();
    await expect(
      saveBranding(fakeTx({ current: null, failUpdate: true }), "physio-1", input, storage),
    ).rejects.toThrow("boom");
    expect(storage.remove).toHaveBeenCalledWith([storage.upload.mock.calls[0][0]]);
  });

  it("reports an upload failure without touching the row", async () => {
    const storage = fakeStorage();
    storage.upload.mockRejectedValue(new Error("storage down"));
    await expect(
      saveBranding(fakeTx({ current: null }), "physio-1", input, storage),
    ).resolves.toEqual({
      ok: false,
      error: "uploadFailed",
    });
  });
});
```

(Adapt the fake chain to whatever query shape `saveBranding` uses; keep it minimal.)

- [ ] **Step 5: Implement** `mutations.ts`, `storage.ts`, `queries.ts`:

```ts
// mutations.ts
import "server-only";

import { eq } from "drizzle-orm";

import type { Tx } from "@/db/rls";
import { physios, type Physio } from "@/db/schema";
import { LOGO_EXTENSIONS } from "@/lib/branding";

import type { BrandingInput, ValidLogo } from "./schemas";

/** Where logos go; injected so tests can use a signed-in client or a fake. */
export type LogoStorage = {
  upload(path: string, logo: ValidLogo): Promise<void>;
  remove(paths: string[]): Promise<void>;
};

export type SaveBrandingResult =
  | { ok: true; data: { physio: Physio; staleLogoPath: string | null } }
  | { ok: false; error: "notFound" | "uploadFailed" };

/**
 * Saves branding. A new logo gets a fresh path (cache-busts public URLs) and is uploaded before
 * the row changes; if the update fails it is removed again. The replaced logo is returned as
 * `staleLogoPath` for the caller to delete *after* the transaction commits.
 */
export async function saveBranding(
  tx: Tx,
  physioId: string,
  { logo, removeLogo, ...fields }: BrandingInput & { logo: ValidLogo | null },
  storage: LogoStorage,
): Promise<SaveBrandingResult> {
  const [current] = await tx
    .select({ logoPath: physios.logoPath })
    .from(physios)
    .where(eq(physios.id, physioId))
    .for("update");
  if (!current) return { ok: false, error: "notFound" };

  let logoPath = removeLogo ? null : current.logoPath;
  if (logo) {
    logoPath = `${physioId}/logo-${crypto.randomUUID()}.${LOGO_EXTENSIONS[logo.type]}`;
    try {
      await storage.upload(logoPath, logo);
    } catch {
      return { ok: false, error: "uploadFailed" };
    }
  }

  let physio: Physio | undefined;
  try {
    [physio] = await tx
      .update(physios)
      .set({ ...fields, logoPath })
      .where(eq(physios.id, physioId))
      .returning();
  } catch (error) {
    if (logo && logoPath) await storage.remove([logoPath]).catch(() => {});
    throw error;
  }
  if (!physio) return { ok: false, error: "notFound" };

  const stale = current.logoPath && current.logoPath !== logoPath ? current.logoPath : null;
  return { ok: true, data: { physio, staleLogoPath: stale } };
}
```

```ts
// storage.ts
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { BRANDING_BUCKET, LOGO_CONTENT_TYPES } from "@/lib/branding";

import type { LogoStorage } from "./mutations";

/** Logo storage through a user-scoped client, so the bucket's owner-folder policies apply. */
export function supabaseLogoStorage(client: SupabaseClient): LogoStorage {
  const bucket = () => client.storage.from(BRANDING_BUCKET);
  return {
    async upload(path, logo) {
      const { error } = await bucket().upload(path, logo.bytes, {
        contentType: LOGO_CONTENT_TYPES[logo.type],
        cacheControl: "31536000", // paths are never reused
        upsert: false,
      });
      if (error) throw error;
    },
    async remove(paths) {
      const { error } = await bucket().remove(paths);
      if (error) throw error;
    },
  };
}
```

```ts
// queries.ts
import "server-only";

import { eq } from "drizzle-orm";

import type { db } from "@/db";
import type { Tx } from "@/db/rls";
import { physios, type Physio } from "@/db/schema";
import { env } from "@/env";
import { buildBranding, logoPublicUrl, type Branding, type BrandingSource } from "@/lib/branding";

/** A physio transaction (settings) or the owner connection after link resolution (spec 10). */
export type Queryable = Tx | typeof db;

export function brandingSource(row: Physio): BrandingSource {
  return {
    displayName: row.displayName,
    clinicName: row.clinicName,
    logoUrl: row.logoPath ? logoPublicUrl(env.NEXT_PUBLIC_SUPABASE_URL, row.logoPath) : null,
    accentColor: row.accentColor,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    website: row.website,
    showContactToPatients: row.showContactToPatients,
  };
}

/**
 * Branding for patient-facing surfaces (patient page, link previews, PDFs). Contact details are
 * null when the physio hides them. `updatedAt` versions cached images (spec 11).
 */
export async function getBranding(
  q: Queryable,
  physioId: string,
): Promise<(Branding & { updatedAt: Date }) | null> {
  const [row] = await q.select().from(physios).where(eq(physios.id, physioId));
  return row ? { ...buildBranding(brandingSource(row)), updatedAt: row.updatedAt } : null;
}
```

- [ ] **Step 6: Action + test.** `actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { withPhysio } from "@/server/auth/session";

import { saveBranding } from "./mutations";
import { brandingSource } from "./queries";
import {
  brandingFieldErrors,
  brandingSchema,
  checkLogo,
  type BrandingFieldErrors,
  type BrandingFormState,
  type ValidLogo,
} from "./schemas";
import { supabaseLogoStorage } from "./storage";

export async function updateBrandingAction(
  _state: BrandingFormState,
  formData: FormData,
): Promise<BrandingFormState> {
  const parsed = brandingSchema.safeParse(Object.fromEntries(formData));
  const fieldErrors: BrandingFieldErrors = parsed.success ? {} : brandingFieldErrors(parsed.error);

  let logo: ValidLogo | null = null;
  const file = formData.get("logo");
  if (file instanceof File && file.size > 0) {
    const checked = await checkLogo(file);
    if (checked.ok) logo = checked.logo;
    else fieldErrors.logo = checked.error;
  }
  if (!parsed.success || fieldErrors.logo) return { status: "error", fieldErrors };

  const storage = supabaseLogoStorage(await createClient());
  const result = await withPhysio((tx, physioId) =>
    saveBranding(tx, physioId, { ...parsed.data, logo }, storage),
  );
  if (!result.ok) {
    return {
      status: "error",
      fieldErrors: {},
      formError: result.error === "uploadFailed" ? "uploadFailed" : "unknown",
    };
  }
  // After commit: a failure here only leaves an orphaned file, never a broken logo.
  if (result.data.staleLogoPath) {
    await storage.remove([result.data.staleLogoPath]).catch((error) => {
      console.error("Failed to delete replaced logo", error);
    });
  }
  revalidatePath("/settings");
  return { status: "saved", logoUrl: brandingSource(result.data.physio).logoUrl };
}
```

`actions.test.ts` (mock pattern from `src/server/physios/actions.test.ts`): mock
`@/server/auth/session` (`withPhysio: fn => fn({}, "physio-1")`), `./mutations`
(`saveBranding` vi.fn), `./storage` (`supabaseLogoStorage` → `{ upload, remove }` fakes),
`@/lib/supabase/server` (`createClient: async () => ({})`), `next/cache`
(`revalidatePath: vi.fn()`), `./queries` (`brandingSource: row => ({ logoUrl: row.logoUrl ?? null })`).
Tests:

1. invalid fields → `{ status: "error", fieldErrors: {...} }`, `saveBranding` not called;
2. a `logo` File with text bytes → `fieldErrors.logo === "logoInvalidType"`, not called;
3. an empty `logo` File (size 0, what a form posts with no selection) is ignored → `logo: null`;
4. success with `staleLogoPath: "physio-1/logo-old.png"` → `remove` called with it,
   `revalidatePath("/settings")`, returns `{ status: "saved", logoUrl }`;
5. `remove` rejecting still returns saved;
6. `saveBranding` → `{ ok: false, error: "uploadFailed" }` → `formError: "uploadFailed"`.

- [ ] **Step 7: Integration test** `src/server/branding/branding.int.test.ts` (reuse the
      `clientFor`/`PNG` helpers pattern from `src/db/branding.int.test.ts`; copy them, they are
      8 lines): with `storage = supabaseLogoStorage(clientFor(await signInTestUser(maria.email)))`:
  1. `runAsPhysio(maria.claims, (tx, id) => saveBranding(tx, id, {...fields, logo}, storage))`
     → ok; `getBranding(db, maria.id)` returns clinic name, `logoUrl` ending with the new path,
     tokens for the accent, contact with WhatsApp URL; public URL fetch → 200.
  2. Save again with a new logo → different `logoPath`; `staleLogoPath` = the first; after
     `storage.remove([stale])` the folder lists exactly one object.
  3. `removeLogo: true` → `logoPath` null, `staleLogoPath` = previous.
  4. `showContactToPatients: false` → `getBranding(...).contact` is null; blank fields saved
     as null.
  5. `runAsPhysio(maria.claims, (tx) => saveBranding(tx, other.id, …, storage))` →
     `{ ok: false, error: "notFound" }` and nothing uploaded into other's folder.
  6. `getBranding(db, unknownUuid)` → null.

- [ ] **Step 8: Body size.** In `next.config.ts` add (and verify the key against
      `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md`):

```ts
  experimental: {
    // Branding logos are posted to a Server Action (≤ 2 MB after the browser resizes them,
    // plus multipart overhead). Default is 1 MB.
    serverActions: { bodySizeLimit: "3mb" },
  },
```

- [ ] **Step 9: Run** `pnpm test src/server/branding` and `pnpm test:int` → PASS.

- [ ] **Step 10: Commit**

```bash
pnpm format && pnpm check
git add src/server/branding next.config.ts
git commit -m "feat(branding): getBranding, saveBranding and updateBrandingAction"
```

---

### Task 5: `<BrandingStyle>` and `<PoweredBy>`

**Files:**

- Create: `src/components/branding/branding-style.tsx` (+ `branding-style.test.tsx`),
  `src/components/branding/powered-by.tsx`
- Modify: `messages/en.json`, `messages/es.json` (new top-level namespace `Branding`)

**Interfaces:**

- Consumes: `BrandTokens` (`@/lib/color`).
- Produces: `BrandingStyle({ tokens, scope }: { tokens: BrandTokens | null; scope: string })`
  renders `<style>` for `[data-brand="<scope>"]` (light) and `.dark [data-brand="<scope>"]`
  (dark) setting `--primary` and `--primary-foreground`; renders nothing when `tokens` is null
  or scope/tokens fail validation. `PoweredBy({ className? })` renders the muted line.
  Usage: `<div data-brand="patient"><BrandingStyle tokens={b.tokens} scope="patient" />…</div>`.
  Not a Server-only component (the settings preview uses it on the client).

- [ ] **Step 1: Failing test** `branding-style.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { brandTokens } from "@/lib/color";

import { BrandingStyle } from "./branding-style";

describe("BrandingStyle", () => {
  it("scopes light and dark tokens to the brand root", () => {
    const tokens = brandTokens("#0f766e");
    const { container } = render(<BrandingStyle tokens={tokens} scope="patient" />);
    const css = container.querySelector("style")?.textContent ?? "";
    expect(css).toContain(
      `[data-brand="patient"]{--primary:${tokens.light.primary};--primary-foreground:${tokens.light.primaryForeground}}`,
    );
    expect(css).toContain(
      `.dark [data-brand="patient"]{--primary:${tokens.dark.primary};--primary-foreground:${tokens.dark.primaryForeground}}`,
    );
  });

  it("renders nothing without tokens (app defaults)", () => {
    const { container } = render(<BrandingStyle tokens={null} scope="patient" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("refuses values that are not plain hex colours", () => {
    const tokens = brandTokens("#0f766e");
    const evil = { ...tokens, light: { ...tokens.light, primary: "red}body{display:none" } };
    const { container } = render(<BrandingStyle tokens={evil} scope="patient" />);
    expect(container).toBeEmptyDOMElement();
    const { container: badScope } = render(<BrandingStyle tokens={tokens} scope={'x"]{}'} />);
    expect(badScope).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**:

```tsx
import type { BrandTokens, ModeTokens } from "@/lib/color";

const HEX = /^#[0-9a-f]{6}$/;
const SCOPE = /^[a-z0-9-]+$/;

const declarations = ({ primary, primaryForeground }: ModeTokens) =>
  `--primary:${primary};--primary-foreground:${primaryForeground}`;

/**
 * Physio accent colour for patient-facing surfaces (docs/specs/09-physio-branding.md). Scoped to
 * `[data-brand="<scope>"]`, so the app shell keeps its neutral look. Values are validated again
 * here because they end up inside a <style> element.
 */
export function BrandingStyle({ tokens, scope }: { tokens: BrandTokens | null; scope: string }) {
  if (!tokens || !SCOPE.test(scope)) return null;
  const values = [tokens.light, tokens.dark].flatMap((m) => [m.primary, m.primaryForeground]);
  if (!values.every((value) => HEX.test(value))) return null;
  const selector = `[data-brand="${scope}"]`;
  const css = `${selector}{${declarations(tokens.light)}}.dark ${selector}{${declarations(tokens.dark)}}`;
  return <style>{css}</style>;
}
```

`powered-by.tsx`:

```tsx
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

/** Small app credit on patient-facing surfaces (spec 09: not fully white-label). */
export function PoweredBy({ className }: { className?: string }) {
  const t = useTranslations("Branding");
  return <p className={cn("text-muted-foreground text-xs", className)}>{t("poweredBy")}</p>;
}
```

Messages: en `"Branding": { "poweredBy": "Powered by Physio Trainer" }`; es
`"Branding": { "poweredBy": "Hecho con Physio Trainer" }`.

- [ ] **Step 4: Run** `pnpm test` → PASS. **Step 5: Commit**

```bash
pnpm format && pnpm check
git add src/components/branding messages
git commit -m "feat(branding): BrandingStyle scoped tokens and PoweredBy credit"
```

---

### Task 6: Settings tabs

**Files:**

- Create: `src/config/settings.ts` (+ `settings.test.ts`), `src/components/settings/settings-tabs.tsx`
- Modify: `src/app/(app)/settings/page.tsx`, `messages/*.json` (`Settings.tabs`,
  `Settings.branding.title/description`), `e2e/settings.spec.ts`

**Interfaces:**

- Produces: `SETTINGS_SECTIONS = ["profile", "branding", "account"] as const`,
  `type SettingsSection`, `settingsSection(value: string | undefined): SettingsSection`
  (unknown → `"profile"`), `settingsHref(section): Route` (`"/settings"` for profile,
  otherwise `/settings?section=<s>`). `SettingsTabs({ current })` (server component, `<nav
aria-label>` with `Link`s, `aria-current="page"` on the active one, active underline
  `border-primary`). The page renders one section at a time; Branding section placeholder
  card is replaced in Task 7.

- [ ] **Step 1: Failing test** `src/config/settings.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { settingsHref, settingsSection } from "./settings";

describe("settingsSection", () => {
  it.each([
    [undefined, "profile"],
    ["branding", "branding"],
    ["account", "account"],
    ["BRANDING", "profile"],
    ["nope", "profile"],
  ])("%j → %s", (input, expected) => expect(settingsSection(input)).toBe(expected));
});

describe("settingsHref", () => {
  it("keeps the profile URL clean", () => expect(settingsHref("profile")).toBe("/settings"));
  it("uses the section param", () =>
    expect(settingsHref("branding")).toBe("/settings?section=branding"));
});
```

- [ ] **Step 2: Implement** `src/config/settings.ts`:

```ts
import type { Route } from "next";

export const SETTINGS_SECTIONS = ["profile", "branding", "account"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export function settingsSection(value: string | undefined): SettingsSection {
  return SETTINGS_SECTIONS.find((section) => section === value) ?? "profile";
}

export function settingsHref(section: SettingsSection): Route {
  return (section === "profile" ? "/settings" : `/settings?section=${section}`) as Route;
}
```

- [ ] **Step 3: `SettingsTabs`**:

```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { SETTINGS_SECTIONS, settingsHref, type SettingsSection } from "@/config/settings";
import { cn } from "@/lib/utils";

export async function SettingsTabs({ current }: { current: SettingsSection }) {
  const t = await getTranslations("Settings.tabs");
  return (
    <nav aria-label={t("label")} className="-mb-px flex gap-4 overflow-x-auto border-b">
      {SETTINGS_SECTIONS.map((section) => (
        <Link
          key={section}
          href={settingsHref(section)}
          aria-current={section === current ? "page" : undefined}
          className={cn(
            "border-b-2 px-1 pb-2 text-sm font-medium whitespace-nowrap transition-colors",
            section === current
              ? "border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground border-transparent",
          )}
        >
          {t(section)}
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: Page.** `SettingsPage({ searchParams }: PageProps<"/settings">)`:
      `const section = settingsSection(firstParam((await searchParams).section));` Render
      `PageHeader`, `SettingsTabs`, then **only** the chosen section: `profile` → existing Profile
      card; `account` → existing Account card; `branding` → a Card with
      `t("branding.title")`/`t("branding.description")` (form added in Task 7).

Messages (en / es):

```json
"tabs": { "label": "Settings sections", "profile": "Profile", "branding": "Branding", "account": "Account" },
"branding": { "title": "Branding", "description": "How your clinic looks to patients: on their page, in shared links and in PDFs." }
```

```json
"tabs": { "label": "Secciones de configuración", "profile": "Perfil", "branding": "Marca", "account": "Cuenta" },
"branding": { "title": "Marca", "description": "Cómo ven tu consultorio tus pacientes: en su página, en los links compartidos y en los PDF." }
```

- [ ] **Step 5: Update e2e.** In `e2e/settings.spec.ts`: the email assertion moves to
      `await page.goto("/settings?section=account")` before `getByRole("main").getByText(email)`;
      "after signing out…" goes to `/settings?section=account` before clicking "Sign out". Add:

```ts
test("settings sections are tabs driven by the URL", async ({ physioPage: page }) => {
  await page.goto("/settings");
  const tabs = page.getByRole("navigation", { name: "Settings sections" });
  await expect(tabs.getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("link", { name: "Branding" }).click();
  await expect(page).toHaveURL(/\/settings\?section=branding$/);
  await expect(page.getByRole("heading", { name: "Branding" })).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel("Display name")).toBeVisible();
});
```

- [ ] **Step 6: Run** `pnpm test` and `pnpm test:e2e e2e/settings.spec.ts` → PASS.
      (`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` only if the bundled browser is
      missing.)

- [ ] **Step 7: Commit**

```bash
pnpm format && pnpm check
git add src/config/settings.ts src/config/settings.test.ts src/components/settings "src/app/(app)/settings/page.tsx" messages e2e/settings.spec.ts
git commit -m "feat(settings): URL-driven settings tabs (profile, branding, account)"
```

---

### Task 7: Branding form, accent picker, live preview

**Files:**

- Create: `src/lib/resize-image.ts`, `src/components/branding/branding-form.tsx`
  (+ `branding-form.test.tsx`), `accent-picker.tsx`, `branding-preview.tsx`
- Modify: `src/app/(app)/settings/page.tsx` (branding section), `messages/*.json`
  (`Settings.branding.*`)

**Interfaces:**

- Consumes: `updateBrandingAction`, `BrandingFormState`, `BrandingFieldErrors` (Task 4);
  `buildBranding`, `ACCENT_PALETTE`, `LOGO_*`, `normalizeHex` (Tasks 1–2);
  `BrandingStyle`, `PoweredBy` (Task 5); `brandingSource(profile)` (Task 4) for defaults.
- Produces:
  - `resizeLogo(file: File, maxDimension?: number): Promise<File>` (browser only).
  - `BrandingForm({ action, defaults })` with
    `defaults: BrandingFormValues = { displayName, clinicName, logoUrl, accentColor,
contactEmail, contactPhone, website, showContactToPatients }` (all `string | null` except
    `displayName: string`, `showContactToPatients: boolean`) — i.e. `BrandingSource`.
  - `AccentPicker({ value, onChange })` where `value: string | null` (null = app default).
  - `BrandingPreview({ branding }: { branding: Branding })`.

**Behaviour:**

- **Clinic name** input (`maxLength` 80), hint "Shown to patients. Leave empty to use your
  name (María López)."
- **Logo**: preview box (current logo `<img>` or empty state), a file `<input>` **without a
  `name`** (so a pre-hydration submit never posts the raw file) labelled "Logo", `accept=
LOGO_ACCEPT`, and "Remove logo" button when a logo is shown. On change: reject non
  PNG/WebP/JPEG `file.type` (`logoInvalidType`) or `> LOGO_SOURCE_MAX_BYTES`
  (`logoTooLarge`) locally; else `resizeLogo` → keep the `File` in state + `URL.createObjectURL`
  preview (revoke the old one); decode failure → `logoInvalidType`. Hidden
  `<input name="removeLogo" value="1">` only while "remove" is pending.
- **Accent**: `AccentPicker` = `role="radiogroup"` labelled "Accent colour" with a "Default"
  option and the 10 swatches (`role="radio"`, `aria-checked`, `aria-label` = translated swatch
  name, inline `backgroundColor`), then a native `<input type="color">` labelled "Custom
  colour" and a text `<input>` labelled "Hex code" (updates on valid hex; invalid shows
  `accentInvalid` hint). Hidden `<input name="accentColor" value={accent ?? ""}>`. When
  `brandTokens(accent).adjusted`, an `aria-live` note: "Adjusted slightly so buttons stay
  readable in light and dark mode."
- **Contact**: email (`type=email`), phone (`type=tel`, hint "International format with
  country code, e.g. +54 9 11 1234 5678. Also used for WhatsApp."), website (hint
  "https://…"), checkbox "Show contact details to patients" (`name="showContactToPatients"`).
- **Preview** (right column on `lg`, below on mobile): `buildBranding` from current state →
  `BrandingPreview`, heading "Preview". Three small cards, all inside
  `<div data-brand="preview">` + `<BrandingStyle scope="preview">`:
  1. **Patient page**: logo (or a `bg-primary text-primary-foreground` circle with the clinic
     initial), clinic name, "Hi Ana 👋"-style greeting (`preview.greeting` with `{name}` =
     `preview.sampleName`), a `Button` "Start workout" (uses `bg-primary`), contact buttons
     (Call `tel:`, WhatsApp `whatsappUrl`, Email `mailto:`, Website) rendered as `variant=
"outline"` links when `branding.contact`, and `<PoweredBy>`.
  2. **PDF header**: logo + clinic name left, contact line (email · phone · website) right,
     a `border-primary` 2px rule, "Routine for Ana" + today's date (`useFormatter`).
  3. **Link preview**: card with a `bg-primary` band (logo + clinic name in
     `text-primary-foreground`), title `preview.linkTitle` ("Your exercises from {clinic}"),
     host from `NEXT_PUBLIC_APP_URL` passed as prop `linkHost`.
     Preview links are real anchors but `tabIndex={-1}` and `aria-hidden` on the whole mock is
     NOT used (screen readers may read it); wrap mocks in `<figure>` with `figcaption`.
- **Logo `<img>`**: plain `<img>` with
  `// eslint-disable-next-line @next/next/no-img-element -- ≤512 px logo from a public bucket (or a blob: preview); next/image refuses local Supabase (private IP) and blob URLs.`
- **Save**: `onSubmit` → `event.preventDefault()`, `new FormData(form)`, `formData.set("logo",
file)` when a new file is pending, `startTransition(() => formAction(formData))`. Button
  "Save branding" / "Saving…"; `role="status"` "Saved" after success. On `saved`: pending file
  cleared, displayed logo = `state.logoUrl`, remove flag cleared (use the "adjust state during
  render when a prop/state changes" pattern keyed on the `state` object, not `useEffect`).
  Errors: per-field text under each field (`errors.<code>`), `formError` in a destructive
  `Alert` (`errors.unknown` / `errors.uploadFailed`).

`resize-image.ts`:

```ts
import { LOGO_MAX_DIMENSION } from "@/lib/branding";

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Browser only. Scales an image to fit `maxDimension` (never upscales), keeping transparency,
 * and re-encodes it as WebP (PNG where the browser cannot encode WebP). Throws when the file
 * cannot be decoded as an image.
 */
export async function resizeLogo(file: File, maxDimension = LOGO_MAX_DIMENSION): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is not available");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let blob = await toBlob(canvas, "image/webp", 0.9);
  if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/png");
  if (!blob) throw new Error("Could not encode the logo");
  const extension = blob.type === "image/webp" ? "webp" : "png";
  return new File([blob], `logo.${extension}`, { type: blob.type });
}
```

Messages `Settings.branding` (en; es in voseo with the same keys and ICU args):

```json
"clinicName": "Clinic or practice name",
"clinicNameHint": "Shown to patients. Leave empty to use your name ({name}).",
"logo": "Logo",
"logoHint": "PNG, WebP or JPEG. We resize it to 512 px; a transparent background looks best.",
"logoEmpty": "No logo yet",
"logoAlt": "{clinic} logo",
"removeLogo": "Remove logo",
"accent": "Accent colour",
"accentHint": "Used for buttons and highlights on your patients' page.",
"accentDefault": "Default",
"accentCustom": "Custom colour",
"accentHex": "Hex code",
"accentAdjusted": "Adjusted slightly so buttons stay readable in light and dark mode.",
"swatches": { "teal": "Teal", "sky": "Sky", "blue": "Blue", "indigo": "Indigo", "violet": "Violet", "pink": "Pink", "red": "Red", "orange": "Orange", "green": "Green", "slate": "Slate" },
"contactTitle": "Contact details",
"contactEmail": "Email",
"contactPhone": "Phone",
"contactPhoneHint": "International format with country code, e.g. +54 9 11 1234 5678. Also used for WhatsApp.",
"website": "Website",
"showContact": "Show contact details to patients",
"showContactHint": "Adds call, WhatsApp, email and website buttons to their page and PDFs.",
"save": "Save branding",
"saving": "Saving…",
"saved": "Saved",
"preview": {
  "title": "Preview",
  "patient": "Patient page",
  "pdf": "PDF header",
  "link": "Shared link",
  "sampleName": "Ana",
  "greeting": "Hi {name}",
  "startWorkout": "Start workout",
  "call": "Call",
  "whatsapp": "WhatsApp",
  "email": "Email",
  "website": "Website",
  "pdfTitle": "Routine for {name}",
  "linkTitle": "Your exercises from {clinic}",
  "linkDescription": "Open your routine, follow the videos and log your sessions."
},
"errors": {
  "clinicNameTooLong": "Use 80 characters or fewer.",
  "accentInvalid": "Enter a colour like #0f766e.",
  "emailInvalid": "Enter a valid email address.",
  "phoneInvalid": "Include the country code, e.g. +54 9 11 1234 5678.",
  "websiteInvalid": "Enter a website like kine.com.",
  "websiteNotHttps": "Use a secure address starting with https://.",
  "logoTooLarge": "That image is too large. Choose one under 10 MB.",
  "logoInvalidType": "Choose a PNG, WebP or JPEG image.",
  "uploadFailed": "The logo could not be uploaded. Try again.",
  "unknown": "Something went wrong. Try again."
}
```

Spanish suggestions: "Nombre del consultorio o centro", "Se muestra a tus pacientes. Dejalo
vacío para usar tu nombre ({name}).", "Subí un PNG, WebP o JPEG…", "Quitar logo", "Color de
acento", "Predeterminado", "Color personalizado", "Código hex", "Lo ajustamos un poco para que
los botones se lean bien en modo claro y oscuro.", swatches "Verde azulado, Celeste, Azul,
Índigo, Violeta, Rosa, Rojo, Naranja, Verde, Pizarra", "Datos de contacto", "Teléfono",
"Formato internacional con código de país, p. ej. +54 9 11 1234 5678. También se usa para
WhatsApp.", "Sitio web", "Mostrar datos de contacto a los pacientes", "Guardar marca",
"Guardando…", "Guardado", "Vista previa", "Página del paciente", "Encabezado del PDF", "Link
compartido", "Hola {name}", "Empezar rutina", "Llamar", "Rutina para {name}", "Tus ejercicios
de {clinic}", "Abrí tu rutina, seguí los videos y registrá tus sesiones.", errors: "Usá 80
caracteres o menos.", "Ingresá un color como #0f766e.", "Ingresá un email válido.", "Incluí el
código de país, p. ej. +54 9 11 1234 5678.", "Ingresá un sitio como kine.com.", "Usá una
dirección segura que empiece con https://.", "La imagen es muy grande. Elegí una de menos de
10 MB.", "Elegí una imagen PNG, WebP o JPEG.", "No pudimos subir el logo. Probá de nuevo.",
"Algo salió mal. Probá de nuevo."

- [ ] **Step 1: Failing component tests** `branding-form.test.tsx` (render inside
      `NextIntlClientProvider` like `profile-form.test.tsx`; `vi.mock("@/lib/resize-image", () =>
({ resizeLogo: vi.fn(async (f: File) => new File([new Uint8Array([1])], "logo.webp", { type:
"image/webp" })) }))`; stub `URL.createObjectURL`/`revokeObjectURL` with `vi.fn(() =>
"blob:preview")`):
  1. clicking the "Teal" radio → it is `aria-checked="true"`; the preview `<style>` text
     contains `--primary:#0f766e`; hidden `accentColor` input value `#0f766e`.
  2. typing `#ffff00` in "Hex code" → the adjusted note is shown.
  3. "Default" radio → no `<style>` in the preview; hidden input empty.
  4. typing a clinic name updates the preview heading; clearing it shows the display name.
  5. unchecking "Show contact details to patients" removes the preview "WhatsApp" link;
     with a phone `+5491112345678` checked, the link `href` is `https://wa.me/5491112345678`.
  6. choosing a `text/plain` file shows "Choose a PNG, WebP or JPEG image." and `resizeLogo`
     is not called.
  7. choosing a PNG then submitting → the `action` mock receives FormData whose `logo` is the
     resized `File` (`type === "image/webp"`), plus the text fields.
  8. "Remove logo" on a form with `defaults.logoUrl` → submit posts `removeLogo=1`; preview
     falls back to the initial circle.
  9. action returning `{ status: "error", fieldErrors: { contactPhone: "phoneInvalid" } }` →
     the phone error text is shown and the phone input has `aria-invalid="true"`.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `resize-image.ts`, `accent-picker.tsx`,
      `branding-preview.tsx`, `branding-form.tsx` per the behaviour above. Keep each file focused
      (form ≈ state + fields, picker = swatches/custom, preview = the three mocks). Arrow-key
      navigation inside the radiogroup is not required (each swatch is a tab stop), but Space/Enter
      must select.

- [ ] **Step 4: Wire the page.** Branding section:

```tsx
<Card>
  <CardHeader>
    <CardTitle>{t("branding.title")}</CardTitle>
    <CardDescription>{t("branding.description")}</CardDescription>
  </CardHeader>
  <CardContent>
    <BrandingForm
      action={updateBrandingAction}
      defaults={brandingSource(profile)}
      linkHost={new URL(env.NEXT_PUBLIC_APP_URL).host}
    />
  </CardContent>
</Card>
```

(`brandingSource` is in a server-only module; it is called in the Server Component and only
its serialisable result is passed down.)

- [ ] **Step 5: Run** `pnpm test`, then check the page manually with the dev server (see
      CLAUDE.md) in light + dark + mobile width. **Step 6: Commit**

```bash
pnpm format && pnpm check
git add src/lib/resize-image.ts src/components/branding "src/app/(app)/settings/page.tsx" messages
git commit -m "feat(branding): branding settings form with live preview"
```

---

### Task 8: E2E

**Files:**

- Create: `e2e/branding.spec.ts`

- [ ] **Step 1: Write** (uses `physioPage` fixture from `e2e/helpers/auth.ts`):

```ts
import { expect, test } from "./helpers/auth";

// 1×1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("picking an accent colour updates the preview and persists", async ({ physioPage: page }) => {
  await page.goto("/settings?section=branding");
  const preview = page.getByRole("figure", { name: "Patient page" });
  const button = preview.getByRole("button", { name: "Start workout" });
  const before = await button.evaluate((el) => getComputedStyle(el).backgroundColor);

  await page.getByRole("radio", { name: "Teal" }).click();
  await expect(button).toHaveCSS("background-color", "rgb(15, 118, 110)");
  expect(before).not.toBe("rgb(15, 118, 110)");

  await page.getByLabel("Clinic or practice name").fill("Kine Sur");
  await expect(preview.getByText("Kine Sur")).toBeVisible();
  await page.getByRole("button", { name: "Save branding" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("radio", { name: "Teal" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByLabel("Clinic or practice name")).toHaveValue("Kine Sur");
});

test("contact details drive the preview buttons", async ({ physioPage: page }) => {
  await page.goto("/settings?section=branding");
  await page.getByLabel("Phone").fill("+54 9 11 1234-5678");
  const preview = page.getByRole("figure", { name: "Patient page" });
  await expect(preview.getByRole("link", { name: "WhatsApp" })).toHaveAttribute(
    "href",
    "https://wa.me/5491112345678",
  );
  await page.getByLabel("Show contact details to patients").uncheck();
  await expect(preview.getByRole("link", { name: "WhatsApp" })).toHaveCount(0);
});

test("a physio uploads a logo that is publicly reachable", async ({
  physioPage: page,
  physio,
  request,
}) => {
  await page.goto("/settings?section=branding");
  await page
    .getByLabel("Logo", { exact: true })
    .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Save branding" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();

  await page.reload();
  const logo = page.locator("form").getByRole("img", { name: /logo$/ }).first();
  await expect(logo).toBeVisible();
  const src = await logo.getAttribute("src");
  expect(src).toContain(`/storage/v1/object/public/branding/${physio.id}/logo-`);
  const response = await request.get(src!, { headers: { cookie: "" } });
  expect(response.status()).toBe(200);

  await page.getByRole("button", { name: "Remove logo" }).click();
  await page.getByRole("button", { name: "Save branding" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await page.reload();
  await expect(page.locator("form").getByRole("img", { name: /logo$/ })).toHaveCount(0);
});

test("the branding page works in Spanish", async ({ physioPage: page }) => {
  await page.context().addCookies([{ name: "NEXT_LOCALE", value: "es", url: page.url() }]);
  await page.goto("/settings?section=branding");
  await expect(page.getByRole("radio", { name: "Verde azulado" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar marca" })).toBeVisible();
});
```

(Deleting the test physio via the fixture cascades the row; the uploaded object may remain in
local storage, which is acceptable for local/CI runs. If the physio's locale overrides the
cookie, drop the Spanish test's cookie approach and set `physios.locale` via SQL instead.)

- [ ] **Step 2: Run** `pnpm test:e2e e2e/branding.spec.ts e2e/settings.spec.ts` → PASS on
      desktop and mobile projects. Fix selectors (not behaviour) if roles differ.

- [ ] **Step 3: Commit**

```bash
pnpm format && pnpm check
git add e2e/branding.spec.ts
git commit -m "test(e2e): branding accent, contact and logo upload"
```

---

### Task 9: Docs and status

**Files:**

- Modify: `docs/specs/09-physio-branding.md`, `docs/specs/README.md`, `docs/architecture.md`

- [ ] **Step 1:** Spec: Status → `Done`; tick acceptance criteria; "Decisions made during
      implementation": raster only; "Powered by" line; auto-adjust contrast (≥ 3:1 vs `#ffffff`
      light and `#171717` dark card; black/white foreground by higher contrast); dark variant is
      "lighter" only (no extra desaturation beyond gamut clamping); logo limits (picked ≤ 10 MB,
      stored ≤ 2 MB, fit within 512 px, no crop, WebP with PNG fallback); logo uploaded through the
      Server Action with the user's session (bucket RLS applies) and sniffed by magic bytes;
      stored path `{physio_id}/logo-{uuid}.{ext}` (bucket `branding`), old logo deleted after
      commit; phone stored as `+<digits>` and must be international; website must be https (bare
      domains get `https://`); settings tabs via `?section=`; `getBranding(q, physioId)` takes a tx
      or the owner `db` and returns `updatedAt` for spec 11; `BrandingStyle` scope usage.
- [ ] **Step 2:** README index: 09 → `Done`.
- [ ] **Step 3:** `docs/architecture.md` Tenancy rule 4 (Storage): add "Exception: the public
      `branding` bucket (spec 09) holds physio logos only (no patient data); its write policies
      still check the first path segment."
- [ ] **Step 4: Commit**

```bash
pnpm format && pnpm check
git add docs
git commit -m "docs: mark spec 09 physio branding done"
```
