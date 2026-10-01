import { describe, expect, it } from "vitest";

import { generatePin, isValidPin, normalizePin } from "./pin";

describe("generatePin", () => {
  it("is always four digits, including leading zeros", () => {
    for (let i = 0; i < 300; i++) expect(generatePin()).toMatch(/^\d{4}$/);
    expect(generatePin(() => new Uint32Array([7]))).toBe("0007");
    expect(generatePin(() => new Uint32Array([4_294_959_999]))).toBe("9999");
  });

  it("is not biased by the modulo (rejects values above the largest multiple of 10000)", () => {
    const values = [4_294_960_000, 12];
    let call = 0;
    expect(generatePin(() => new Uint32Array([values[call++]!]))).toBe("0012");
  });
});

describe("isValidPin and normalizePin", () => {
  it("accepts exactly four ASCII digits", () => {
    expect(isValidPin("0123")).toBe(true);
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("12345")).toBe(false);
    expect(isValidPin("12a4")).toBe(false);
    expect(isValidPin("１２３４")).toBe(false);
  });

  it("trims whitespace the patient may have typed", () => {
    expect(normalizePin(" 1234 ")).toBe("1234");
    expect(normalizePin(null)).toBe("");
  });
});
