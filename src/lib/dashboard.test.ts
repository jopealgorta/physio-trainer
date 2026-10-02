import { describe, expect, it } from "vitest";

import type { LogFact, PlanFact } from "./adherence";
import { buildDashboard, RECENT_LIMIT, type CustomerFacts, type UnseenComment } from "./dashboard";

// Thursday 2026-10-08.
const today = "2026-10-08";
const plan = (weekdays: number[]): PlanFact => ({
  status: "active",
  startsOn: null,
  endsOn: null,
  entries: weekdays.map((weekday, i) => ({ id: `e${i}`, weekday, routineId: "r1" })),
});
const log = (performedOn: string, extra: Partial<LogFact> = {}) => ({
  routineId: "r1",
  entryId: null,
  performedOn,
  completed: true,
  pain: null,
  updatedAt: new Date(`${performedOn}T12:00:00Z`),
  ...extra,
});
const customer = (id: string, extra: Partial<CustomerFacts> = {}): CustomerFacts => ({
  id,
  name: id.toUpperCase(),
  plans: [],
  singles: [],
  logs: [],
  hasLink: true,
  ...extra,
});
const build = (customers: CustomerFacts[], unseen: UnseenComment[] = []) =>
  buildDashboard({ today, customers, unseen });

describe("buildDashboard", () => {
  it("is empty for a physio with no activity", () => {
    expect(build([])).toEqual({
      totals: { activeCustomers: 0, sessionsThisWeek: 0 },
      attention: [],
      newComments: [],
      recentlyActive: [],
    });
  });

  it("totals the customers and the sessions completed this Monday-Sunday week", () => {
    const result = build([
      customer("a", {
        logs: [log("2026-10-05"), log("2026-10-08"), log("2026-10-06", { completed: false })],
      }),
      customer("b", { logs: [log("2026-10-04"), log("2026-10-07")] }),
    ]);
    // Mon 5th..Thu 8th this week: a has 2 completed, b has 1 (the 4th was last Sunday).
    expect(result.totals).toEqual({ activeCustomers: 2, sessionsThisWeek: 3 });
  });

  it("lists who needs attention with the reasons, worst first", () => {
    const result = build([
      customer("quiet", { logs: [log("2026-10-07", { pain: 2 })] }),
      customer("pain", { logs: [log("2026-10-07", { pain: 8 })] }),
      customer("both", {
        // Only 1 of 3 planned sessions in the last 7 days, and pain of 9.
        plans: [plan([1, 3, 5])],
        logs: [log("2026-10-07", { pain: 9 })],
      }),
    ]);
    expect(result.attention.map((entry) => entry.customerId)).toEqual(["both", "pain"]);
    expect(result.attention[0]!.reasons.map((reason) => reason.rule)).toEqual([
      "highPain",
      "lowAdherence",
    ]);
    expect(result.attention[0]).toMatchObject({ name: "BOTH" });
  });

  it("does not flag adherence for a customer without a usable link", () => {
    const result = build([customer("nolink", { plans: [plan([1, 3, 5])], hasLink: false })]);
    expect(result.attention).toEqual([]);
  });

  it("groups unseen comments per customer, newest first", () => {
    const unseen: UnseenComment[] = [
      { customerId: "a", comment: "old", performedOn: "2026-10-01", routineName: "Knee" },
      { customerId: "b", comment: "newest", performedOn: "2026-10-07", routineName: "Back" },
      { customerId: "a", comment: "later", performedOn: "2026-10-06", routineName: "Knee" },
    ];
    const { newComments } = build([customer("a"), customer("b")], unseen);
    expect(newComments).toEqual([
      {
        customerId: "b",
        name: "B",
        count: 1,
        latest: { comment: "newest", performedOn: "2026-10-07", routineName: "Back" },
      },
      {
        customerId: "a",
        name: "A",
        count: 2,
        latest: { comment: "later", performedOn: "2026-10-06", routineName: "Knee" },
      },
    ]);
  });

  it("ignores comments of customers that are not active", () => {
    const unseen: UnseenComment[] = [
      { customerId: "gone", comment: "hi", performedOn: "2026-10-06", routineName: "Knee" },
    ];
    expect(build([customer("a")], unseen).newComments).toEqual([]);
  });

  it("lists recently active customers by their latest log, within 7 days", () => {
    const result = build([
      customer("old", { logs: [log("2026-10-01")] }),
      customer("early", { logs: [log("2026-10-03"), log("2026-10-04")] }),
      customer("late", { logs: [log("2026-10-07")] }),
    ]);
    expect(result.recentlyActive.map((entry) => entry.customerId)).toEqual(["late", "early"]);
    expect(result.recentlyActive[1]).toMatchObject({ sessionsLast7: 2 });
  });

  it("caps the recently active list", () => {
    const many = Array.from({ length: RECENT_LIMIT + 3 }, (_, i) =>
      customer(`c${i}`, { logs: [log("2026-10-07")] }),
    );
    expect(build(many).recentlyActive).toHaveLength(RECENT_LIMIT);
  });
});
