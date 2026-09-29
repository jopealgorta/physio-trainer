import { describe, expect, it } from "vitest";

import { telHref, whatsappHref } from "./phone";

describe("telHref", () => {
  it("keeps only digits and a leading +", () => {
    expect(telHref("+598 99 123 456")).toBe("tel:+59899123456");
    expect(telHref("(099) 123-456")).toBe("tel:099123456");
  });
  it("never builds a link from text that is not phone-like", () => {
    expect(telHref("")).toBeNull();
    expect(telHref("no phone")).toBeNull();
    expect(telHref("javascript:alert(1)")).toBeNull();
    expect(telHref("123;evil")).toBeNull();
  });
});

describe("whatsappHref", () => {
  it("needs an international number", () => {
    expect(whatsappHref("+598 99 123 456")).toBe("https://wa.me/59899123456");
    expect(whatsappHref("00598 99 123 456")).toBe("https://wa.me/59899123456");
    expect(whatsappHref("099 123 456")).toBeNull();
  });
  it("rejects lengths outside 7-15 digits", () => {
    expect(whatsappHref("+12345")).toBeNull();
    expect(whatsappHref("+1234567890123456")).toBeNull();
  });
  it("rejects junk", () => {
    expect(whatsappHref("javascript:alert(1)")).toBeNull();
  });
});
