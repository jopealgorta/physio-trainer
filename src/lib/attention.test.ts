import { describe, expect, it } from "vitest";

import type { LogFact } from "./adherence";
import { ATTENTION, attentionWindows, needsAttention } from "./attention";

const today = "2026-10-08";
const log = (performedOn: string, pain: number | null): LogFact => ({
  routineId: "r1",
  entryId: null,
  performedOn,
  completed: true,
  pain,
});
const base = { today, logs: [] as LogFact[], adherence: null, hasLink: true };

describe("attentionWindows", () => {
  it("uses the last 7 days for pain, the 7 before for the comparison, and ends adherence yesterday", () => {
    expect(attentionWindows(today)).toEqual({
      recent: ["2026-10-02", "2026-10-08"],
      previous: ["2026-09-25", "2026-10-01"],
      adherence: ["2026-10-01", "2026-10-07"],
    });
  });
});

describe("needsAttention", () => {
  it("flags nothing for a quiet customer", () => {
    expect(needsAttention(base)).toEqual([]);
  });

  it("flags pain of 7 or more in the last 7 days", () => {
    expect(needsAttention({ ...base, logs: [log("2026-10-05", 7)] })).toEqual([
      { rule: "highPain", pain: 7 },
    ]);
    expect(needsAttention({ ...base, logs: [log("2026-10-05", 6)] })).toEqual([]);
    // Older than 7 days: not recent.
    expect(needsAttention({ ...base, logs: [log("2026-10-01", 9)] })).toEqual([]);
  });

  it("reports the highest recent pain", () => {
    expect(needsAttention({ ...base, logs: [log("2026-10-04", 7), log("2026-10-06", 9)] })).toEqual(
      [{ rule: "highPain", pain: 9 }],
    );
  });

  it("flags an average pain rise of 3 or more against the previous 7 days", () => {
    const logs = [
      log("2026-09-28", 1),
      log("2026-09-30", 2),
      log("2026-10-05", 4),
      log("2026-10-06", 5),
    ];
    // previous average 1.5, recent 4.5: +3.
    expect(needsAttention({ ...base, logs })).toEqual([{ rule: "painRise", delta: 3 }]);
    expect(needsAttention({ ...base, logs: [log("2026-09-28", 2), log("2026-10-05", 4)] })).toEqual(
      [],
    );
  });

  it("needs ratings in both weeks to compare", () => {
    expect(needsAttention({ ...base, logs: [log("2026-10-05", 6)] })).toEqual([]);
    expect(
      needsAttention({ ...base, logs: [log("2026-09-28", 1), log("2026-10-05", null)] }),
    ).toEqual([]);
  });

  it("flags adherence under 50 % only when something is planned and the link works", () => {
    const low = { planned: 4, completed: 1, ratio: 0.25 };
    expect(needsAttention({ ...base, adherence: low })).toEqual([
      { rule: "lowAdherence", percent: 25 },
    ]);
    expect(
      needsAttention({ ...base, adherence: { planned: 4, completed: 2, ratio: 0.5 } }),
    ).toEqual([]);
    expect(
      needsAttention({ ...base, adherence: { planned: 0, completed: 0, ratio: null } }),
    ).toEqual([]);
    expect(needsAttention({ ...base, adherence: low, hasLink: false })).toEqual([]);
  });

  it("can raise several rules at once, pain first", () => {
    const rules = needsAttention({
      ...base,
      logs: [log("2026-09-28", 1), log("2026-10-05", 8)],
      adherence: { planned: 4, completed: 0, ratio: 0 },
    }).map((reason) => reason.rule);
    expect(rules).toEqual(["highPain", "painRise", "lowAdherence"]);
  });

  it("exposes the thresholds", () => {
    expect(ATTENTION).toEqual({ highPain: 7, painRise: 3, lowAdherence: 0.5 });
  });
});
