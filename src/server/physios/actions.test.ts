import { beforeEach, describe, expect, it, vi } from "vitest";

import { checkHandleAction } from "./actions";

const { isHandleAvailable } = vi.hoisted(() => ({ isHandleAvailable: vi.fn() }));

vi.mock("@/server/auth/session", () => ({
  withPhysio: (fn: (tx: unknown, physioId: string) => unknown) => fn({}, "physio-1"),
}));
vi.mock("./queries", () => ({ isHandleAvailable }));
vi.mock("./mutations", () => ({}));
vi.mock("@/server/i18n/locale-cookie", () => ({}));
vi.mock("next/cache", () => ({}));
vi.mock("next/navigation", () => ({}));

beforeEach(() => {
  isHandleAvailable.mockReset();
});

describe("checkHandleAction", () => {
  it("normalises the handle before asking the database", async () => {
    isHandleAvailable.mockResolvedValue(true);
    await expect(checkHandleAction("  Maria-Lopez ")).resolves.toBe(true);
    expect(isHandleAvailable).toHaveBeenCalledWith({}, "maria-lopez");
  });

  // Server actions are public endpoints: callers can send anything, not just strings.
  it.each([undefined, null, 42, { handle: "maria" }])(
    "treats a non-string argument (%j) as unavailable",
    async (input) => {
      await expect(checkHandleAction(input as never)).resolves.toBe(false);
      expect(isHandleAvailable).not.toHaveBeenCalled();
    },
  );
});
