import { describe, expect, it } from "vitest";

import { parseLoginError } from "./login-errors";

describe("parseLoginError", () => {
  it.each(["linkInvalid", "oauthFailed", "unknown"] as const)("accepts %s", (code) => {
    expect(parseLoginError(code)).toBe(code);
  });

  it.each([undefined, "", "<script>", "toString"])("ignores %j", (value) => {
    expect(parseLoginError(value)).toBeNull();
  });
});
