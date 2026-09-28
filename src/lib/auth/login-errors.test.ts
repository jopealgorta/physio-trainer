import { describe, expect, it } from "vitest";

import { loginErrorPath, parseLoginError } from "./login-errors";

describe("parseLoginError", () => {
  it.each(["linkInvalid", "oauthFailed", "unknown"] as const)("accepts %s", (code) => {
    expect(parseLoginError(code)).toBe(code);
  });

  it.each([undefined, "", "<script>", "toString"])("ignores %j", (value) => {
    expect(parseLoginError(value)).toBeNull();
  });
});

describe("loginErrorPath", () => {
  it("keeps a safe next path", () => {
    expect(loginErrorPath("linkInvalid", "/customers?tab=plans")).toBe(
      "/login?error=linkInvalid&next=%2Fcustomers%3Ftab%3Dplans",
    );
  });

  it.each([undefined, null, "/dashboard", "//evil.example", "/login?next=%2Fx"])(
    "leaves out a default or unsafe next (%j)",
    (next) => {
      expect(loginErrorPath("unknown", next)).toBe("/login?error=unknown");
    },
  );
});
