// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { youtubeCoverUrl } from "@/lib/youtube";

import { loadThumbnails } from "./images";

// Unit tests run without the int config's server-only alias; the real package throws here.
vi.mock("server-only", () => ({}));

// A 1×1 baseline JPEG.
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);

const respond = (body: BodyInit | null, init: ResponseInit = {}) =>
  vi.fn(async () => new Response(body, init)) as unknown as typeof fetch;

describe("loadThumbnails", () => {
  it("fetches each YouTube cover once, in parallel, keyed by video id", async () => {
    const fetchImpl = respond(JPEG);
    const thumbs = await loadThumbnails(["a", "a", "b"], fetchImpl);
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls.map(([url]) => url)).toEqual([youtubeCoverUrl("a"), youtubeCoverUrl("b")]);
    expect([...thumbs.keys()]).toEqual(["a", "b"]);
    expect(thumbs.get("a")).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("serves repeated covers from memory", async () => {
    const fetchImpl = respond(JPEG);
    await loadThumbnails(["cached"], fetchImpl);
    await loadThumbnails(["cached"], fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("leaves out covers that fail, and does not cache the failure", async () => {
    const failing = vi.fn(async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    expect((await loadThumbnails(["flaky"], failing)).size).toBe(0);
    const ok = respond(JPEG);
    expect((await loadThumbnails(["flaky"], ok)).has("flaky")).toBe(true);
  });
});
