import { describe, expect, it } from "vitest";

import {
  brandTokens,
  contrastRatio,
  DARK_SURFACE,
  hexToOklch,
  LIGHT_SURFACE,
  mixOnWhite,
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

describe("mixOnWhite", () => {
  it("returns white at 0 and the colour at 1", () => {
    expect(mixOnWhite("#0f766e", 0)).toBe("#ffffff");
    expect(mixOnWhite("#0f766e", 1)).toBe("#0f766e");
  });

  it("blends linearly per channel", () => {
    expect(mixOnWhite("#000000", 0.5)).toBe("#808080");
  });
});
