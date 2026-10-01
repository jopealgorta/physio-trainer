import { beforeEach, describe, expect, it, vi } from "vitest";

import { copyIntoNextPhaseAction, setPhaseAction } from "./actions";

const m = vi.hoisted(() => ({
  setPhase: vi.fn(),
  copyIntoNextPhase: vi.fn(),
  withPhysio: vi.fn((fn: (tx: unknown, physioId: string) => unknown) => fn({}, "physio-1")),
  revalidatePath: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ withPhysio: m.withPhysio }));
vi.mock("./mutations", () => ({ setPhase: m.setPhase, copyIntoNextPhase: m.copyIntoNextPhase }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));

const ID = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";
const NEW_ID = "1b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a11";

beforeEach(() => vi.clearAllMocks());

describe("setPhaseAction", () => {
  const input = {
    kind: "routine",
    id: ID,
    phaseLabel: "Phase 1",
    startsOn: "2026-10-01",
    endsOn: "",
  };

  it("runs the mutation with parsed input and revalidates", async () => {
    m.setPhase.mockResolvedValue({ ok: true, data: {} });
    await expect(setPhaseAction(input)).resolves.toEqual({ ok: true, data: {} });
    expect(m.setPhase).toHaveBeenCalledWith({}, "physio-1", {
      kind: "routine",
      id: ID,
      phaseLabel: "Phase 1",
      startsOn: "2026-10-01",
      endsOn: null,
    });
    expect(m.revalidatePath).toHaveBeenCalledWith(`/routines/${ID}`);
  });

  it("revalidates plan pages for plans", async () => {
    m.setPhase.mockResolvedValue({ ok: true, data: {} });
    await setPhaseAction({ ...input, kind: "plan" });
    expect(m.revalidatePath).toHaveBeenCalledWith(`/plans/${ID}`);
  });

  it("passes a mutation failure through without revalidating", async () => {
    m.setPhase.mockResolvedValue({ ok: false, error: "notStandalone" });
    await expect(setPhaseAction(input)).resolves.toEqual({ ok: false, error: "notStandalone" });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("names window and label problems, and reports anything else as invalid", async () => {
    await expect(
      setPhaseAction({ ...input, startsOn: "2026-10-02", endsOn: "2026-10-01" }),
    ).resolves.toEqual({ ok: false, error: "endBeforeStart" });
    await expect(setPhaseAction({ ...input, phaseLabel: "x".repeat(41) })).resolves.toEqual({
      ok: false,
      error: "labelTooLong",
    });
    await expect(setPhaseAction({ ...input, id: "nope" })).resolves.toEqual({
      ok: false,
      error: "invalid",
    });
    await expect(setPhaseAction(null)).resolves.toEqual({ ok: false, error: "invalid" });
    expect(m.withPhysio).not.toHaveBeenCalled();
  });
});

describe("copyIntoNextPhaseAction", () => {
  const input = {
    kind: "plan",
    id: ID,
    phaseLabel: "Phase 2",
    startsOn: "2026-10-08",
    endsOn: null,
    endCurrent: true,
  };

  it("returns the new id and revalidates both the source and the copy", async () => {
    m.copyIntoNextPhase.mockResolvedValue({ ok: true, data: { id: NEW_ID } });
    await expect(copyIntoNextPhaseAction(input)).resolves.toEqual({
      ok: true,
      data: { id: NEW_ID },
    });
    expect(m.revalidatePath).toHaveBeenCalledWith(`/plans/${ID}`);
    expect(m.revalidatePath).toHaveBeenCalledWith(`/plans/${NEW_ID}`);
  });

  it("passes failures through", async () => {
    m.copyIntoNextPhase.mockResolvedValue({ ok: false, error: "startBeforePredecessor" });
    await expect(copyIntoNextPhaseAction(input)).resolves.toEqual({
      ok: false,
      error: "startBeforePredecessor",
    });
  });

  it("rejects a missing start date before touching the database", async () => {
    await expect(copyIntoNextPhaseAction({ ...input, startsOn: "" })).resolves.toEqual({
      ok: false,
      error: "startsInvalid",
    });
    expect(m.withPhysio).not.toHaveBeenCalled();
  });
});
