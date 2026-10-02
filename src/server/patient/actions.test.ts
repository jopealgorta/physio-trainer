import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ resolveLink: vi.fn(), getLinkAccess: vi.fn(), logSession: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock("@/env", () => ({ env: { SUPABASE_SECRET_KEY: "secret" } }));
vi.mock("@/server/sharing/pin-hash", () => ({ verifyPin: vi.fn() }));
vi.mock("./resolve-link", () => ({ resolveLink: m.resolveLink }));
vi.mock("./access", () => ({ getLinkAccess: m.getLinkAccess }));
vi.mock("./log-session", () => ({ logSession: m.logSession }));

import { logSessionAction } from "./actions";

const ID = "3e473832-bc4d-475b-9a6a-0356874dc603";
const input = {
  routineId: ID,
  entryId: null,
  performedOn: "2026-10-07",
  completed: true,
  pain: 4,
  comment: "  ok ",
};
const ok = { status: "ok", shell: { physioId: "p", timeZone: "UTC" }, link: { id: "l" } };

beforeEach(() => {
  m.resolveLink.mockReset().mockResolvedValue(ok);
  m.getLinkAccess.mockReset().mockResolvedValue({ owner: false, unlocked: true });
  m.logSession.mockReset().mockResolvedValue({ ok: true, data: {} });
});

describe("logSessionAction", () => {
  it("rejects malformed input before touching the database", async () => {
    expect(await logSessionAction("7k2m9qpx", { ...input, pain: 11 })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await logSessionAction("7k2m9qpx", "nope")).toEqual({ ok: false, error: "invalid" });
    expect(m.resolveLink).not.toHaveBeenCalled();
  });

  it("refuses links that are not usable, and PIN-locked ones without the PIN", async () => {
    m.resolveLink.mockResolvedValue({ status: "unavailable", reason: "revoked", shell: {} });
    expect(await logSessionAction("7k2m9qpx", input)).toEqual({
      ok: false,
      error: "unavailable",
    });
    m.resolveLink.mockResolvedValue({ status: "not_found" });
    expect((await logSessionAction("7k2m9qpx", input)).ok).toBe(false);

    m.resolveLink.mockResolvedValue(ok);
    m.getLinkAccess.mockResolvedValue({ owner: false, unlocked: false });
    expect(await logSessionAction("7k2m9qpx", input)).toEqual({
      ok: false,
      error: "unavailable",
    });
    expect(m.logSession).not.toHaveBeenCalled();
  });

  it("never writes for the signed-in physio previewing the link", async () => {
    m.getLinkAccess.mockResolvedValue({ owner: true, unlocked: true });
    expect(await logSessionAction("7k2m9qpx", input)).toEqual({ ok: false, error: "preview" });
    expect(m.logSession).not.toHaveBeenCalled();
  });

  it("logs through the resolved link with the cleaned input", async () => {
    expect(await logSessionAction("7k2m9qpx", input)).toEqual({ ok: true, data: {} });
    expect(m.resolveLink).toHaveBeenCalledWith("7k2m9qpx");
    const [shell, link, parsed] = m.logSession.mock.calls[0]!;
    expect(shell).toBe(ok.shell);
    expect(link).toBe(ok.link);
    expect(parsed).toMatchObject({ routineId: ID, pain: 4, comment: "ok" });
  });

  it("passes on the log's own failures", async () => {
    m.logSession.mockResolvedValue({ ok: false, error: "unreachable" });
    expect(await logSessionAction("7k2m9qpx", input)).toEqual({
      ok: false,
      error: "unreachable",
    });
  });
});
