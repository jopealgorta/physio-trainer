import { beforeEach, describe, expect, it, vi } from "vitest";

import { updateBrandingAction } from "./actions";

const { saveBranding, upload, remove, revalidatePath } = vi.hoisted(() => ({
  saveBranding: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/session", () => ({
  withPhysio: (fn: (tx: unknown, physioId: string) => unknown) => fn({}, "physio-1"),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("./mutations", () => ({ saveBranding }));
vi.mock("./storage", () => ({ supabaseLogoStorage: () => ({ upload, remove }) }));
vi.mock("./queries", () => ({
  brandingSource: (row: { logoUrl?: string }) => ({ logoUrl: row.logoUrl ?? null }),
}));
vi.mock("next/cache", () => ({ revalidatePath }));

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function formWith(fields: Record<string, string | File> = {}): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries({
    clinicName: "Kine Sur",
    accentColor: "#0f766e",
    contactEmail: "",
    contactPhone: "",
    website: "",
    showContactToPatients: "on",
    ...fields,
  })) {
    formData.set(key, value);
  }
  return formData;
}

const saved = (extra: { staleLogoPath?: string | null; logoUrl?: string } = {}) => ({
  ok: true as const,
  data: { physio: { logoUrl: extra.logoUrl }, staleLogoPath: extra.staleLogoPath ?? null },
});

beforeEach(() => {
  saveBranding.mockReset();
  upload.mockReset();
  remove.mockReset().mockResolvedValue(undefined);
  revalidatePath.mockReset();
});

describe("updateBrandingAction", () => {
  it("returns field errors without saving when the fields are invalid", async () => {
    const state = await updateBrandingAction(
      { status: "idle" },
      formWith({ accentColor: "teal", contactEmail: "nope" }),
    );
    expect(state).toEqual({
      status: "error",
      fieldErrors: { accentColor: "accentInvalid", contactEmail: "emailInvalid" },
    });
    expect(saveBranding).not.toHaveBeenCalled();
  });

  it("rejects a logo that is not really an image", async () => {
    const logo = new File(["hello"], "logo.png", { type: "image/png" });
    const state = await updateBrandingAction({ status: "idle" }, formWith({ logo }));
    expect(state).toEqual({ status: "error", fieldErrors: { logo: "logoInvalidType" } });
    expect(saveBranding).not.toHaveBeenCalled();
  });

  it("ignores the empty file a form posts when no logo was picked", async () => {
    saveBranding.mockResolvedValue(saved());
    const logo = new File([], "", { type: "application/octet-stream" });
    await updateBrandingAction({ status: "idle" }, formWith({ logo }));
    expect(saveBranding).toHaveBeenCalledWith(
      {},
      "physio-1",
      expect.objectContaining({ logo: null, clinicName: "Kine Sur", accentColor: "#0f766e" }),
      expect.anything(),
    );
  });

  it("passes a valid logo through", async () => {
    saveBranding.mockResolvedValue(saved());
    const logo = new File([new Uint8Array([...PNG_HEADER, 1])], "logo.png");
    await updateBrandingAction({ status: "idle" }, formWith({ logo }));
    expect(saveBranding.mock.calls[0][2].logo).toMatchObject({ type: "png" });
  });

  it("deletes the replaced logo after saving, revalidates and reports the new url", async () => {
    saveBranding.mockResolvedValue(
      saved({ staleLogoPath: "physio-1/logo-old.png", logoUrl: "https://x/logo-new.png" }),
    );
    const state = await updateBrandingAction({ status: "idle" }, formWith());
    expect(remove).toHaveBeenCalledWith(["physio-1/logo-old.png"]);
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
    expect(state).toEqual({ status: "saved", logoUrl: "https://x/logo-new.png" });
  });

  it("still reports saved when deleting the replaced logo fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    saveBranding.mockResolvedValue(saved({ staleLogoPath: "physio-1/logo-old.png" }));
    remove.mockRejectedValue(new Error("storage down"));
    await expect(updateBrandingAction({ status: "idle" }, formWith())).resolves.toEqual({
      status: "saved",
      logoUrl: null,
    });
  });

  it("reports an upload failure", async () => {
    saveBranding.mockResolvedValue({ ok: false, error: "uploadFailed" });
    await expect(updateBrandingAction({ status: "idle" }, formWith())).resolves.toEqual({
      status: "error",
      fieldErrors: {},
      formError: "uploadFailed",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reports notFound as an unknown error", async () => {
    saveBranding.mockResolvedValue({ ok: false, error: "notFound" });
    await expect(updateBrandingAction({ status: "idle" }, formWith())).resolves.toMatchObject({
      formError: "unknown",
    });
  });
});
