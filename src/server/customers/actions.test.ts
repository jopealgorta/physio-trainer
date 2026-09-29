import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  closeCaseAction,
  reopenCaseAction,
  saveCaseAction,
  saveCustomerAction,
  setCustomerArchivedAction,
} from "./actions";

const m = vi.hoisted(() => ({
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  setCustomerArchived: vi.fn(),
  createCase: vi.fn(),
  updateCase: vi.fn(),
  closeCase: vi.fn(),
  reopenCase: vi.fn(),
  getProfile: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));

vi.mock("@/server/auth/session", () => ({
  withPhysio: (fn: (tx: unknown, physioId: string) => unknown) => fn({}, "physio-1"),
}));
vi.mock("@/server/physios/queries", () => ({ getProfile: m.getProfile }));
vi.mock("./mutations", () => m);
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));

const UUID = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";
const OTHER = "9d2f3b7e-1c4a-4e58-8b6d-2a7c5e9f0b11";
const idle = { status: "idle" } as const;
const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
};

beforeEach(() => {
  vi.clearAllMocks();
  m.getProfile.mockResolvedValue({ timezone: "Pacific/Auckland" });
});
afterEach(() => vi.useRealTimers());

describe("saveCustomerAction", () => {
  it("returns field errors without touching the database", async () => {
    await expect(saveCustomerAction(idle, form({ firstName: "" }))).resolves.toEqual({
      status: "error",
      fieldErrors: { firstName: "nameRequired" },
    });
    expect(m.createCustomer).not.toHaveBeenCalled();
    expect(m.updateCustomer).not.toHaveBeenCalled();
  });

  it("creates and redirects to the new customer", async () => {
    m.createCustomer.mockResolvedValue({ ok: true, data: { id: UUID } });
    await expect(saveCustomerAction(idle, form({ firstName: "Ana" }))).rejects.toThrow(
      `REDIRECT /customers/${UUID}`,
    );
    expect(m.createCustomer).toHaveBeenCalledWith(
      {},
      "physio-1",
      expect.objectContaining({ firstName: "Ana" }),
    );
    expect(m.revalidatePath).toHaveBeenCalledWith("/customers", "layout");
  });

  it("updates in place", async () => {
    m.updateCustomer.mockResolvedValue({ ok: true, data: null });
    await expect(saveCustomerAction(idle, form({ id: UUID, firstName: "Ana" }))).resolves.toEqual({
      status: "saved",
    });
    expect(m.updateCustomer).toHaveBeenCalledWith(
      {},
      "physio-1",
      UUID,
      expect.objectContaining({ firstName: "Ana" }),
    );
    expect(m.revalidatePath).toHaveBeenCalledWith("/customers", "layout");
  });

  it("maps a missing customer to a form error", async () => {
    m.updateCustomer.mockResolvedValue({ ok: false, error: "notFound" });
    await expect(saveCustomerAction(idle, form({ id: UUID, firstName: "Ana" }))).resolves.toEqual({
      status: "error",
      fieldErrors: {},
      formError: "notFound",
    });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("treats a malformed id as not found", async () => {
    await expect(
      saveCustomerAction(idle, form({ id: "nope", firstName: "Ana" })),
    ).resolves.toMatchObject({ formError: "notFound" });
    expect(m.updateCustomer).not.toHaveBeenCalled();
    expect(m.createCustomer).not.toHaveBeenCalled();
  });
});

describe("setCustomerArchivedAction", () => {
  it.each([undefined, null, 42, "nope"])("rejects a bad id (%j)", async (id) => {
    await expect(setCustomerArchivedAction(id as never, true)).resolves.toEqual({
      ok: false,
      error: "notFound",
    });
    expect(m.setCustomerArchived).not.toHaveBeenCalled();
  });

  it("archives with a strict boolean and revalidates", async () => {
    m.setCustomerArchived.mockResolvedValue({ ok: true, data: null });
    await setCustomerArchivedAction(UUID, "yes" as never);
    expect(m.setCustomerArchived).toHaveBeenCalledWith({}, "physio-1", UUID, false);
    await expect(setCustomerArchivedAction(UUID, true)).resolves.toEqual({ ok: true, data: null });
    expect(m.setCustomerArchived).toHaveBeenLastCalledWith({}, "physio-1", UUID, true);
    expect(m.revalidatePath).toHaveBeenCalledWith("/customers", "layout");
  });

  it("does not revalidate on failure", async () => {
    m.setCustomerArchived.mockResolvedValue({ ok: false, error: "notFound" });
    await expect(setCustomerArchivedAction(UUID, true)).resolves.toEqual({
      ok: false,
      error: "notFound",
    });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("saveCaseAction", () => {
  it("returns field errors without touching the database", async () => {
    await expect(saveCaseAction(idle, form({ customerId: UUID, title: "" }))).resolves.toEqual({
      status: "error",
      fieldErrors: { title: "nameRequired" },
    });
    expect(m.createCase).not.toHaveBeenCalled();
    expect(m.updateCase).not.toHaveBeenCalled();
  });

  it("creates with today in the physio timezone, never redirects", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T20:00:00Z")); // 2026-03-02 09:00 in Auckland
    m.createCase.mockResolvedValue({ ok: true, data: { id: OTHER } });
    await expect(saveCaseAction(idle, form({ customerId: UUID, title: "Knee" }))).resolves.toEqual({
      status: "saved",
    });
    expect(m.createCase).toHaveBeenCalledWith(
      {},
      "physio-1",
      UUID,
      expect.objectContaining({ title: "Knee" }),
      "2026-03-02",
    );
    expect(m.redirect).not.toHaveBeenCalled();
    expect(m.revalidatePath).toHaveBeenCalledWith("/customers", "layout");
  });

  it("updates in place", async () => {
    m.updateCase.mockResolvedValue({ ok: true, data: null });
    await expect(saveCaseAction(idle, form({ id: UUID, title: "Knee" }))).resolves.toEqual({
      status: "saved",
    });
    expect(m.updateCase).toHaveBeenCalledWith(
      {},
      "physio-1",
      UUID,
      expect.objectContaining({ title: "Knee" }),
    );
    expect(m.revalidatePath).toHaveBeenCalledWith("/customers", "layout");
  });

  it("maps mutation errors", async () => {
    m.createCase.mockResolvedValueOnce({ ok: false, error: "customerNotFound" });
    await expect(saveCaseAction(idle, form({ customerId: UUID, title: "Knee" }))).resolves.toEqual({
      status: "error",
      fieldErrors: {},
      formError: "customerNotFound",
    });
    m.updateCase.mockResolvedValueOnce({ ok: false, error: "notFound" });
    await expect(saveCaseAction(idle, form({ id: UUID, title: "Knee" }))).resolves.toEqual({
      status: "error",
      fieldErrors: {},
      formError: "notFound",
    });
    m.updateCase.mockResolvedValueOnce({ ok: false, error: "openedAfterClosed" });
    await expect(saveCaseAction(idle, form({ id: UUID, title: "Knee" }))).resolves.toEqual({
      status: "error",
      fieldErrors: { openedOn: "openedAfterClosed" },
    });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("treats malformed or missing ids as not found", async () => {
    await expect(saveCaseAction(idle, form({ id: "nope", title: "a" }))).resolves.toMatchObject({
      formError: "notFound",
    });
    await expect(
      saveCaseAction(idle, form({ customerId: "nope", title: "a" })),
    ).resolves.toMatchObject({ formError: "customerNotFound" });
    await expect(saveCaseAction(idle, form({ title: "a" }))).resolves.toMatchObject({
      formError: "customerNotFound",
    });
    expect(m.createCase).not.toHaveBeenCalled();
    expect(m.updateCase).not.toHaveBeenCalled();
  });
});

describe("closeCaseAction", () => {
  it.each([undefined, null, 42, "nope"])("rejects a bad id (%j)", async (id) => {
    await expect(closeCaseAction(id as never, "2026-03-01")).resolves.toEqual({
      ok: false,
      error: "notFound",
    });
    expect(m.closeCase).not.toHaveBeenCalled();
  });

  it("defaults to today in the physio timezone", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T20:00:00Z"));
    m.closeCase.mockResolvedValue({ ok: true, data: null });
    await expect(closeCaseAction(UUID, null)).resolves.toEqual({ ok: true, data: null });
    expect(m.closeCase).toHaveBeenCalledWith({}, "physio-1", UUID, "2026-03-02");
    expect(m.revalidatePath).toHaveBeenCalledWith("/customers", "layout");
  });

  it("passes an explicit date through", async () => {
    m.closeCase.mockResolvedValue({ ok: true, data: null });
    await closeCaseAction(UUID, "2026-02-28");
    expect(m.closeCase).toHaveBeenCalledWith({}, "physio-1", UUID, "2026-02-28");
  });

  it("rejects an invalid date", async () => {
    await expect(closeCaseAction(UUID, "2026-02-30")).resolves.toEqual({
      ok: false,
      error: "dateInvalid",
    });
    expect(m.closeCase).not.toHaveBeenCalled();
  });

  it("bubbles mutation errors up without revalidating", async () => {
    m.closeCase.mockResolvedValue({ ok: false, error: "closedBeforeOpened" });
    await expect(closeCaseAction(UUID, "2020-01-01")).resolves.toEqual({
      ok: false,
      error: "closedBeforeOpened",
    });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("reopenCaseAction", () => {
  it("rejects a bad id", async () => {
    await expect(reopenCaseAction("nope")).resolves.toEqual({ ok: false, error: "notFound" });
    expect(m.reopenCase).not.toHaveBeenCalled();
  });

  it("reopens and revalidates", async () => {
    m.reopenCase.mockResolvedValue({ ok: true, data: null });
    await expect(reopenCaseAction(UUID)).resolves.toEqual({ ok: true, data: null });
    expect(m.reopenCase).toHaveBeenCalledWith({}, "physio-1", UUID);
    expect(m.revalidatePath).toHaveBeenCalledWith("/customers", "layout");
  });

  it("passes through errors", async () => {
    m.reopenCase.mockResolvedValue({ ok: false, error: "notClosed" });
    await expect(reopenCaseAction(UUID)).resolves.toEqual({ ok: false, error: "notClosed" });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });
});
