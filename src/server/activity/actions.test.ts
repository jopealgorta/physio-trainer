import { beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_ITEMS } from "@/lib/routines";
import { SESSIONS_LIMIT } from "@/lib/session-logs";

import { markCommentsSeenAction } from "./actions";

const m = vi.hoisted(() => ({
  markCommentsSeen: vi.fn(),
  markExerciseCommentsSeen: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({
  withPhysio: (fn: (tx: unknown, physioId: string) => unknown) => fn({}, "physio-1"),
}));
vi.mock("./mutations", () => ({
  markCommentsSeen: m.markCommentsSeen,
  markExerciseCommentsSeen: m.markExerciseCommentsSeen,
}));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));

const UUID = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";
const LOG = "7c6a1f0e-2b3d-4e5f-8a9b-0c1d2e3f4a5b";

beforeEach(() => {
  vi.clearAllMocks();
  m.markExerciseCommentsSeen.mockResolvedValue(0);
});

describe("markCommentsSeenAction", () => {
  it("marks the customer's comments for the signed-in physio and refreshes the dashboard", async () => {
    m.markCommentsSeen.mockResolvedValue(2);
    await expect(markCommentsSeenAction(UUID, [LOG])).resolves.toEqual({ ok: true });
    expect(m.markCommentsSeen).toHaveBeenCalledWith({}, "physio-1", UUID, [LOG]);
    expect(m.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("marks exercise comments too and refreshes when only those were new", async () => {
    m.markCommentsSeen.mockResolvedValue(0);
    m.markExerciseCommentsSeen.mockResolvedValue(1);
    await expect(markCommentsSeenAction(UUID, [], [LOG])).resolves.toEqual({ ok: true });
    expect(m.markExerciseCommentsSeen).toHaveBeenCalledWith({}, "physio-1", UUID, [LOG]);
    expect(m.revalidatePath).toHaveBeenCalledWith("/dashboard");
    await expect(markCommentsSeenAction(UUID, [], ["nope"])).resolves.toEqual({ ok: false });
  });

  it("does not refresh anything when there was nothing new", async () => {
    m.markCommentsSeen.mockResolvedValue(0);
    await expect(markCommentsSeenAction(UUID, [LOG])).resolves.toEqual({ ok: true });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("ignores malformed ids", async () => {
    await expect(markCommentsSeenAction("nope", [LOG])).resolves.toEqual({ ok: false });
    await expect(markCommentsSeenAction(UUID, ["nope"])).resolves.toEqual({ ok: false });
    await expect(markCommentsSeenAction(UUID, Array(31).fill(LOG))).resolves.toEqual({ ok: false });
    expect(m.markCommentsSeen).not.toHaveBeenCalled();
  });

  it("accepts every exercise comment the feed can show and rejects more", async () => {
    const most = SESSIONS_LIMIT * MAX_ITEMS;
    m.markCommentsSeen.mockResolvedValue(0);
    const ids = Array(most).fill(LOG);
    await expect(markCommentsSeenAction(UUID, [LOG], ids)).resolves.toEqual({ ok: true });
    expect(m.markExerciseCommentsSeen).toHaveBeenCalledWith({}, "physio-1", UUID, ids);
    await expect(markCommentsSeenAction(UUID, [LOG], [...ids, LOG])).resolves.toEqual({
      ok: false,
    });
  });
});
