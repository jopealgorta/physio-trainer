import "server-only";

import { eq } from "drizzle-orm";

import type { Tx } from "@/db/rls";
import { physios, type Physio } from "@/db/schema";
import { LOGO_EXTENSIONS } from "@/lib/branding";

import type { BrandingInput, ValidLogo } from "./schemas";

/** Where logos go; injected so tests can use a signed-in client or a fake. */
export type LogoStorage = {
  upload(path: string, logo: ValidLogo): Promise<void>;
  remove(paths: string[]): Promise<void>;
};

export type SaveBrandingResult =
  | { ok: true; data: { physio: Physio; staleLogoPath: string | null } }
  | { ok: false; error: "notFound" | "uploadFailed" };

/**
 * Saves branding. A new logo gets a fresh path (cache-busts public URLs) and is uploaded before
 * the row changes; if the update fails it is removed again. The replaced logo is returned as
 * `staleLogoPath` for the caller to delete *after* the transaction commits.
 */
export async function saveBranding(
  tx: Tx,
  physioId: string,
  { logo, removeLogo, ...fields }: BrandingInput & { logo: ValidLogo | null },
  storage: LogoStorage,
): Promise<SaveBrandingResult> {
  const [current] = await tx
    .select({ logoPath: physios.logoPath })
    .from(physios)
    .where(eq(physios.id, physioId))
    .for("update");
  if (!current) return { ok: false, error: "notFound" };

  let logoPath = removeLogo ? null : current.logoPath;
  if (logo) {
    logoPath = `${physioId}/logo-${crypto.randomUUID()}.${LOGO_EXTENSIONS[logo.type]}`;
    try {
      await storage.upload(logoPath, logo);
    } catch {
      return { ok: false, error: "uploadFailed" };
    }
  }

  let physio: Physio | undefined;
  try {
    [physio] = await tx
      .update(physios)
      .set({ ...fields, logoPath })
      .where(eq(physios.id, physioId))
      .returning();
  } catch (error) {
    if (logo && logoPath) await storage.remove([logoPath]).catch(() => {});
    throw error;
  }
  if (!physio) return { ok: false, error: "notFound" };

  const stale = current.logoPath && current.logoPath !== logoPath ? current.logoPath : null;
  return { ok: true, data: { physio, staleLogoPath: stale } };
}
