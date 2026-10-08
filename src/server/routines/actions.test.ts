import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRoutineAction, saveRoutineAction, searchExercisesAction } from "./actions";

const m = vi.hoisted(() => ({
  createRoutine: vi.fn(),
  saveRoutine: vi.fn(),
  listExercises: vi.fn(),
  withPhysio: vi.fn((fn: (tx: unknown, physioId: string) => unknown) => fn({}, "physio-1")),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));

vi.mock("@/server/auth/session", () => ({ withPhysio: m.withPhysio }));
vi.mock("./mutations", () => ({ createRoutine: m.createRoutine, saveRoutine: m.saveRoutine }));
vi.mock("@/server/library/queries", () => ({ listExercises: m.listExercises }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));

const UUID = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";
const EX = "1b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a11";
const CASE = "2b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a12";
const idle = { status: "idle" } as const;
const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
};

beforeEach(() => vi.clearAllMocks());

describe("createRoutineAction", () => {
  it("returns the name error without touching the database", async () => {
    await expect(
      createRoutineAction(idle, form({ customerId: UUID, name: "  " })),
    ).resolves.toEqual({ status: "error", fieldErrors: { name: "nameRequired" } });
    await expect(
      createRoutineAction(idle, form({ customerId: UUID, name: "x".repeat(81) })),
    ).resolves.toEqual({ status: "error", fieldErrors: { name: "nameTooLong" } });
    expect(m.withPhysio).not.toHaveBeenCalled();
  });

  it("treats a malformed or missing customer id as customerNotFound", async () => {
    await expect(
      createRoutineAction(idle, form({ customerId: "nope", name: "Knee" })),
    ).resolves.toEqual({ status: "error", fieldErrors: {}, formError: "customerNotFound" });
    await expect(createRoutineAction(idle, form({ name: "Knee" }))).resolves.toMatchObject({
      formError: "customerNotFound",
    });
    expect(m.withPhysio).not.toHaveBeenCalled();
    expect(m.createRoutine).not.toHaveBeenCalled();
  });

  it("flags a malformed case id as invalid", async () => {
    await expect(
      createRoutineAction(idle, form({ customerId: UUID, name: "Knee", caseId: "nope" })),
    ).resolves.toEqual({ status: "error", fieldErrors: {}, formError: "invalid" });
    expect(m.withPhysio).not.toHaveBeenCalled();
  });

  it("creates, revalidates and redirects to the routine", async () => {
    m.createRoutine.mockResolvedValue({ ok: true, data: { id: EX } });
    await expect(
      createRoutineAction(idle, form({ customerId: UUID, name: " Knee ", caseId: "" })),
    ).rejects.toThrow(`REDIRECT /routines/${EX}`);
    expect(m.createRoutine).toHaveBeenCalledWith({}, "physio-1", {
      customerId: UUID,
      name: "Knee",
      caseId: null,
    });
    expect(m.revalidatePath).toHaveBeenCalledWith("/routines", "layout");
    expect(m.revalidatePath).toHaveBeenCalledWith("/customers", "layout");
  });

  it("passes a case id through", async () => {
    m.createRoutine.mockResolvedValue({ ok: true, data: { id: EX } });
    await expect(
      createRoutineAction(idle, form({ customerId: UUID, name: "Knee", caseId: CASE })),
    ).rejects.toThrow("REDIRECT");
    expect(m.createRoutine).toHaveBeenCalledWith(
      {},
      "physio-1",
      expect.objectContaining({ caseId: CASE }),
    );
  });

  it("maps mutation errors without revalidating", async () => {
    m.createRoutine.mockResolvedValue({ ok: false, error: "caseNotFound" });
    await expect(
      createRoutineAction(idle, form({ customerId: UUID, name: "Knee", caseId: CASE })),
    ).resolves.toEqual({ status: "error", fieldErrors: {}, formError: "caseNotFound" });
    expect(m.revalidatePath).not.toHaveBeenCalled();
    expect(m.redirect).not.toHaveBeenCalled();
  });
});

