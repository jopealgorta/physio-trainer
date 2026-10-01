import { describe, expect, it } from "vitest";

import { qrCode } from "./qr";

describe("qrCode", () => {
  it("returns a square size and one path of horizontal runs", () => {
    const qr = qrCode("https://app.example/maria-lopez/ana-7k2m9qpx");
    expect(qr.size).toBeGreaterThanOrEqual(21);
    expect(qr.path).toMatch(/^(M\d+ \d+h\d+v1h-\d+z)+$/);
  });

  it("is deterministic and depends on the text", () => {
    expect(qrCode("a").path).toBe(qrCode("a").path);
    expect(qrCode("a").path).not.toBe(qrCode("b").path);
  });

  it("draws the three finder patterns (top-left module is dark)", () => {
    const qr = qrCode("x");
    expect(qr.path.startsWith("M0 0h7v1h-7z")).toBe(true);
  });
});
