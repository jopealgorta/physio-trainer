// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { fetchImageDataUri } from "./images";

// Unit tests run without the int config's server-only alias; the real package throws here.
vi.mock("server-only", () => ({}));

// A 1×1 baseline JPEG.
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const respond = (body: BodyInit | null, init: ResponseInit = {}) =>
  vi.fn(async () => new Response(body, init)) as unknown as typeof fetch;

describe("fetchImageDataUri", () => {
  it("inlines a JPEG as a data URI", async () => {
    const uri = await fetchImageDataUri("https://x/a.jpg", { fetchImpl: respond(JPEG) });
    expect(uri).toBe(`data:image/jpeg;base64,${JPEG.toString("base64")}`);
  });

  it("inlines a PNG", async () => {
    expect(await fetchImageDataUri("https://x/a.png", { fetchImpl: respond(PNG) })).toMatch(
      /^data:image\/png;base64,/,
    );
  });

  it("returns null for a 404", async () => {
    expect(
      await fetchImageDataUri("https://x", { fetchImpl: respond(JPEG, { status: 404 }) }),
    ).toBeNull();
  });

  it("returns null for an HTML body", async () => {
    const fetchImpl = respond("<!doctype html><html></html>", {
      headers: { "content-type": "text/html" },
    });
    expect(await fetchImageDataUri("https://x", { fetchImpl })).toBeNull();
  });

  it("returns null when the request is aborted (timeout)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException("The operation was aborted.", "AbortError");
    }) as unknown as typeof fetch;
    expect(await fetchImageDataUri("https://x", { fetchImpl })).toBeNull();
  });

  it("passes a timeout signal to fetch", async () => {
    const fetchImpl = respond(JPEG);
    await fetchImageDataUri("https://x", { fetchImpl, timeoutMs: 50 });
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("refuses a declared content-length over the cap", async () => {
    const fetchImpl = respond(JPEG, { headers: { "content-length": String(600 * 1024) } });
    expect(await fetchImageDataUri("https://x", { fetchImpl, maxBytes: 512 * 1024 })).toBeNull();
  });

  it("refuses an undeclared body over the cap", async () => {
    const big = new Uint8Array(2048);
    big.set(JPEG);
    expect(
      await fetchImageDataUri("https://x", { fetchImpl: respond(big), maxBytes: 1024 }),
    ).toBeNull();
  });

  it("returns null for an empty body", async () => {
    expect(
      await fetchImageDataUri("https://x", { fetchImpl: respond(new Uint8Array(0)) }),
    ).toBeNull();
  });
});
