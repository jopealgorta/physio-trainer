import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  addEntryAction,
  addNewRoutineEntryAction,
  copyEntryAction,
  createPlanAction,
  makeSeparateCopyAction,
  moveEntryAction,
  removeEntryAction,
  setEntryLabelAction,
  updatePlanAction,
} from "./actions";

const m = vi.hoisted(() => ({
  createPlan: vi.fn(),
  updatePlan: vi.fn(),
  addEntry: vi.fn(),
  addNewRoutineEntry: vi.fn(),
  moveEntry: vi.fn(),
  copyEntry: vi.fn(),
  setEntryLabel: vi.fn(),
  removeEntry: vi.fn(),
  makeSeparateCopy: vi.fn(),
  withPhysio: vi.fn((fn: (tx: unknown, physioId: string) => unknown) => fn({}, "physio-1")),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));

vi.mock("@/server/auth/session", () => ({ withPhysio: m.withPhysio }));
vi.mock("./mutations", () => ({
  createPlan: m.createPlan,
  updatePlan: m.updatePlan,
  addEntry: m.addEntry,
  addNewRoutineEntry: m.addNewRoutineEntry,
  moveEntry: m.moveEntry,
  copyEntry: m.copyEntry,
  setEntryLabel: m.setEntryLabel,
  removeEntry: m.removeEntry,
  makeSeparateCopy: m.makeSeparateCopy,
}));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string, values?: { name: string }) =>
    key === "copyName" ? `${values?.name} (copy)` : key,
}));

const PLAN = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";
const ENTRY = "1b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a11";
const ROUTINE = "2b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a12";
const idle = { status: "idle" } as const;
const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
};

beforeEach(() => vi.clearAllMocks());

describe("createPlanAction", () => {
  it("returns the name error without touching the database", async () => {
    await expect(createPlanAction(idle, form({ customerId: PLAN, name: "  " }))).resolves.toEqual({
      status: "error",
      fieldErrors: { name: "nameRequired" },
    });
    expect(m.withPhysio).not.toHaveBeenCalled();
  });

  it("treats a malformed customer id as customerNotFound", async () => {
    await expect(
      createPlanAction(idle, form({ customerId: "nope", name: "Week" })),
    ).resolves.toEqual({ status: "error", fieldErrors: {}, formError: "customerNotFound" });
    expect(m.createPlan).not.toHaveBeenCalled();
  });

  it("creates, revalidates and redirects to the board", async () => {
    m.createPlan.mockResolvedValue({ ok: true, data: { id: PLAN } });
    await expect(
      createPlanAction(idle, form({ customerId: ROUTINE, name: " Week ", caseId: "" })),
    ).rejects.toThrow(`REDIRECT /plans/${PLAN}`);
    expect(m.createPlan).toHaveBeenCalledWith({}, "physio-1", {
      customerId: ROUTINE,
      name: "Week",
      caseId: null,
    });
    expect(m.revalidatePath).toHaveBeenCalledWith("/plans", "layout");
  });

  it("forwards a mutation error", async () => {
    m.createPlan.mockResolvedValue({ ok: false, error: "caseNotFound" });
    await expect(
      createPlanAction(idle, form({ customerId: ROUTINE, name: "Week", caseId: PLAN })),
    ).resolves.toEqual({ status: "error", fieldErrors: {}, formError: "caseNotFound" });
  });
});

describe("addNewRoutineEntryAction", () => {
  it("validates the name and weekday before touching the database", async () => {
    await expect(
      addNewRoutineEntryAction(idle, form({ planId: PLAN, weekday: "1", name: " " })),
    ).resolves.toEqual({ status: "error", fieldErrors: { name: "nameRequired" } });
    await expect(
      addNewRoutineEntryAction(idle, form({ planId: PLAN, weekday: "9", name: "Knee" })),
    ).resolves.toEqual({ status: "error", fieldErrors: {}, formError: "invalid" });
    expect(m.withPhysio).not.toHaveBeenCalled();
  });

  it("creates and redirects to the routine editor with a way back to the plan", async () => {
    m.addNewRoutineEntry.mockResolvedValue({
      ok: true,
      data: { entryId: ENTRY, routineId: ROUTINE },
    });
    await expect(
      addNewRoutineEntryAction(idle, form({ planId: PLAN, weekday: "2", name: "Knee" })),
    ).rejects.toThrow(`REDIRECT /routines/${ROUTINE}?plan=${PLAN}`);
    expect(m.addNewRoutineEntry).toHaveBeenCalledWith({}, "physio-1", {
      planId: PLAN,
      weekday: 2,
      name: "Knee",
    });
    expect(m.revalidatePath).toHaveBeenCalledWith(`/plans/${PLAN}`);
    expect(m.revalidatePath).toHaveBeenCalledWith("/routines", "layout");
  });

  it("returns a mutation error", async () => {
    m.addNewRoutineEntry.mockResolvedValue({ ok: false, error: "dayFull" });
    await expect(
      addNewRoutineEntryAction(idle, form({ planId: PLAN, weekday: "2", name: "Knee" })),
    ).resolves.toEqual({ status: "error", fieldErrors: {}, formError: "dayFull" });
    expect(m.redirect).not.toHaveBeenCalled();
  });
});

