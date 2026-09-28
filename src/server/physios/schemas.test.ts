import { describe, expect, it } from "vitest";

import { profileFieldErrors, profileSchema } from "./schemas";

const valid = { displayName: "Maria Lopez", handle: "maria-lopez", locale: "en", timezone: "UTC" };

function errorsFor(input: Record<string, unknown>) {
  const result = profileSchema.safeParse(input);
  if (result.success) throw new Error("expected a validation error");
  return profileFieldErrors(result.error);
}

describe("profileSchema", () => {
  it("trims the name, lowercases the handle and normalises the timezone", () => {
    expect(
      profileSchema.parse({
        displayName: "  Ana  ",
        handle: " Ana-Ruiz ",
        locale: "en",
        timezone: "utc",
      }),
    ).toEqual({ displayName: "Ana", handle: "ana-ruiz", locale: "en", timezone: "UTC" });
  });

  it("ignores unknown fields such as next", () => {
    expect(profileSchema.parse({ ...valid, next: "/customers" })).toEqual(valid);
  });

  it.each([
    [{ displayName: "   " }, { displayName: "displayNameRequired" }],
    [{ displayName: "x".repeat(81) }, { displayName: "displayNameTooLong" }],
    [{ handle: "admin" }, { handle: "reserved" }],
    [{ handle: "ab" }, { handle: "tooShort" }],
    [{ handle: "a_b_c" }, { handle: "format" }],
    [{ locale: "xx" }, { locale: "localeInvalid" }],
    [{ timezone: "Mars/Base" }, { timezone: "timezoneInvalid" }],
  ])("maps %j to %j", (override, expected) => {
    expect(errorsFor({ ...valid, ...override })).toEqual(expected);
  });

  it("falls back to a known error code for missing fields", () => {
    expect(errorsFor({})).toEqual({
      displayName: "displayNameRequired",
      handle: "format",
      locale: "localeInvalid",
      timezone: "timezoneInvalid",
    });
  });
});
