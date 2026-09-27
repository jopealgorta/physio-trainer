import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { RESERVED_HANDLES, isValidHandle, slugify } from "./handles";

describe("slugify", () => {
  it("lowercases, strips accents and joins words with hyphens", () => {
    expect(slugify("María López")).toBe("maria-lopez");
    expect(slugify("  Knee  Rehab — Phase 2 ")).toBe("knee-rehab-phase-2");
  });

  it("drops characters that are not letters or digits", () => {
    expect(slugify("ACL (post-op) #1!")).toBe("acl-post-op-1");
  });

  it("returns an empty string when nothing usable remains", () => {
    expect(slugify("¡¿?!")).toBe("");
  });
});

describe("isValidHandle", () => {
  it.each(["maria-lopez", "physio42", "abc"])("accepts %s", (handle) => {
    expect(isValidHandle(handle)).toBe(true);
  });

  it.each([
    ["too short", "ab"],
    ["too long", "a".repeat(31)],
    ["uppercase", "Maria"],
    ["leading hyphen", "-maria"],
    ["trailing hyphen", "maria-"],
    ["double hyphen", "maria--lopez"],
    ["underscore", "maria_lopez"],
    ["reserved", "dashboard"],
  ])("rejects %s", (_reason, handle) => {
    expect(isValidHandle(handle)).toBe(false);
  });
});

describe("RESERVED_HANDLES", () => {
  // Patient links live at /{handle}/{slug}, so a physio handle must never shadow a
  // top-level route. This test fails when someone adds a route without reserving it.
  it("contains every top-level route segment in src/app", () => {
    const appDir = path.resolve(__dirname, "../app");
    const segments = topLevelSegments(appDir);

    expect(segments.length).toBeGreaterThan(0);
    for (const segment of segments) {
      expect(RESERVED_HANDLES.has(segment), `"${segment}" must be reserved`).toBe(true);
    }
  });
});

function topLevelSegments(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      if (entry.name.startsWith("(")) return topLevelSegments(path.join(dir, entry.name));
      if (entry.name.startsWith("[") || entry.name.startsWith("_")) return [];
      return [entry.name];
    });
}
