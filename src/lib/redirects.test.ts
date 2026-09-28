import { describe, expect, it } from "vitest";

import { safeNextPath } from "./redirects";

describe("safeNextPath", () => {
  it.each(["/customers", "/customers/42?tab=plans", "/routines#top", "/settings"])(
    "keeps %s",
    (path) => {
      expect(safeNextPath(path)).toBe(path);
    },
  );

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["absolute URL", "https://evil.example/x"],
    ["protocol-relative URL", "//evil.example"],
    ["backslash", "/\\evil.example"],
    ["javascript scheme", "javascript:alert(1)"],
    ["encoded slashes", "/%2F%2Fevil.example"],
    ["encoded backslash", "/%5Cevil.example"],
    ["control character", "/\tevil"],
    ["path without leading slash", "customers"],
    ["login page (loop)", "/login?next=/customers"],
    ["auth route", "/auth/confirm?token_hash=x"],
  ])("falls back for %s", (_label, value) => {
    expect(safeNextPath(value)).toBe("/dashboard");
  });

  it("uses the given fallback", () => {
    expect(safeNextPath(null, "/")).toBe("/");
  });
});
