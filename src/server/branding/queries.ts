import "server-only";

import { eq } from "drizzle-orm";

import type { db } from "@/db";
import type { Tx } from "@/db/rls";
import { physios, type Physio } from "@/db/schema";
import { env } from "@/env";
import { buildBranding, logoPublicUrl, type Branding, type BrandingSource } from "@/lib/branding";

/** A physio transaction (settings) or the owner connection after link resolution (spec 10). */
export type Queryable = Tx | typeof db;

export function brandingSource(row: Physio): BrandingSource {
  return {
    displayName: row.displayName,
    clinicName: row.clinicName,
    logoUrl: row.logoPath ? logoPublicUrl(env.NEXT_PUBLIC_SUPABASE_URL, row.logoPath) : null,
    accentColor: row.accentColor,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    website: row.website,
    showContactToPatients: row.showContactToPatients,
  };
}

/**
 * Branding for patient-facing surfaces (patient page, link previews, PDFs). Contact details are
 * null when the physio hides them. `updatedAt` versions cached images (spec 11).
 */
export async function getBranding(
  q: Queryable,
  physioId: string,
): Promise<(Branding & { updatedAt: Date }) | null> {
  const [row] = await q.select().from(physios).where(eq(physios.id, physioId));
  return row ? { ...buildBranding(brandingSource(row)), updatedAt: row.updatedAt } : null;
}
