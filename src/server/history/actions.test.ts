import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSnapshotsAction, listVersionsAction, restoreVersionAction } from "./actions";

const m = vi.hoisted(() => ({
  listVersions: vi.fn(),
  getSnapshots: vi.fn(),
  restoreRoutineVersion: vi.fn(),
  restorePlanVersion: vi.fn(),
  withPhysio: vi.fn((fn: (tx: unknown, physioId: string) => unknown) => fn({}, "physio-1")),
  revalidatePath: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ withPhysio: m.withPhysio }));
vi.mock("./queries", () => ({ listVersions: m.listVersions, getSnapshots: m.getSnapshots }));
vi.mock("./mutations", () => ({
  restoreRoutineVersion: m.restoreRoutineVersion,
  restorePlanVersion: m.restorePlanVersion,
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `t:${key}`,
}));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));

const UUID = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";

beforeEach(() => vi.clearAllMocks());

describe("listVersionsAction", () => {
  it("rejects a malformed target without touching the database", async () => {
    for (const input of [null, { kind: "routine", id: "nope" }, { kind: "case", id: UUID }]) {
      await expect(listVersionsAction(input)).resolves.toEqual({ ok: false, error: "invalid" });
    }
    expect(m.withPhysio).not.toHaveBeenCalled();
  });

  it("returns the versions, or notFound when the target is not the physio's", async () => {
    const versions = [{ version: 2, kind: "edited", restoredFrom: null, summary: null, at: "x" }];
    m.listVersions.mockResolvedValueOnce(versions).mockResolvedValueOnce(null);
    await expect(listVersionsAction({ kind: "plan", id: UUID })).resolves.toEqual({
      ok: true,
      data: versions,
    });
    expect(m.listVersions).toHaveBeenCalledWith({}, "physio-1", { kind: "plan", id: UUID });
    await expect(listVersionsAction({ kind: "plan", id: UUID })).resolves.toEqual({
      ok: false,
      error: "notFound",
    });
  });
});

describe("getSnapshotsAction", () => {
  it("rejects zero, three or non-positive versions", async () => {
    for (const versions of [[], [1, 2, 3], [0]]) {
      await expect(getSnapshotsAction({ kind: "routine", id: UUID, versions })).resolves.toEqual({
        ok: false,
        error: "invalid",
      });
    }
    expect(m.withPhysio).not.toHaveBeenCalled();
  });

  it("returns the snapshots, or notFound when one is missing", async () => {
    m.getSnapshots.mockResolvedValueOnce({ 1: { schema: 1 }, 3: { schema: 1 } });
    await expect(
      getSnapshotsAction({ kind: "routine", id: UUID, versions: [1, 3] }),
    ).resolves.toEqual({ ok: true, data: { 1: { schema: 1 }, 3: { schema: 1 } } });
    expect(m.getSnapshots).toHaveBeenCalledWith(
      {},
      "physio-1",
      { kind: "routine", id: UUID },
      [1, 3],
    );

    m.getSnapshots.mockResolvedValueOnce({ 1: { schema: 1 } });
    await expect(
      getSnapshotsAction({ kind: "routine", id: UUID, versions: [1, 3] }),
    ).resolves.toEqual({ ok: false, error: "notFound" });
  });
});

describe("restoreVersionAction", () => {
  it("rejects invalid input without touching the database", async () => {
    for (const input of [
      { kind: "routine", id: UUID },
      { kind: "routine", id: "nope", version: 1 },
      { kind: "routine", id: UUID, version: 0 },
    ]) {
      await expect(restoreVersionAction(input)).resolves.toEqual({ ok: false, error: "invalid" });
    }
    expect(m.withPhysio).not.toHaveBeenCalled();
  });

  it("restores a routine and revalidates its pages", async () => {
    m.restoreRoutineVersion.mockResolvedValue({ ok: true, data: { version: 5, dropped: 0 } });
    await expect(restoreVersionAction({ kind: "routine", id: UUID, version: 2 })).resolves.toEqual({
      ok: true,
      data: { version: 5, dropped: 0 },
    });
    expect(m.restoreRoutineVersion).toHaveBeenCalledWith(
      {},
      "physio-1",
      { id: UUID, version: 2 },
      "t:defaultName",
    );
    expect(m.restorePlanVersion).not.toHaveBeenCalled();
    expect(m.revalidatePath).toHaveBeenCalledWith(`/routines/${UUID}`);
    expect(m.revalidatePath).toHaveBeenCalledWith("/routines", "layout");
    expect(m.revalidatePath).toHaveBeenCalledWith("/plans", "layout");
    expect(m.revalidatePath).toHaveBeenCalledWith("/customers", "layout");
  });

  it("restores a plan and revalidates its pages", async () => {
    m.restorePlanVersion.mockResolvedValue({ ok: true, data: { version: 8, dropped: 1 } });
    await expect(restoreVersionAction({ kind: "plan", id: UUID, version: 3 })).resolves.toEqual({
      ok: true,
      data: { version: 8, dropped: 1 },
    });
    expect(m.restorePlanVersion).toHaveBeenCalledWith({}, "physio-1", { id: UUID, version: 3 });
    expect(m.revalidatePath).toHaveBeenCalledWith(`/plans/${UUID}`);
    expect(m.revalidatePath).toHaveBeenCalledWith("/plans", "layout");
  });

  it("does not revalidate after a failure", async () => {
    m.restoreRoutineVersion.mockResolvedValue({ ok: false, error: "needsItems" });
    await expect(restoreVersionAction({ kind: "routine", id: UUID, version: 1 })).resolves.toEqual({
      ok: false,
      error: "needsItems",
    });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });
});
