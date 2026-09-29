import { describe, expect, it } from "vitest";

import { customerName } from "./customers";

describe("customerName", () => {
  it("joins first and last name", () => {
    expect(customerName("Ana", "Pérez")).toBe("Ana Pérez");
  });

  it("returns just the first name when there is no last name", () => {
    expect(customerName("Ana", null)).toBe("Ana");
    expect(customerName("Ana", "")).toBe("Ana");
  });
});
