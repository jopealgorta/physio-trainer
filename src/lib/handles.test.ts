import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  HANDLE_MAX_LENGTH,
  MAX_HANDLE_CANDIDATES,
  RESERVED_HANDLES,
  handleCandidates,
  handleFromName,
  handleProblem,
  isPlaceholderHandle,
  isValidHandle,
  slugify,
} from "./handles";

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

  // Metadata files (icon.tsx, manifest.ts) and public/ files are routes too, but not folders.
  it.each(["manifest.webmanifest", "icon", "apple-icon", "sw.js", "offline"])(
    "reserves the PWA route %s",
    (segment) => {
      expect(RESERVED_HANDLES.has(segment)).toBe(true);
    },
  );
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

describe("handleProblem", () => {
  it.each([
    ["ab", "tooShort"],
    ["a".repeat(31), "tooLong"],
    ["Maria", "format"],
    ["maria--lopez", "format"],
    ["-maria", "format"],
    ["maria_lopez", "format"],
    ["dashboard", "reserved"],
  ] as const)("%s → %s", (handle, problem) => {
    expect(handleProblem(handle)).toBe(problem);
  });

  it("returns null for a usable handle", () => {
    expect(handleProblem("maria-lopez")).toBeNull();
  });
});

describe("handleFromName", () => {
  it("slugifies and fits the maximum length without a trailing hyphen", () => {
    expect(handleFromName("María López")).toBe("maria-lopez");
    expect(handleFromName("abcdefghijklmnopqrstuvwxyzabc d")).toBe("abcdefghijklmnopqrstuvwxyzabc");
  });

  it("returns an empty string for names without Latin letters or digits", () => {
    expect(handleFromName("李伟")).toBe("");
  });
});

describe("handleCandidates", () => {
  it("starts with the slug and continues with numbered variants", () => {
    const candidates = handleCandidates("María López");
    expect(candidates.slice(0, 3)).toEqual(["maria-lopez", "maria-lopez-2", "maria-lopez-3"]);
    expect(candidates).toHaveLength(MAX_HANDLE_CANDIDATES);
  });

  it("truncates the base so numbered variants fit, without double hyphens", () => {
    const candidates = handleCandidates("abcdefghijklmnopqrstuvwxyza bcd");
    expect(candidates[0]).toBe("abcdefghijklmnopqrstuvwxyza-bc");
    expect(candidates[1]).toBe("abcdefghijklmnopqrstuvwxyza-2");
    expect(candidates[9]).toBe("abcdefghijklmnopqrstuvwxyza-10");
    for (const candidate of candidates) {
      expect(candidate.length).toBeLessThanOrEqual(HANDLE_MAX_LENGTH);
      expect(candidate).not.toContain("--");
    }
  });

  it("falls back to a 'physio' base when the name gives fewer than 3 usable characters", () => {
    expect(handleCandidates("Al")[0]).toBe("physio");
    expect(handleCandidates("李伟").slice(0, 2)).toEqual(["physio", "physio-2"]);
  });

  it("skips reserved handles", () => {
    expect(handleCandidates("Admin").slice(0, 2)).toEqual(["admin-2", "admin-3"]);
  });

  it("only yields valid handles", () => {
    for (const candidate of handleCandidates("Dr. Émile O'Brien-Smith")) {
      expect(isValidHandle(candidate)).toBe(true);
    }
  });
});

describe("isPlaceholderHandle", () => {
  it("recognises the handle created at sign-up", () => {
    expect(isPlaceholderHandle("physio-1a2b3c4d")).toBe(true);
    expect(isPlaceholderHandle("physio-2")).toBe(false);
    expect(isPlaceholderHandle("maria-lopez")).toBe(false);
  });
});
