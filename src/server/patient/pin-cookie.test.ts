import { describe, expect, it, vi } from "vitest";

import {
  PIN_COOKIE_MAX_AGE_SECONDS,
  isPinTokenValid,
  pinCookieMaxAge,
  pinCookieName,
  pinToken,
} from "./pin-cookie";

// Unit tests run without the int config's server-only alias; the real package throws here.
vi.mock("server-only", () => ({}));

const SECRET = "secret-a";

describe("pin token", () => {
  it("is valid for the same secret, code and hash", () => {
    const token = pinToken(SECRET, "7k2m9qpx", "hash-1");
    expect(isPinTokenValid(SECRET, "7k2m9qpx", "hash-1", token)).toBe(true);
  });

  it("stops working when the PIN hash changes (PIN regenerated or removed)", () => {
    const token = pinToken(SECRET, "7k2m9qpx", "hash-1");
    expect(isPinTokenValid(SECRET, "7k2m9qpx", "hash-2", token)).toBe(false);
  });

  it("is bound to the link code and to the secret", () => {
    const token = pinToken(SECRET, "7k2m9qpx", "hash-1");
    expect(isPinTokenValid(SECRET, "7k2m9qpy", "hash-1", token)).toBe(false);
    expect(isPinTokenValid("secret-b", "7k2m9qpx", "hash-1", token)).toBe(false);
  });

  it("rejects missing, empty and malformed tokens", () => {
    expect(isPinTokenValid(SECRET, "7k2m9qpx", "hash-1", undefined)).toBe(false);
    expect(isPinTokenValid(SECRET, "7k2m9qpx", "hash-1", "")).toBe(false);
    expect(isPinTokenValid(SECRET, "7k2m9qpx", "hash-1", "short")).toBe(false);
  });

  it("does not put the PIN hash in the token", () => {
    expect(pinToken(SECRET, "7k2m9qpx", "hash-1")).not.toContain("hash-1");
  });
});

describe("pinCookieName and pinCookieMaxAge", () => {
  it("names the cookie by link code", () => {
    expect(pinCookieName("7k2m9qpx")).toBe("pin_7k2m9qpx");
  });

  it("lasts 30 days, or less when the link expires sooner", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    expect(pinCookieMaxAge(null, now)).toBe(PIN_COOKIE_MAX_AGE_SECONDS);
    expect(pinCookieMaxAge(new Date("2027-01-01T00:00:00Z"), now)).toBe(PIN_COOKIE_MAX_AGE_SECONDS);
    expect(pinCookieMaxAge(new Date("2026-10-05T13:00:00Z"), now)).toBe(3600);
    expect(pinCookieMaxAge(new Date("2026-10-05T11:00:00Z"), now)).toBe(0);
  });
});
