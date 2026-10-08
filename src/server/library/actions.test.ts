import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createCategoryAction,
  deleteCategoryAction,
  deleteExerciseAction,
  saveExerciseAction,
  setExerciseArchivedAction,
} from "./actions";

const m = vi.hoisted(() => ({
  createExercise: vi.fn(),
  updateExercise: vi.fn(),
  setExerciseArchived: vi.fn(),
  deleteExercise: vi.fn(),
  createCategory: vi.fn(),
  renameCategory: vi.fn(),
  reorderCategories: vi.fn(),
  deleteCategory: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));

vi.mock("@/server/auth/session", () => ({
  withPhysio: (fn: (tx: unknown, physioId: string) => unknown) => fn({}, "physio-1"),
}));
vi.mock("./mutations", () => m);
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));

const UUID = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";
const idle = { status: "idle" } as const;
const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
};

beforeEach(() => vi.clearAllMocks());

describe("saveExerciseAction", () => {
  it("returns field errors without touching the database", async () => {
    await expect(saveExerciseAction(idle, form({ name: "" }))).resolves.toEqual({
      status: "error",
      fieldErrors: { name: "nameRequired" },
    });
    expect(m.createExercise).not.toHaveBeenCalled();
  });

  it("creates and redirects to the new exercise", async () => {
    m.createExercise.mockResolvedValue({ ok: true, data: { id: UUID } });
    await expect(saveExerciseAction(idle, form({ name: "Plank" }))).rejects.toThrow(
      `REDIRECT /library/${UUID}`,
    );
    expect(m.createExercise).toHaveBeenCalledWith(
      {},
      "physio-1",
      expect.objectContaining({ name: "Plank" }),
    );
    expect(m.revalidatePath).toHaveBeenCalledWith("/library", "layout");
  });

  it("updates in place", async () => {
    m.updateExercise.mockResolvedValue({ ok: true, data: { id: UUID } });
    await expect(saveExerciseAction(idle, form({ id: UUID, name: "Plank" }))).resolves.toEqual({
      status: "saved",
    });
    expect(m.updateExercise).toHaveBeenCalledWith(
      {},
      "physio-1",
      UUID,
      expect.objectContaining({ name: "Plank" }),
    );
  });

  it("maps mutation errors", async () => {
    m.updateExercise.mockResolvedValueOnce({ ok: false, error: "categoryNotFound" });
    await expect(saveExerciseAction(idle, form({ id: UUID, name: "a" }))).resolves.toEqual({
      status: "error",
      fieldErrors: { categoryIds: "categoryInvalid" },
    });
    m.updateExercise.mockResolvedValueOnce({ ok: false, error: "notFound" });
    await expect(saveExerciseAction(idle, form({ id: UUID, name: "a" }))).resolves.toEqual({
      status: "error",
      fieldErrors: {},
      formError: "notFound",
    });
  });

  it("treats a malformed id as not found", async () => {
    await expect(saveExerciseAction(idle, form({ id: "nope", name: "a" }))).resolves.toMatchObject({
      formError: "notFound",
    });
    expect(m.updateExercise).not.toHaveBeenCalled();
    expect(m.createExercise).not.toHaveBeenCalled();
  });
});

describe("exercise actions", () => {
  it.each([undefined, null, 42, "nope"])("reject a bad id (%j)", async (id) => {
    await expect(setExerciseArchivedAction(id as never, true)).resolves.toEqual({
      ok: false,
      error: "notFound",
    });
    await expect(deleteExerciseAction(id as never)).resolves.toEqual({
      ok: false,
      error: "notFound",
    });
    expect(m.setExerciseArchived).not.toHaveBeenCalled();
    expect(m.deleteExercise).not.toHaveBeenCalled();
  });

  it("archives with a strict boolean", async () => {
    m.setExerciseArchived.mockResolvedValue({ ok: true, data: null });
    await setExerciseArchivedAction(UUID, "yes" as never);
    expect(m.setExerciseArchived).toHaveBeenCalledWith({}, "physio-1", UUID, false);
  });

  it("returns inUse instead of redirecting when a routine uses the exercise", async () => {
    m.deleteExercise.mockResolvedValue({ ok: false, error: "inUse" });
    await expect(deleteExerciseAction(UUID)).resolves.toEqual({ ok: false, error: "inUse" });
  });

  it("redirects to the library after deleting", async () => {
    m.deleteExercise.mockResolvedValue({ ok: true, data: null });
    await expect(deleteExerciseAction(UUID)).rejects.toThrow("REDIRECT /library");
  });
});

describe("category actions", () => {
  it("validates input", async () => {
    await expect(createCategoryAction({ name: " ", parentId: null })).resolves.toEqual({
      ok: false,
      error: "nameRequired",
    });
    await expect(createCategoryAction("junk" as never)).resolves.toEqual({
      ok: false,
      error: "invalid",
    });
    await expect(deleteCategoryAction("nope")).resolves.toEqual({ ok: false, error: "invalid" });
    expect(m.createCategory).not.toHaveBeenCalled();
  });

  it("passes through results and revalidates on success", async () => {
    m.createCategory.mockResolvedValue({ ok: true, data: { id: UUID } });
    await expect(createCategoryAction({ name: " Glutes ", parentId: null })).resolves.toEqual({
      ok: true,
      data: { id: UUID },
    });
    expect(m.createCategory).toHaveBeenCalledWith({}, "physio-1", {
      name: "Glutes",
      parentId: null,
    });
    expect(m.revalidatePath).toHaveBeenCalledWith("/library", "layout");
  });
});
