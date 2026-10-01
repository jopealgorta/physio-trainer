import { NextResponse } from "next/server";

import { PATIENT_HEADERS } from "@/lib/patient-paths";
import { buildPatientManifest } from "@/lib/pwa";
import { buildSharePath, parseSlugParam } from "@/lib/share-links";
import { loadLink } from "@/server/patient/load";

/**
 * Per-link web manifest (spec 10), so "Add to home screen" on a patient's phone opens this link.
 * It holds only the clinic name and accent: no customer data and no PIN gate needed. Unknown and
 * unusable links 404, so an installed-then-revoked link cannot be (re)installed.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/[handle]/[slug]/manifest.webmanifest">,
) {
  const { slug } = await params;
  const parsed = parseSlugParam(slug);
  const resolved = parsed ? await loadLink(parsed.code) : null;
  if (!resolved || resolved.status !== "ok") {
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const { shell } = resolved;
  const manifest = buildPatientManifest({
    locale: shell.locale,
    clinicName: shell.branding.clinicName,
    handle: shell.handle,
    path: buildSharePath(shell.handle, shell.slug, shell.code),
    themeColor: shell.branding.tokens?.light.primary ?? null,
  });
  return NextResponse.json(manifest, {
    // The proxy skips *.webmanifest, so the privacy headers are applied here.
    headers: { ...PATIENT_HEADERS, "Content-Type": "application/manifest+json" },
  });
}
