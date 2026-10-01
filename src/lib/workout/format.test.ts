import { describe, expect, it } from "vitest";

import { countdownSeconds, formatCountdown } from "./format";

describe("formatCountdown", () => {
  it("shows plain seconds under a minute and m:ss from a minute", () => {
    expect(formatCountdown(0)).toBe("0");
    expect(formatCountdown(7)).toBe("7");
    expect(formatCountdown(59)).toBe("59");
    expect(formatCountdown(60)).toBe("1:00");
    expect(formatCountdown(125)).toBe("2:05");
    expect(formatCountdown(3600)).toBe("60:00");
  });
});

describe("countdownSeconds", () => {
  it("rounds up so the display reaches 0 only when the countdown has ended", () => {
    expect(countdownSeconds(10_000)).toBe(10);
    expect(countdownSeconds(9_001)).toBe(10);
    expect(countdownSeconds(1)).toBe(1);
    expect(countdownSeconds(0)).toBe(0);
  });
});
