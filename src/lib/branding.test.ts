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
    "https://user:pass@example.com",
    "https://kine.com@evil.com",
    "x".repeat(2100),
  ])("rejects %j", (input) => expect(normalizeWebsite(input)).toMatchObject({ ok: false }));

  it("rejects a URL that grows past the limit once percent-encoded", () => {
    const input = "https://kine.com/" + "é".repeat(1000);
    expect(input.length).toBeLessThan(2048);
    expect(normalizeWebsite(input)).toEqual({ ok: false, error: "websiteInvalid" });
  });
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
