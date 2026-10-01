import { describe, expect, it, vi } from "vitest";

import { hashPin, verifyPin } from "./pin-hash";

// Unit tests run without the int config's server-only alias; the real package throws here.
vi.mock("server-only", () => ({}));

describe("hashPin and verifyPin", () => {
  it("accepts the right PIN and rejects another", async () => {
    const hash = await hashPin("0420");
    expect(await verifyPin("0420", hash)).toBe(true);
    expect(await verifyPin("0421", hash)).toBe(false);
    expect(await verifyPin("", hash)).toBe(false);
  });

  it("salts every hash and never contains the PIN", async () => {
    const [a, b] = await Promise.all([hashPin("1234"), hashPin("1234")]);
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$")).toBe(true);
    expect(a).not.toContain("1234$");
  });

  it("rejects malformed or tampered hashes instead of throwing", async () => {
    expect(await verifyPin("1234", "")).toBe(false);
    expect(await verifyPin("1234", "scrypt$1$2$3")).toBe(false);
    expect(await verifyPin("1234", "bcrypt$16384$8$1$AAAA$AAAA")).toBe(false);
    expect(await verifyPin("1234", "scrypt$abc$8$1$AAAA$AAAA")).toBe(false);
    const hash = await hashPin("1234");
    expect(await verifyPin("1234", hash.slice(0, -4) + "AAAA")).toBe(false);
  });
});
