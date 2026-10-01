import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteVisitNoteAction, saveVisitNoteAction } from "./actions";

const m = vi.hoisted(() => ({
  createVisitNote: vi.fn(),
  updateVisitNote: vi.fn(),
  deleteVisitNote: vi.fn(),
  getProfile: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({
  withPhysio: (fn: (tx: unknown, physioId: string) => unknown) => fn({}, "physio-1"),
}));
vi.mock("@/server/physios/queries", () => ({ getProfile: m.getProfile }));
vi.mock("./mutations", () => m);
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));

const UUID = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";
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

describe("saveVisitNoteAction", () => {
  it("returns field errors without touching the database", async () => {
    await expect(
      saveVisitNoteAction(idle, form({ customerId: UUID, subjective: " " })),
    ).resolves.toEqual({ status: "error", fieldErrors: { soap: "soapRequired" } });
    expect(m.createVisitNote).not.toHaveBeenCalled();
    expect(m.updateVisitNote).not.toHaveBeenCalled();
  });

  it("creates a note for the customer with today's date in the physio's time zone", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-01T20:00:00Z") });
    m.createVisitNote.mockResolvedValue({ ok: true, data: { id: UUID } });
    await expect(
      saveVisitNoteAction(idle, form({ customerId: UUID, subjective: "Knee pain", pain: "4" })),
    ).resolves.toEqual({ status: "saved" });
    expect(m.createVisitNote).toHaveBeenCalledWith(
      {},
      "physio-1",
      UUID,
      expect.objectContaining({ subjective: "Knee pain", pain: 4 }),
      "2026-10-02",
    );
    expect(m.revalidatePath).toHaveBeenCalledWith("/customers", "layout");
    vi.useRealTimers();
  });

  it("updates an existing note in place", async () => {
    m.updateVisitNote.mockResolvedValue({ ok: true, data: null });
    await expect(
      saveVisitNoteAction(idle, form({ id: UUID, plan: "Add squats" })),
    ).resolves.toEqual({ status: "saved" });
    expect(m.updateVisitNote).toHaveBeenCalledWith(
      {},
      "physio-1",
      UUID,
      expect.objectContaining({ plan: "Add squats" }),
    );
    expect(m.createVisitNote).not.toHaveBeenCalled();
  });

  it("rejects malformed ids without touching the database", async () => {
    await expect(saveVisitNoteAction(idle, form({ id: "nope", plan: "x" }))).resolves.toEqual({
      status: "error",
      fieldErrors: {},
      formError: "notFound",
    });
    await expect(
      saveVisitNoteAction(idle, form({ customerId: "nope", plan: "x" })),
    ).resolves.toEqual({ status: "error", fieldErrors: {}, formError: "customerNotFound" });
    expect(m.createVisitNote).not.toHaveBeenCalled();
    expect(m.updateVisitNote).not.toHaveBeenCalled();
  });

  it("maps mutation errors to form errors and does not revalidate", async () => {
    m.updateVisitNote.mockResolvedValue({ ok: false, error: "caseNotFound" });
    await expect(saveVisitNoteAction(idle, form({ id: UUID, plan: "x" }))).resolves.toEqual({
      status: "error",
      fieldErrors: {},
      formError: "caseNotFound",
    });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("deleteVisitNoteAction", () => {
  it("deletes and revalidates", async () => {
    m.deleteVisitNote.mockResolvedValue({ ok: true, data: null });
    await expect(deleteVisitNoteAction(UUID)).resolves.toEqual({ ok: true, data: null });
    expect(m.deleteVisitNote).toHaveBeenCalledWith({}, "physio-1", UUID);
    expect(m.revalidatePath).toHaveBeenCalledWith("/customers", "layout");
  });

  it("rejects a malformed id and passes a missing note through", async () => {
    await expect(deleteVisitNoteAction("nope")).resolves.toEqual({ ok: false, error: "notFound" });
    expect(m.deleteVisitNote).not.toHaveBeenCalled();
    m.deleteVisitNote.mockResolvedValue({ ok: false, error: "notFound" });
    await expect(deleteVisitNoteAction(UUID)).resolves.toEqual({ ok: false, error: "notFound" });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });
});
