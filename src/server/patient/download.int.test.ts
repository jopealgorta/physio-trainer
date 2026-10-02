import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { runAsPhysio } from "@/db/rls";
import { physios } from "@/db/schema";
import { buildSharePath } from "@/lib/share-links";
import { insertCustomer } from "@/test/int/content";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";
import { ensureShareLink, revokeShareLink } from "@/server/sharing/mutations";

import { getLinkAccess } from "./access";
import { exportForPatient } from "./download";
import { resolveLink } from "./resolve-link";

vi.mock("@/server/patient/access", () => ({ getLinkAccess: vi.fn() }));

const NOW = new Date("2026-10-07T10:00:00Z");

describe("patient PDF download", () => {
  let physio: TestPhysio;

  const as = <T>(fn: Parameters<typeof runAsPhysio<T>>[1]) => runAsPhysio(physio.claims, fn);
  const makeLink = async () => {
    const customerId = await insertCustomer(physio.id, { firstName: "Ana", locale: "en" });
    const result = await as((tx, id) =>
      ensureShareLink(tx, id, { target: "customer", customerId }),
    );
    if (!result.ok) throw new Error(result.error);
    const resolved = await resolveLink(result.data.link.code, NOW);
    if (resolved.status !== "ok") throw new Error("not ok");
    return { id: result.data.link.id, shell: resolved.shell };
  };
  const paramsOf = (shell: { handle: string; slug: string; code: string }) => ({
    handle: shell.handle,
    slug: `${shell.slug}-${shell.code}`,
  });
  const pagePath = (shell: { handle: string; slug: string; code: string }) =>
    buildSharePath(shell.handle, shell.slug, shell.code);

  beforeAll(async () => {
    physio = await createTestPhysio({ onboarded: true });
    await db.update(physios).set({ clinicName: "Maria Physio" }).where(eq(physios.id, physio.id));
  });
  afterAll(() => deleteTestPhysios(physio));
  beforeEach(() => {
    vi.mocked(getLinkAccess).mockResolvedValue({ owner: false, unlocked: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
  });
  // The cleanup in afterAll deletes the auth user over global fetch: it must not hit the stub.
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serves the PDF with the patient privacy headers", async () => {
    const { shell } = await makeLink();
    const res = await exportForPatient(paramsOf(shell), NOW);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("redirects a stale slug to the canonical download URL", async () => {
    const { shell } = await makeLink();
    const res = await exportForPatient(
      { handle: shell.handle, slug: `old-name-${shell.code}` },
      NOW,
    );
    expect(res.status).toBe(308);
    expect(res.headers.get("Location")).toBe(`${pagePath(shell)}/download`);
  });

  it("sends a revoked link to the page, which shows the unavailable screen", async () => {
    const { shell, id } = await makeLink();
    await as((tx, physioId) => revokeShareLink(tx, physioId, id));
    const res = await exportForPatient(paramsOf(shell), NOW);
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe(pagePath(shell));
  });

  it("sends a locked link to the page, which shows the PIN gate", async () => {
    const { shell } = await makeLink();
    vi.mocked(getLinkAccess).mockResolvedValue({ owner: false, unlocked: false });
    const res = await exportForPatient(paramsOf(shell), NOW);
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe(pagePath(shell));
  });

  it("404s an unknown code and a bad slug", async () => {
    const { shell } = await makeLink();
    expect((await exportForPatient({ handle: shell.handle, slug: "x-abcdefgh" }, NOW)).status).toBe(
      404,
    );
    expect((await exportForPatient({ handle: shell.handle, slug: "nocode" }, NOW)).status).toBe(
      404,
    );
  });
});
