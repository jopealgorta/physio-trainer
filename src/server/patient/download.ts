import "server-only";

import { env } from "@/env";
import { PATIENT_HEADERS } from "@/lib/patient-paths";
import { buildSharePath, buildShareUrl, parseSlugParam } from "@/lib/share-links";
import { buildExportDocument, type ExportKind } from "@/server/export/model";
import { renderExportPdf } from "@/server/export/pdf/render";
import { fileResponse } from "@/server/export/respond";
import { exportTranslators } from "@/server/export/translate";

import { getLinkAccess } from "./access";
import { getPatientExport } from "./export";
import { resolveLink } from "./resolve-link";

const decode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const KIND: Record<"customer" | "routine" | "weekly_plan", ExportKind> = {
  customer: "customer",
  routine: "routine",
  weekly_plan: "plan",
};

const respond = (status: number, location?: string) =>
  new Response(null, {
    status,
    headers: location ? { ...PATIENT_HEADERS, Location: location } : { ...PATIENT_HEADERS },
  });

/**
 * The patient's PDF download (spec 14), resolved from the share link alone. Mirrors the page's
 * gates: stale URL redirects to the canonical one, an unusable or PIN-locked link goes to the page
 * (which shows the Unavailable screen or the PIN gate). Does not touch the link: a download is not
 * an "opened" signal.
 */
export async function exportForPatient(
  params: { handle: string; slug: string },
  now: Date = new Date(),
): Promise<Response> {
  const parsed = parseSlugParam(params.slug);
  if (!parsed) return respond(404);
  const resolved = await resolveLink(parsed.code, now);
  if (resolved.status === "not_found") return respond(404);

  const { shell } = resolved;
  const path = buildSharePath(shell.handle, shell.slug, shell.code);
  if (
    decode(params.handle) !== shell.handle ||
    decode(params.slug) !== `${shell.slug}-${shell.code}`
  ) {
    return respond(308, `${path}/download`);
  }
  if (resolved.status === "unavailable") return respond(303, path);

  const { link } = resolved;
  const { unlocked } = await getLinkAccess(shell, link);
  if (!unlocked) return respond(303, path);

  const data = await getPatientExport(shell, link, now);
  const { t, summary } = await exportTranslators(shell.locale);
  const doc = buildExportDocument(
    {
      ...data,
      customer: { id: link.customerId, firstName: link.customerFirstName, locale: shell.locale },
      kind: KIND[link.target],
      locale: shell.locale,
      generatedOn: data.today,
      branding: shell.branding,
      shareUrl: buildShareUrl(env.NEXT_PUBLIC_APP_URL, shell.handle, shell.slug, shell.code),
    },
    summary,
  );
  const body = await renderExportPdf(doc, t);
  return fileResponse(
    body,
    "pdf",
    data.title ?? link.customerFirstName,
    data.today,
    PATIENT_HEADERS,
  );
}
