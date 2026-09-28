import { describe, expect, it, vi } from "vitest";

import type { Tx } from "@/db/rls";

import { saveBranding, type LogoStorage } from "./mutations";

vi.mock("server-only", () => ({}));

const input = {
  clinicName: null,
  accentColor: null,
  contactEmail: null,
  contactPhone: null,
  website: null,
  showContactToPatients: true,
  removeLogo: false,
  logo: { bytes: new Uint8Array([1]), type: "png" as const },
};

function fakeTx({
  current,
  failUpdate,
  missing,
}: {
  current: string | null;
  failUpdate?: boolean;
  missing?: boolean;
}): Tx & { set: ReturnType<typeof vi.fn> } {
  const set = vi.fn();
  const selectChain = {
    from: () => selectChain,
    where: () => selectChain,
    for: async () => (missing ? [] : [{ logoPath: current }]),
  };
  const updateChain = {
    set: (values: unknown) => {
      set(values);
      return updateChain;
    },
    where: () => updateChain,
    returning: async () => {
      if (failUpdate) throw new Error("boom");
      return [{ id: "physio-1" }];
    },
  };
  return { select: () => selectChain, update: () => updateChain, set } as unknown as Tx & {
    set: ReturnType<typeof vi.fn>;
  };
}

function fakeStorage(): LogoStorage & {
  upload: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
} {
  return { upload: vi.fn(async () => {}), remove: vi.fn(async () => {}) };
}

describe("saveBranding", () => {
  it("uploads to a fresh path in the physio's folder and reports the replaced logo", async () => {
    const storage = fakeStorage();
    const tx = fakeTx({ current: "physio-1/logo-old.png" });
    const result = await saveBranding(tx, "physio-1", input, storage);
    expect(storage.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^physio-1\/logo-[0-9a-f-]{36}\.png$/),
      input.logo,
    );
    expect(tx.set).toHaveBeenCalledWith(
      expect.objectContaining({ logoPath: storage.upload.mock.calls[0][0] }),
    );
    expect(result).toMatchObject({ ok: true, data: { staleLogoPath: "physio-1/logo-old.png" } });
  });

  it("keeps the current logo when nothing changes, and reports nothing stale", async () => {
    const storage = fakeStorage();
    const tx = fakeTx({ current: "physio-1/logo-old.png" });
    const result = await saveBranding(tx, "physio-1", { ...input, logo: null }, storage);
    expect(storage.upload).not.toHaveBeenCalled();
    expect(tx.set).toHaveBeenCalledWith(
      expect.objectContaining({ logoPath: "physio-1/logo-old.png" }),
    );
    expect(result).toMatchObject({ ok: true, data: { staleLogoPath: null } });
  });

  it("clears the logo on removeLogo and reports the old one as stale", async () => {
    const storage = fakeStorage();
    const tx = fakeTx({ current: "physio-1/logo-old.png" });
    const result = await saveBranding(
      tx,
      "physio-1",
      { ...input, logo: null, removeLogo: true },
      storage,
    );
    expect(tx.set).toHaveBeenCalledWith(expect.objectContaining({ logoPath: null }));
    expect(tx.set.mock.calls[0][0]).not.toHaveProperty("removeLogo");
    expect(result).toMatchObject({ ok: true, data: { staleLogoPath: "physio-1/logo-old.png" } });
  });

  it("removes the uploaded logo when the update fails", async () => {
    const storage = fakeStorage();
    await expect(
      saveBranding(fakeTx({ current: null, failUpdate: true }), "physio-1", input, storage),
    ).rejects.toThrow("boom");
    expect(storage.remove).toHaveBeenCalledWith([storage.upload.mock.calls[0][0]]);
  });

  it("reports an upload failure without touching the row", async () => {
    const storage = fakeStorage();
    storage.upload.mockRejectedValue(new Error("storage down"));
    const tx = fakeTx({ current: null });
    await expect(saveBranding(tx, "physio-1", input, storage)).resolves.toEqual({
      ok: false,
      error: "uploadFailed",
    });
    expect(tx.set).not.toHaveBeenCalled();
  });

  it("reports notFound without uploading when the row is not visible", async () => {
    const storage = fakeStorage();
    await expect(
      saveBranding(fakeTx({ current: null, missing: true }), "other", input, storage),
    ).resolves.toEqual({ ok: false, error: "notFound" });
    expect(storage.upload).not.toHaveBeenCalled();
  });
});
