import "server-only";

import { runAsPhysio } from "@/db/rls";
import { resolveLocale } from "@/i18n/config";
import { getSessionPhysio } from "@/server/auth/session";
import { getBranding } from "@/server/branding/queries";
import { physioToday } from "@/server/schedule/active";

import { buildExportDocument, type ExportKind } from "./model";
import { renderExportPdf } from "./pdf/render";
import { exportShareUrl, getCustomerExport, getPlanExport, getRoutineExport } from "./queries";
import { fileResponse, parseExportQuery } from "./respond";
import { exportTranslators } from "./translate";
import { renderExportXlsx } from "./xlsx";

const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number) => new Response(null, { status, headers: noStore });

/** The physio's export download for a routine, plan or customer they own. */
export async function exportForPhysio(
  kind: ExportKind,
  id: string,
  url: URL,
  now: Date = new Date(),
): Promise<Response> {
  const query = parseExportQuery(url);
  if (!query) return fail(400);
  const session = await getSessionPhysio();
  if (!session) return fail(401);

  const loaded = await runAsPhysio(session.claims, async (tx, physioId) => {
    const today = await physioToday(tx, physioId, now);
    const data =
      kind === "routine"
        ? await getRoutineExport(tx, physioId, id)
        : kind === "plan"
          ? await getPlanExport(tx, physioId, id)
          : await getCustomerExport(tx, physioId, id, today);
    if (!data) return null;
    const branding = await getBranding(tx, physioId);
    const shareUrl = await exportShareUrl(tx, physioId, data.customer.id, now);
    return { today, data, branding, shareUrl };
  });
  if (!loaded) return fail(404);
  const { today, data, branding, shareUrl } = loaded;

  const locale = resolveLocale(data.customer.locale);
  const { t, summary } = await exportTranslators(locale);
  const doc = buildExportDocument(
    {
      ...data,
      kind,
      locale,
      generatedOn: today,
      branding: {
        clinicName: branding?.clinicName ?? "",
        logoUrl: branding?.logoUrl ?? null,
        contact: branding?.contact ?? null,
      },
      shareUrl,
      tracking: query.tracking,
    },
    summary,
  );
  const body =
    query.format === "pdf"
      ? await renderExportPdf(doc, t)
      : await renderExportXlsx(doc, t, summary);
  return fileResponse(body, query.format, data.title ?? data.customer.firstName, today);
}
