import { beforeEach, describe, expect, it, vi } from "vitest";

import { markCommentsSeenAction } from "./actions";

const m = vi.hoisted(() => ({ markCommentsSeen: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("@/server/auth/session", () => ({
  withPhysio: (fn: (tx: unknown, physioId: string) => unknown) => fn({}, "physio-1"),
}));
vi.mock("./mutations", () => ({ markCommentsSeen: m.markCommentsSeen }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));

const UUID = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";

beforeEach(() => vi.clearAllMocks());

describe("markCommentsSeenAction", () => {
  it("marks the customer's comments for the signed-in physio and refreshes the dashboard", async () => {
    m.markCommentsSeen.mockResolvedValue(2);
    await expect(markCommentsSeenAction(UUID)).resolves.toEqual({ ok: true });
    expect(m.markCommentsSeen).toHaveBeenCalledWith({}, "physio-1", UUID);
    expect(m.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("does not refresh anything when there was nothing new", async () => {
    m.markCommentsSeen.mockResolvedValue(0);
    await expect(markCommentsSeenAction(UUID)).resolves.toEqual({ ok: true });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("ignores a malformed customer id", async () => {
    await expect(markCommentsSeenAction("nope")).resolves.toEqual({ ok: false });
    expect(m.markCommentsSeen).not.toHaveBeenCalled();
  });
});
