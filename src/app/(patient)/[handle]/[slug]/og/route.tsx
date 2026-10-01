import { parseSlugParam } from "@/lib/share-links";
import { renderLinkPreview } from "@/server/patient/og-image";

/**
 * Link-preview card (spec 11): the clinic's logo, name and accent, never patient data. A plain
 * route handler rather than the `opengraph-image` file convention: Next appends a content-less
 * hash to that URL, so the branding version could not be part of it. Resolved by code only, so a
 * stale handle or slug still works and nothing redirects.
 */
export async function GET(_request: Request, { params }: RouteContext<"/[handle]/[slug]/og">) {
  const parsed = parseSlugParam((await params).slug);
  return renderLinkPreview(parsed?.code ?? "");
}
