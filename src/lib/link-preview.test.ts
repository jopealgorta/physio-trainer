import { describe, expect, it } from "vitest";

import {
  buildPreviewMetadata,
  cardColors,
  previewImagePath,
  previewVersion,
  PREVIEW_IMAGE_SIZE,
} from "./link-preview";
import { brandTokens } from "./color";

const base = {
  path: "/maria-lopez/ana-7k2m9qpx",
  version: "abc",
  title: "Your exercise plan · Maria Physio",
  description: "Open your routine from Maria Physio.",
  clinicName: "Maria Physio",
  imageAlt: "Maria Physio",
};

describe("previewVersion", () => {
  it("changes when the branding row changes and is stable otherwise", () => {
    const a = previewVersion(new Date("2026-10-01T10:00:00Z"));
    expect(previewVersion(new Date("2026-10-01T10:00:00Z"))).toBe(a);
    expect(previewVersion(new Date("2026-10-01T10:00:01Z"))).not.toBe(a);
    expect(a).toMatch(/^[0-9a-z]+$/);
  });
});

describe("previewImagePath", () => {
  it("is the route under the link, versioned", () => {
    expect(previewImagePath("/h/ana-7k2m9qpx", "v1")).toBe("/h/ana-7k2m9qpx/og?v=v1");
  });
});

describe("buildPreviewMetadata", () => {
  it("sets title, description, Open Graph and Twitter card", () => {
    const meta = buildPreviewMetadata(base);
    expect(meta.title).toEqual({ absolute: base.title });
    expect(meta.description).toBe(base.description);
    expect(meta.openGraph).toMatchObject({
      title: base.title,
      description: base.description,
      siteName: "Maria Physio",
      type: "website",
      images: [
        {
          url: "/maria-lopez/ana-7k2m9qpx/og?v=abc",
          width: PREVIEW_IMAGE_SIZE.width,
          height: PREVIEW_IMAGE_SIZE.height,
          alt: "Maria Physio",
        },
      ],
    });
    expect(meta.twitter).toMatchObject({
      card: "summary_large_image",
      title: base.title,
      description: base.description,
      images: ["/maria-lopez/ana-7k2m9qpx/og?v=abc"],
    });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it("carries nothing but the given clinic strings (no customer or health data)", () => {
    const json = JSON.stringify(buildPreviewMetadata(base));
    expect(json).not.toMatch(/Ana"/);
    expect(json.replace(/\/maria-lopez\/ana-7k2m9qpx/g, "")).not.toMatch(/ana/i);
  });
});

describe("cardColors", () => {
  it("falls back to the neutral app colours without branding", () => {
    expect(cardColors(null)).toEqual({
      accent: "#171717",
      onAccent: "#fafafa",
      tint: "#efefef",
    });
  });

  it("uses the light accent token and a tint that is almost white", () => {
    const tokens = brandTokens("#0f766e");
    const { accent, onAccent, tint } = cardColors(tokens);
    expect(accent).toBe(tokens.light.primary);
    expect(onAccent).toBe(tokens.light.primaryForeground);
    expect(tint).toMatch(/^#[0-9a-f]{6}$/);
    // 8% accent over white: every channel stays above 0xe0.
    expect(
      tint
        .slice(1)
        .match(/../g)!
        .every((c) => parseInt(c, 16) >= 0xe0),
    ).toBe(true);
  });
});
