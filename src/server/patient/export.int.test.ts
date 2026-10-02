import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runAsPhysio } from "@/db/rls";
import { ensureShareLink } from "@/server/sharing/mutations";
import { insertCustomer, insertExercise, insertPlan, insertRoutine } from "@/test/int/content";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

import { getPatientExport } from "./export";
import { resolveLink } from "./resolve-link";

// Wednesday 7 Oct 2026, in the test physio's time zone (UTC, the column default).
const NOW = new Date("2026-10-07T10:00:00Z");

describe("getPatientExport", () => {
  const created: TestPhysio[] = [];
  let physio: TestPhysio;

  const exportOf = async (ref: Parameters<typeof ensureShareLink>[2]) => {
    const result = await runAsPhysio(physio.claims, (tx, id) => ensureShareLink(tx, id, ref));
    if (!result.ok) throw new Error(result.error);
    const resolved = await resolveLink(result.data.link.code, NOW);
    if (resolved.status !== "ok") throw new Error(`expected ok, got ${resolved.status}`);
    return getPatientExport(resolved.shell, resolved.link, NOW);
  };

  let customerId: string;
  let standalone: string;
  let monday: string;
  let friday: string;
  let planId: string;
  let otherPlanId: string;
  let foreign: string;

  beforeAll(async () => {
    physio = await createTestPhysio({ onboarded: true });
    created.push(physio);

    customerId = await insertCustomer(physio.id);
    const otherCustomer = await insertCustomer(physio.id, { firstName: "Other" });
    const ex = await insertExercise(physio.id);
    const items = [{ exerciseId: ex }];
    standalone = await insertRoutine(physio.id, customerId, {
      name: "Standalone",
      status: "active",
      phaseLabel: "Phase 2",
      items,
    });
    monday = await insertRoutine(physio.id, customerId, {
      name: "Monday",
      status: "active",
      isStandalone: false,
      items,
    });
    friday = await insertRoutine(physio.id, customerId, {
      name: "Friday",
      status: "active",
      isStandalone: false,
      items,
    });
    foreign = await insertRoutine(physio.id, otherCustomer, {
      name: "Foreign",
      status: "active",
      isStandalone: false,
      items,
    });
    await insertRoutine(physio.id, otherCustomer, { name: "Foreign standalone", status: "active" });
    planId = await insertPlan(physio.id, customerId, {
      name: "Week",
      status: "active",
      phaseLabel: "Phase 1",
      entries: [
        { weekday: 5, routineId: friday, label: "Evening" },
        { weekday: 1, routineId: monday },
        // Cannot happen through the app, but the patient layer must not trust it.
        { weekday: 3, routineId: foreign },
      ],
    });
    otherPlanId = await insertPlan(physio.id, customerId, {
      name: "Another week",
      status: "active",
      entries: [{ weekday: 2, routineId: monday }],
    });
  });
  afterAll(() => deleteTestPhysios(...created));

  const allPhases = (data: Awaited<ReturnType<typeof getPatientExport>>) => [
    ...data.plans.map((plan) => plan.phase),
    ...data.routines.map((routine) => routine.phase),
    ...data.planRoutines.map((routine) => routine.phase),
  ];

  it("a customer link exports every weekday's entries and the standalone routines", async () => {
    const data = await exportOf({ target: "customer", customerId });
    expect(data.today).toBe("2026-10-07");
    expect(data.title).toBeNull();
    expect(data.plans.map((plan) => plan.id)).toEqual([otherPlanId, planId]);
    expect(data.plans.find((plan) => plan.id === planId)!.entries).toEqual([
      { weekday: 1, label: null, routineId: monday },
      { weekday: 5, label: "Evening", routineId: friday },
    ]);
    expect(data.routines.map((routine) => routine.id)).toEqual([standalone]);
    expect(data.planRoutines.map((routine) => routine.id).sort()).toEqual([monday, friday].sort());
    const ids = [...data.routines, ...data.planRoutines].map((routine) => routine.id);
    expect(ids).not.toContain(foreign);
    expect(allPhases(data).every((phase) => phase === null)).toBe(true);
  });

  it("a plan link exports only that plan", async () => {
    const data = await exportOf({ target: "weekly_plan", weeklyPlanId: planId });
    expect(data.title).toBe("Week");
    expect(data.plans.map((plan) => plan.id)).toEqual([planId]);
    expect(data.routines).toEqual([]);
    expect(data.planRoutines.map((routine) => routine.id).sort()).toEqual([monday, friday].sort());
    expect(allPhases(data).every((phase) => phase === null)).toBe(true);
  });

  it("a routine link exports only that routine", async () => {
    const data = await exportOf({ target: "routine", routineId: standalone });
    expect(data.title).toBe("Standalone");
    expect(data.plans).toEqual([]);
    expect(data.planRoutines).toEqual([]);
    expect(data.routines.map((routine) => routine.id)).toEqual([standalone]);
    expect(data.routines[0]!.phase).toBeNull();
  });

  it("a routine link to a plan-only routine exports it", async () => {
    const data = await exportOf({ target: "routine", routineId: monday });
    expect(data.title).toBe("Monday");
    expect(data.routines.map((routine) => routine.id)).toEqual([monday]);
  });
});
