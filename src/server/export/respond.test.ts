import { describe, expect, it } from "vitest";

import { contentDisposition, EXPORT_CONTENT_TYPES } from "./model";
import { fileResponse, parseExportQuery } from "./respond";

const q = (qs: string) => parseExportQuery(new URL(`https://x.test/api/export/routines/1${qs}`));

describe("parseExportQuery", () => {
  it("reads the format", () => {
    expect(q("?format=pdf")).toEqual({ format: "pdf" });
    expect(q("?format=xlsx")).toEqual({ format: "xlsx" });
  });
  it("ignores the retired tracking parameter, so old URLs keep working", () => {
    expect(q("?format=pdf&tracking=0")).toEqual({ format: "pdf" });
    expect(q("?format=xlsx&tracking=yes")).toEqual({ format: "xlsx" });
  });
  it("rejects a missing or unknown format", () => {
    expect(q("?format=doc")).toBeNull();
    expect(q("")).toBeNull();
  });
});

describe("fileResponse", () => {
  it("sets download headers", async () => {
    const body = Buffer.from("hello");
    const res = fileResponse(body, "pdf", "Knee rehab", "2026-10-07", { "X-Test": "1" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(EXPORT_CONTENT_TYPES.pdf);
    expect(res.headers.get("Content-Disposition")).toBe(
      contentDisposition("Knee rehab", "2026-10-07", "pdf"),
    );
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Content-Length")).toBe("5");
    expect(res.headers.get("X-Test")).toBe("1");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("hello");
  });
  it("uses the xlsx content type", () => {
    const res = fileResponse(Buffer.alloc(1), "xlsx", "a", "2026-10-07");
    expect(res.headers.get("Content-Type")).toBe(EXPORT_CONTENT_TYPES.xlsx);
  });
});
