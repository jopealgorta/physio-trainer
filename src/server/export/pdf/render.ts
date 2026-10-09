import { renderToBuffer } from "@react-pdf/renderer";

import { LOGO_MAX_BYTES } from "@/lib/branding";
import { fetchImageDataUri } from "@/server/images";

import type { ExportDocument } from "../model";
import type { ExportTranslate } from "../translate";
import { ExportPdf } from "./document";
import { registerFonts } from "./fonts";

export type PdfDeps = { fetchImpl?: typeof fetch };

/**
 * The branded A4 PDF. The clinic logo, its only image, is fetched up front and embedded as a data
 * URI; when that fails it is left out, so the PDF always renders.
 */
export async function renderExportPdf(
  doc: ExportDocument,
  t: ExportTranslate,
  deps: PdfDeps = {},
): Promise<Buffer> {
  registerFonts();
  const { fetchImpl } = deps;
  const logo = doc.branding.logoUrl
    ? await fetchImageDataUri(doc.branding.logoUrl, { maxBytes: LOGO_MAX_BYTES, fetchImpl })
    : null;
  // Called directly (no hooks) so renderToBuffer gets the <Document> element it expects.
  return renderToBuffer(ExportPdf({ doc, t, logo }));
}
