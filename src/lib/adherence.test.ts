import { describe, expect, it } from "vitest";

import {
  adherence,
  datesBetween,
  dayCells,
  heatmapWeeks,
  painSeries,
  plannedOn,
  plannedSessions,
  type LogFact,
  type PlanFact,
  type SingleFact,
} from "./adherence";

// Mon 2026-09-28 … Sun 2026-10-04; Mon 2026-10-05.
const plan = (
  entries: [weekday: number, routineId: string][],
  window: Partial<PlanFact> = {},
): PlanFact => ({
  status: "active",
  startsOn: null,
  endsOn: null,
  entries: entries.map(([weekday, routineId], i) => ({ id: `e${i}`, weekday, routineId })),
  ...window,
});
const single = (sessionsPerWeek: number | null, window: Partial<SingleFact> = {}): SingleFact => ({
  status: "active",
  startsOn: null,
  endsOn: null,
  sessionsPerWeek,
  sessionsPerDay: null,
  ...window,
});
const log = (performedOn: string, extra: Partial<LogFact> = {}): LogFact => ({
  routineId: "r1",
  entryId: null,
  performedOn,
  completed: true,
  pain: null,
  ...extra,
});

describe("datesBetween", () => {
  it("is inclusive and empty when reversed", () => {
    expect(datesBetween("2026-09-30", "2026-10-02")).toEqual([
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
    expect(datesBetween("2026-10-02", "2026-10-02")).toEqual(["2026-10-02"]);
    expect(datesBetween("2026-10-03", "2026-10-02")).toEqual([]);
  });
});

describe("plannedOn", () => {
  it("counts the plan entries of that weekday", () => {
    const p = plan([
      [1, "a"],
      [1, "b"],
      [3, "a"],
    ]);
    expect(plannedOn("2026-09-28", [p])).toBe(2);
    expect(plannedOn("2026-09-30", [p])).toBe(1);
    expect(plannedOn("2026-09-29", [p])).toBe(0);
  });

  it("ignores plans that are not active that day (draft, outside the phase window)", () => {
    const entries: [number, string][] = [[1, "a"]];
    expect(plannedOn("2026-09-28", [plan(entries, { status: "draft" })])).toBe(0);
    expect(plannedOn("2026-09-28", [plan(entries, { startsOn: "2026-09-29" })])).toBe(0);
    expect(plannedOn("2026-09-28", [plan(entries, { endsOn: "2026-09-27" })])).toBe(0);
    expect(plannedOn("2026-09-28", [plan(entries, { endsOn: "2026-09-28" })])).toBe(1);
  });

  it("adds up several plans", () => {
    expect(plannedOn("2026-09-28", [plan([[1, "a"]]), plan([[1, "b"]]), plan([[2, "c"]])])).toBe(2);
  });
});

describe("plannedSessions", () => {
  it("sums plan entries over the window", () => {
    const p = plan([
      [1, "a"],
      [3, "a"],
      [5, "a"],
    ]);
    expect(plannedSessions("2026-09-28", "2026-10-04", [p], [])).toBe(3);
    expect(plannedSessions("2026-09-28", "2026-10-11", [p], [])).toBe(6);
  });

  it("pro-rates a single routine's sessions per week over its active days", () => {
    expect(plannedSessions("2026-09-28", "2026-10-04", [], [single(3)])).toBeCloseTo(3);
    // Active for 2 of the 7 days: 3 × 2/7.
    expect(
      plannedSessions("2026-09-28", "2026-10-04", [], [single(3, { startsOn: "2026-10-03" })]),
    ).toBeCloseTo(6 / 7);
  });

  it("treats a routine with only sessions per day as daily and one with no frequency as unplanned", () => {
    expect(
      plannedSessions("2026-09-28", "2026-10-04", [], [{ ...single(null), sessionsPerDay: 2 }]),
    ).toBeCloseTo(7);
    expect(plannedSessions("2026-09-28", "2026-10-04", [], [single(null)])).toBe(0);
  });

  it("skips inactive singles", () => {
    expect(plannedSessions("2026-09-28", "2026-10-04", [], [single(3, { status: "draft" })])).toBe(
      0,
    );
  });
});

describe("adherence", () => {
  const p = plan([
    [1, "r1"],
    [3, "r1"],
  ]);

  it("is completed over planned, capped at 1, null without a plan", () => {
    const logs = [log("2026-09-28")];
    expect(adherence("2026-09-28", "2026-10-04", [p], [], logs)).toEqual({
      planned: 2,
      completed: 1,
      ratio: 0.5,
    });
    const many = [log("2026-09-28"), log("2026-09-29"), log("2026-09-30"), log("2026-10-01")];
    expect(adherence("2026-09-28", "2026-10-04", [p], [], many).ratio).toBe(1);
    expect(adherence("2026-09-28", "2026-10-04", [], [], logs)).toEqual({
      planned: 0,
      completed: 1,
      ratio: null,
    });
  });

  it("counts only completed logs inside the window", () => {
    const logs = [
      log("2026-09-28", { completed: false }),
      log("2026-09-27"),
      log("2026-10-05"),
      log("2026-09-30"),
    ];
    expect(adherence("2026-09-28", "2026-10-04", [p], [], logs).completed).toBe(1);
  });
});

describe("dayCells", () => {
  const p = plan([
    [1, "r1"],
    [2, "r1"],
    [2, "r2"],
    [4, "r1"],
  ]);
  const today = "2026-10-01"; // Thursday

  it("classifies each day against what was planned", () => {
    const logs = [
      log("2026-09-28", { entryId: "e0" }), // Mon planned 1 done 1
      log("2026-09-29", { entryId: "e1" }), // Tue planned 2 done 1
      log("2026-09-30"), // Wed nothing planned, extra
    ];
    const cells = dayCells("2026-09-28", "2026-10-02", today, [p], logs);
    expect(cells.map((c) => [c.date, c.state, c.planned, c.completed])).toEqual([
      ["2026-09-28", "done", 1, 1],
      ["2026-09-29", "partial", 2, 1],
      ["2026-09-30", "extra", 0, 1],
      ["2026-10-01", "planned", 1, 0], // today, not yet done
      ["2026-10-02", "none", 0, 0],
    ]);
  });

  it("marks past planned days with nothing done as missed and future ones as upcoming", () => {
    const cells = dayCells(
      "2026-09-28",
      "2026-10-02",
      today,
      [
        plan([
          [1, "r"],
          [5, "r"],
        ]),
      ],
      [],
    );
    expect(cells[0]!.state).toBe("missed");
    expect(cells[4]!.state).toBe("upcoming");
  });

  it("does not let a standalone routine make up for a planned entry that was not done", () => {
    // Tuesday plans two entries; one is logged along with an unrelated standalone routine.
    const logs = [log("2026-09-29", { entryId: "e1" }), log("2026-09-29", { routineId: "solo" })];
    const [tuesday] = dayCells("2026-09-29", "2026-09-29", today, [p], logs);
    expect(tuesday).toMatchObject({ state: "partial", planned: 2, completed: 1 });
    // Only a standalone log on a planned day: still missed.
    const [monday] = dayCells("2026-09-28", "2026-09-28", today, [p], [log("2026-09-28")]);
    expect(monday!.state).toBe("missed");
  });

  it("ignores logs that are not completed", () => {
    const cells = dayCells(
      "2026-09-28",
      "2026-09-28",
      today,
      [p],
      [log("2026-09-28", { completed: false })],
    );
    expect(cells[0]!.state).toBe("missed");
  });
});

describe("heatmapWeeks", () => {
  it("returns Monday-first weeks ending with the one that holds today", () => {
    const weeks = heatmapWeeks("2026-10-01", 3);
    expect(weeks).toHaveLength(3);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0]![0]).toBe("2026-09-14");
    expect(weeks[2]![0]).toBe("2026-09-28");
    expect(weeks[2]![6]).toBe("2026-10-04");
  });
});

describe("painSeries", () => {
  const logs = [
    log("2026-09-30", { pain: 4 }),
    log("2026-09-30", { routineId: "r2", pain: 6 }),
    log("2026-10-01", { pain: 3 }),
    log("2026-10-02", { pain: null }),
    log("2026-09-29", { completed: false, pain: 8 }),
  ];

  it("averages the ratings of each day, oldest first, skipping unrated logs", () => {
    expect(painSeries(logs, null)).toEqual([
      { date: "2026-09-29", pain: 8 },
      { date: "2026-09-30", pain: 5 },
      { date: "2026-10-01", pain: 3 },
    ]);
  });

  it("can follow a single routine", () => {
    expect(painSeries(logs, "r2")).toEqual([{ date: "2026-09-30", pain: 6 }]);
  });
});
