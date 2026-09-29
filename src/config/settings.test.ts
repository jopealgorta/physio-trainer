import { describe, expect, it } from "vitest";

import { settingsHref, settingsSection } from "./settings";

describe("settingsSection", () => {
  it.each([
    [undefined, "profile"],
    ["branding", "branding"],
    ["account", "account"],
    ["BRANDING", "profile"],
    ["nope", "profile"],
  ])("%j → %s", (input, expected) => expect(settingsSection(input)).toBe(expected));
});

describe("settingsHref", () => {
  it("keeps the profile URL clean", () => expect(settingsHref("profile")).toBe("/settings"));
  it("uses the section param", () =>
    expect(settingsHref("branding")).toBe("/settings?section=branding"));
});
