import { describe, expect, it } from "vitest";

import { AVATAR_URL_MAX_LENGTH, avatarFromMetadata, isAvatarUrl } from "./avatar";

const GOOGLE = "https://lh3.googleusercontent.com/a/ACg8ocK=s96-c";

describe("avatarFromMetadata", () => {
  it("prefers Google's avatar_url", () => {
    expect(avatarFromMetadata({ avatar_url: GOOGLE, picture: "https://x.test/p" })).toBe(GOOGLE);
  });

  it("falls back to picture", () => {
    expect(avatarFromMetadata({ picture: GOOGLE })).toBe(GOOGLE);
  });

  it("skips an unusable avatar_url for a usable picture", () => {
    expect(avatarFromMetadata({ avatar_url: "http://x.test/a", picture: GOOGLE })).toBe(GOOGLE);
  });

  it("trims the URL", () => {
    expect(avatarFromMetadata({ avatar_url: `  ${GOOGLE} ` })).toBe(GOOGLE);
  });

  it.each([
    ["no metadata", undefined],
    ["null", null],
    ["a magic-link user", { email_verified: true }],
    ["http", { avatar_url: "http://x.test/a.png" }],
    ["javascript", { avatar_url: "javascript:alert(1)" }],
    ["upper-case scheme", { avatar_url: "HTTPS://x.test/a.png" }],
    ["not a URL", { avatar_url: "https://" }],
    ["a number", { avatar_url: 42 }],
    ["too long", { avatar_url: `https://x.test/${"a".repeat(AVATAR_URL_MAX_LENGTH)}` }],
  ])("returns null for %s", (_label, metadata) => {
    expect(avatarFromMetadata(metadata)).toBeNull();
  });
});

describe("isAvatarUrl", () => {
  it("accepts https only, like the database check", () => {
    expect(isAvatarUrl(GOOGLE)).toBe(true);
    expect(isAvatarUrl("http://x.test/a.png")).toBe(false);
    expect(isAvatarUrl("https://user:pass@x.test/a.png")).toBe(false);
  });
});
