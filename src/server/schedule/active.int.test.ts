import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { runAsPhysio } from "@/db/rls";
import { customers, physios, routines, weeklyPlans } from "@/db/schema";
import { scheduleState, type ScheduleState } from "@/lib/schedule";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

import { physioToday, scheduleFilter } from "./active";

const TODAY = "2026-10-05";
const STATUSES = ["draft", "active", "archived"] as const;
const BOUNDS = [null, "2026-10-04", "2026-10-05", "2026-10-06"] as const;

describe("schedule filters", () => {
  let physio: TestPhysio;
  let customerId: string;

  beforeAll(async () => {
    physio = await createTestPhysio({ onboarded: true });
    const [row] = await db
      .insert(customers)
      .values({ physioId: physio.id, firstName: "Ana", locale: "en" })
      .returning({ id: customers.id });
    customerId = row.id;
  });
  afterAll(() => deleteTestPhysios(physio));

  it("agrees with scheduleState for every status and bound combination", async () => {
    const seeded: { id: string; state: ScheduleState; plan: string }[] = [];
    for (const status of STATUSES) {
      for (const startsOn of BOUNDS) {
        for (const endsOn of BOUNDS) {
          if (startsOn && endsOn && endsOn < startsOn) continue;
          const [routine] = await db
            .insert(routines)
            .values({ physioId: physio.id, customerId, name: "R", status, startsOn, endsOn })
            .returning({ id: routines.id });
          const [plan] = await db
            .insert(weeklyPlans)
            .values({ physioId: physio.id, customerId, name: "P", status, startsOn, endsOn })
            .returning({ id: weeklyPlans.id });
          seeded.push({
            id: routine.id,
            plan: plan.id,
            state: scheduleState({ status, startsOn, endsOn }, TODAY),
          });
        }
      }
    }

    for (const state of ["active", "upcoming", "ended"] as const) {
      const expected = seeded.filter((row) => row.state === state);
      expect(expected.length).toBeGreaterThan(0);
      const [routineIds, planIds] = await runAsPhysio(physio.claims, async (tx) =>
        Promise.all([
          tx
            .select({ id: routines.id })
            .from(routines)
            .where(scheduleFilter(routines, state, TODAY)),
          tx
            .select({ id: weeklyPlans.id })
            .from(weeklyPlans)
            .where(scheduleFilter(weeklyPlans, state, TODAY)),
        ]),
      );
      expect(routineIds.map((row) => row.id).sort()).toEqual(expected.map((row) => row.id).sort());
      expect(planIds.map((row) => row.id).sort()).toEqual(expected.map((row) => row.plan).sort());
    }
  });

  it("physioToday follows the physio's time zone", async () => {
    await db.update(physios).set({ timezone: "Pacific/Auckland" }).where(eq(physios.id, physio.id));
    const now = new Date("2026-10-01T23:30:00Z");
    await expect(runAsPhysio(physio.claims, (tx, id) => physioToday(tx, id, now))).resolves.toBe(
      "2026-10-02",
    );
    await db
      .update(physios)
      .set({ timezone: "America/Los_Angeles" })
      .where(eq(physios.id, physio.id));
    await expect(runAsPhysio(physio.claims, (tx, id) => physioToday(tx, id, now))).resolves.toBe(
      "2026-10-01",
    );
  });
});
