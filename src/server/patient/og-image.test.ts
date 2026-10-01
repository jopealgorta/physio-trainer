import { describe, expect, it, vi } from "vitest";

import { loadLogoDataUri, nameFontSize } from "./og-image";

// Unit tests run without the int config's server-only alias; the real package throws here.
vi.mock("server-only", () => ({}));
vi.mock("./load", () => ({ loadLink: vi.fn() }));

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const WEBP = Uint8Array.from([
  ...Array.from("RIFF", (c) => c.charCodeAt(0)),
  0,
  0,
  0,
  0,
  ...Array.from("WEBP", (c) => c.charCodeAt(0)),
]);

const respond = (body: Uint8Array | null, status = 200) =>
  vi.fn(async () => new Response(body as BodyInit | null, { status })) as unknown as typeof fetch;

describe("loadLogoDataUri", () => {
  it("inlines PNG and JPEG logos", async () => {
    expect(await loadLogoDataUri("https://x/logo.png", respond(PNG))).toBe(
      `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`,
    );
    expect(await loadLogoDataUri("https://x/logo.jpg", respond(JPEG))).toMatch(
      /^data:image\/jpeg;base64,/,
    );
  });

  it("returns null without a logo, for other types, errors and oversized files", async () => {
    expect(await loadLogoDataUri(null, respond(PNG))).toBeNull();
    expect(await loadLogoDataUri("https://x", respond(WEBP))).toBeNull();
    expect(await loadLogoDataUri("https://x", respond(Uint8Array.from([1, 2, 3])))).toBeNull();
    expect(await loadLogoDataUri("https://x", respond(PNG, 404))).toBeNull();
    expect(await loadLogoDataUri("https://x", respond(new Uint8Array(0)))).toBeNull();
    const huge = new Uint8Array(2 * 1024 * 1024 + 1);
    huge.set(PNG);
    expect(await loadLogoDataUri("https://x", respond(huge))).toBeNull();
    const failing = vi.fn(async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    expect(await loadLogoDataUri("https://x", failing)).toBeNull();
  });
});

describe("nameFontSize", () => {
  it("shrinks for longer clinic names", () => {
    expect(nameFontSize("Kine Sur")).toBeGreaterThan(nameFontSize("x".repeat(30)));
    expect(nameFontSize("x".repeat(30))).toBeGreaterThan(nameFontSize("x".repeat(60)));
  });
});