describe("board actions", () => {
  it.each([
    ["addEntryAction", addEntryAction, { planId: "nope", weekday: 1, routineId: ROUTINE }],
    ["moveEntryAction", moveEntryAction, { planId: PLAN, entryId: ENTRY, weekday: 9, index: 0 }],
    ["copyEntryAction", copyEntryAction, { planId: PLAN, entryId: "x", weekday: 1 }],
    [
      "setEntryLabelAction",
      setEntryLabelAction,
      { planId: PLAN, entryId: ENTRY, label: "x".repeat(41) },
    ],
    ["removeEntryAction", removeEntryAction, "garbage"],
    ["makeSeparateCopyAction", makeSeparateCopyAction, null],
    ["updatePlanAction", updatePlanAction, { id: PLAN, name: "", status: "draft" }],
  ])(
    "%s rejects an invalid payload without touching the database",
    async (_name, action, input) => {
      await expect(action(input)).resolves.toEqual({ ok: false, error: "invalid" });
      expect(m.withPhysio).not.toHaveBeenCalled();
      expect(m.revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("moves, revalidating the plan", async () => {
    m.moveEntry.mockResolvedValue({ ok: true, data: {} });
    await expect(
      moveEntryAction({ planId: PLAN, entryId: ENTRY, weekday: 3, index: 1 }),
    ).resolves.toEqual({ ok: true, data: {} });
    expect(m.moveEntry).toHaveBeenCalledWith({}, "physio-1", {
      planId: PLAN,
      entryId: ENTRY,
      weekday: 3,
      index: 1,
    });
    expect(m.revalidatePath).toHaveBeenCalledWith(`/plans/${PLAN}`);
    expect(m.revalidatePath).not.toHaveBeenCalledWith("/routines", "layout");
  });

  it("forwards errors without revalidating", async () => {
    m.copyEntry.mockResolvedValue({ ok: false, error: "dayFull" });
    await expect(copyEntryAction({ planId: PLAN, entryId: ENTRY, weekday: 1 })).resolves.toEqual({
      ok: false,
      error: "dayFull",
    });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("add and remove also revalidate routines (standalone flag, deleted routine)", async () => {
    m.addEntry.mockResolvedValue({ ok: true, data: { entryId: ENTRY } });
    await addEntryAction({ planId: PLAN, weekday: 1, routineId: ROUTINE, standalone: false });
    expect(m.addEntry).toHaveBeenCalledWith(
      {},
      "physio-1",
      expect.objectContaining({ standalone: false, label: null }),
    );
    m.removeEntry.mockResolvedValue({ ok: true, data: { deletedRoutine: true } });
    await removeEntryAction({ planId: PLAN, entryId: ENTRY, deleteRoutine: true });
    expect(m.revalidatePath).toHaveBeenCalledWith("/routines", "layout");
  });

  it("separate copy names the copy with the translated suffix", async () => {
    m.makeSeparateCopy.mockImplementation(
      async (_tx: unknown, _id: string, _input: unknown, name: (n: string) => string) => ({
        ok: true,
        data: { routineId: name("Knee rehab A") },
      }),
    );
    await expect(makeSeparateCopyAction({ planId: PLAN, entryId: ENTRY })).resolves.toEqual({
      ok: true,
      data: { routineId: "Knee rehab A (copy)" },
    });
  });

  it("separate copy cuts the name to the routine limit", async () => {
    m.makeSeparateCopy.mockImplementation(
      async (_tx: unknown, _id: string, _input: unknown, name: (n: string) => string) => ({
        ok: true,
        data: { routineId: name("x".repeat(80)) },
      }),
    );
    const result = await makeSeparateCopyAction({ planId: PLAN, entryId: ENTRY });
    expect(result.ok && result.data.routineId).toHaveLength(80);
  });

  it("label and update actions revalidate on success", async () => {
    m.setEntryLabel.mockResolvedValue({ ok: true, data: {} });
    await setEntryLabelAction({ planId: PLAN, entryId: ENTRY, label: " Morning " });
    expect(m.setEntryLabel).toHaveBeenCalledWith(
      {},
      "physio-1",
      expect.objectContaining({ label: "Morning" }),
    );
    m.updatePlan.mockResolvedValue({ ok: true, data: { version: 4 } });
    await expect(
      updatePlanAction({ id: PLAN, name: "Week", notes: "", caseId: "", status: "active" }),
    ).resolves.toEqual({ ok: true, data: { version: 4 } });
    expect(m.revalidatePath).toHaveBeenCalledWith(`/plans/${PLAN}`);
  });
});
