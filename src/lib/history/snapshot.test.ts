import { describe, expect, it } from "vitest";
import {
  planSnapshotSchema,
  routineSnapshotSchema,
  SNAPSHOT_SCHEMA,
  VERSION_KINDS,
} from "./snapshot";

const routine = {
  schema: 1,
  routine: {
    name: "Knee rehab",
    notes: null,
    status: "active",
    caseId: null,
    sessionsPerWeek: 3,
    sessionsPerDay: null,
    phaseLabel: null,
    startsOn: "2026-01-01",
    endsOn: null,
  },
  groups: [{ key: "g0", restSeconds: 30 }],
  items: [
    {
      exercise: { id: "e1", name: "Squat", instructions: null },
      position: 0,
      prescription: {
        groupKey: "g0",
        holdSeconds: null,
        restSeconds: null,
        side: "both",
        notes: null,
        sets: [{ reps: 10, repsMax: null, durationSeconds: null, load: "5 kg" }],
      },
    },
  ],
};

const plan = {
  schema: 1,
  plan: {
    name: "Week",
    notes: null,
    status: "draft",
    caseId: null,
    phaseLabel: null,
    startsOn: null,
    endsOn: null,
  },
  entries: [
    {
      id: "n1",
      weekday: 1,
      position: 0,
      label: null,
      routine: { id: "r1", name: "Knee rehab", version: 2 },
    },
  ],
};

describe("snapshot schemas", () => {
  it("defaults the aerobic set fields of an old snapshot to null", () => {
    const parsed = routineSnapshotSchema.parse(routine);
    expect(parsed.items[0].prescription.sets[0]).toMatchObject({
      distanceMeters: null,
      intensity: null,
    });
  });
  it("defaults sections and an item's section key on a snapshot saved before sections", () => {
    const parsed = routineSnapshotSchema.parse(routine);
    expect(parsed.sections).toEqual([]);
    expect(parsed.items[0].prescription.sectionKey).toBeNull();
  });
  it("parses a plan snapshot saved before day notes with no days", () => {
    expect(planSnapshotSchema.parse(plan).days).toEqual([]);
  });

  it("exposes the schema number and kinds", () => {
    expect(SNAPSHOT_SCHEMA).toBe(1);
    expect(VERSION_KINDS).toEqual(["created", "edited", "restored"]);
  });

  it("parses a valid routine snapshot", () => {
    expect(routineSnapshotSchema.safeParse(routine).success).toBe(true);
  });

  it("parses a valid plan snapshot", () => {
    expect(planSnapshotSchema.safeParse(plan).success).toBe(true);
  });

  it("rejects an unknown schema number", () => {
    expect(routineSnapshotSchema.safeParse({ ...routine, schema: 2 }).success).toBe(false);
    expect(planSnapshotSchema.safeParse({ ...plan, schema: 2 }).success).toBe(false);
  });

  it("rejects an item without sets", () => {
    const { sets: _sets, ...prescription } = routine.items[0].prescription;
    const broken = { ...routine, items: [{ ...routine.items[0], prescription }] };
    expect(routineSnapshotSchema.safeParse(broken).success).toBe(false);
  });
});
