"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { withPhysio } from "@/server/auth/session";

import { saveBranding } from "./mutations";
import { brandingSource } from "./queries";
import {
  brandingFieldErrors,
  brandingSchema,
  checkLogo,
  type BrandingFieldErrors,
  type BrandingFormState,
  type ValidLogo,
} from "./schemas";
import { supabaseLogoStorage } from "./storage";

export async function updateBrandingAction(
  _state: BrandingFormState,
  formData: FormData,
): Promise<BrandingFormState> {
  const parsed = brandingSchema.safeParse(Object.fromEntries(formData));
  const fieldErrors: BrandingFieldErrors = parsed.success ? {} : brandingFieldErrors(parsed.error);

  let logo: ValidLogo | null = null;
  const file = formData.get("logo");
  if (file instanceof File && file.size > 0) {
    const checked = await checkLogo(file);
    if (checked.ok) logo = checked.logo;
    else fieldErrors.logo = checked.error;
  }
  if (!parsed.success || fieldErrors.logo) return { status: "error", fieldErrors };

  const storage = supabaseLogoStorage(await createClient());
  const result = await withPhysio((tx, physioId) =>
    saveBranding(tx, physioId, { ...parsed.data, logo }, storage),
  );
  if (!result.ok) {
    return {
      status: "error",
      fieldErrors: {},
      formError: result.error === "uploadFailed" ? "uploadFailed" : "unknown",
    };
  }
  // After commit: a failure here only leaves an orphaned file, never a broken logo.
  if (result.data.staleLogoPath) {
    await storage.remove([result.data.staleLogoPath]).catch((error) => {
      console.error("Failed to delete replaced logo", error);
    });
  }
  revalidatePath("/settings");
  return { status: "saved", logoUrl: brandingSource(result.data.physio).logoUrl };
}
