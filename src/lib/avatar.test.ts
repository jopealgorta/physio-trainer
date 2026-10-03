import { describe, expect, it } from "vitest";

import { AVATAR_URL_MAX_LENGTH, avatarFromMetadata, isAvatarUrl } from "./avatar";

const GOOGLE = "https://lh3.googleusercontent.com/a/ACg8ocK=s96-c";

describe("avatarFromMetadata", () => {
  it("prefers Google's avatar_url", () => {
    const other = "https://lh4.googleusercontent.com/p";
    expect(avatarFromMetadata({ avatar_url: GOOGLE, picture: other })).toBe(GOOGLE);
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
    ["another host", { avatar_url: "https://x.test/a.png" }],
    ["too long", { avatar_url: `${GOOGLE}/${"a".repeat(AVATAR_URL_MAX_LENGTH)}` }],
  ])("returns null for %s", (_label, metadata) => {
    expect(avatarFromMetadata(metadata)).toBeNull();
  });
});

describe("isAvatarUrl", () => {
  it.each([
    GOOGLE,
    "https://lh3.googleusercontent.com",
    "https://lh6.googleusercontent.com/-abc/AAAA/photo.jpg?sz=96",
  ])("accepts Google's photo host: %s", (url) => {
    expect(isAvatarUrl(url)).toBe(true);
  });

  // Patients' browsers load this URL: only Google's photo host, exactly as the database check.
  it.each([
    "http://lh3.googleusercontent.com/a/x",
    "https://googleusercontent.com/a/x",
    "https://lh3.googleusercontent.com.evil.test/a/x",
    "https://evilgoogleusercontent.com/a/x",
    "https://lh3.googleusercontent.com@evil.test/a/x",
    "https://user:pass@lh3.googleusercontent.com/a/x",
    "https://lh3.googleusercontent.com:8443/a/x",
    "https://LH3.googleusercontent.com/a/x",
    "https://-lh3.googleusercontent.com/a/x",
    "https://lh3..googleusercontent.com/a/x",
    "https://lh3.googleusercontent.com/a b",
    "https://lh3.googleusercontent.com?sz=96",
    "https://x.test/a.png",
  ])("rejects %s", (url) => {
    expect(isAvatarUrl(url)).toBe(false);
  });
});