const item = (overrides: Record<string, unknown> = {}) => ({
  exerciseId: EX,
  groupKey: null,
  sectionKey: "s1",
  holdSeconds: null,
  restSeconds: null,
  side: null,
  notes: null,
  sets: [{ reps: 10, repsMax: null, durationSeconds: null, load: null }],
  ...overrides,
});
const payload = (overrides: Record<string, unknown> = {}) => ({
  id: UUID,
  version: 3,
  name: " Knee rehab ",
  notes: "",
  caseId: "",
  sessionsPerWeek: null,
  sessionsPerDay: "",
  status: "draft",
  sections: [{ key: "s1", name: "Main" }],
  groups: [],
  items: [item()],
  ...overrides,
});

describe("saveRoutineAction", () => {
  it.each([
    ["null", null],
    ["a string", "nope"],
    ["an empty object", {}],
    ["a blank name", payload({ name: " " })],
    ["a bad id", payload({ id: "nope" })],
    ["too many items", payload({ items: Array.from({ length: 51 }, () => item()) })],
    ["too many sets", payload({ items: [item({ sets: Array.from({ length: 21 }, () => ({})) })] })],
  ])("rejects %s without touching the database", async (_label, input) => {
    await expect(saveRoutineAction(input)).resolves.toEqual({ ok: false, error: "invalid" });
    expect(m.withPhysio).not.toHaveBeenCalled();
    expect(m.saveRoutine).not.toHaveBeenCalled();
  });

  it("saves the parsed payload and revalidates", async () => {
    m.saveRoutine.mockResolvedValue({ ok: true, data: { version: 4 } });
    await expect(saveRoutineAction(payload())).resolves.toEqual({
      ok: true,
      data: { version: 4 },
    });
    expect(m.saveRoutine).toHaveBeenCalledWith(
      {},
      "physio-1",
      expect.objectContaining({
        id: UUID,
        version: 3,
        name: "Knee rehab",
        notes: null,
        caseId: null,
      }),
    );
    expect(m.revalidatePath).toHaveBeenCalledWith(`/routines/${UUID}`);
    expect(m.revalidatePath).toHaveBeenCalledWith("/routines", "layout");
    expect(m.revalidatePath).toHaveBeenCalledWith("/customers", "layout");
  });

  it.each(["conflict", "notFound", "needsItems", "blockedByPlans"])(
    "forwards %s without revalidating",
    async (error) => {
      m.saveRoutine.mockResolvedValue({ ok: false, error });
      await expect(saveRoutineAction(payload())).resolves.toEqual({ ok: false, error });
      expect(m.revalidatePath).not.toHaveBeenCalled();
    },
  );
});

describe("searchExercisesAction", () => {
  const exercise = { id: EX, name: "Squat" };

  it("lists with parsed filters, a cap of 60, and returns the exercises", async () => {
    m.listExercises.mockResolvedValue({ exercises: [exercise], truncated: false });
    await expect(
      searchExercisesAction({ q: "  squat ", category: UUID, area: "knee" }),
    ).resolves.toEqual([exercise]);
    expect(m.listExercises).toHaveBeenCalledWith(
      {},
      "physio-1",
      expect.objectContaining({ q: "squat", category: { kind: "category", id: UUID } }),
      60,
    );
  });

  it("drops an unknown area and defaults to all categories", async () => {
    m.listExercises.mockResolvedValue({ exercises: [], truncated: false });
    await searchExercisesAction({ area: "nonsense" });
    expect(m.listExercises).toHaveBeenCalledWith(
      {},
      "physio-1",
      expect.objectContaining({ area: null, category: { kind: "all" }, q: "" }),
      60,
    );
  });

  it("never lists archived exercises", async () => {
    m.listExercises.mockResolvedValue({ exercises: [], truncated: false });
    await searchExercisesAction({ category: "archived" });
    expect(m.listExercises).toHaveBeenCalledWith(
      {},
      "physio-1",
      expect.objectContaining({ category: { kind: "all" } }),
      60,
    );
  });
});
