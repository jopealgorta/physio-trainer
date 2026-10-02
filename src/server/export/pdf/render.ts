import { renderToBuffer } from "@react-pdf/renderer";

import { LOGO_MAX_BYTES } from "@/lib/branding";

import { fetchImageDataUri, loadThumbnails } from "../images";
import type { ExportDocument } from "../model";
import type { ExportTranslate } from "../translate";
import { ExportPdf } from "./document";
import { registerFonts } from "./fonts";

export type PdfDeps = { fetchImpl?: typeof fetch };

function videoIds(doc: ExportDocument): string[] {
  const ids = new Set<string>();
  for (const routine of doc.routines) {
    for (const block of routine.blocks) {
      const items = block.kind === "single" ? [block.item] : block.items;
      for (const item of items) if (item.videoId) ids.add(item.videoId);
    }
  }
  return [...ids];
}

/**
 * The branded A4 PDF. Images (YouTube covers, the clinic logo) are fetched up front and embedded
 * as data URIs; any that fail are simply left out, so the PDF always renders.
 */
export async function renderExportPdf(
  doc: ExportDocument,
  t: ExportTranslate,
  deps: PdfDeps = {},
): Promise<Buffer> {
  registerFonts();
  const { fetchImpl } = deps;
  const [thumbnails, logo] = await Promise.all([
    loadThumbnails(videoIds(doc), fetchImpl),
    doc.branding.logoUrl
      ? fetchImageDataUri(doc.branding.logoUrl, { maxBytes: LOGO_MAX_BYTES, fetchImpl })
      : Promise.resolve(null),
  ]);
  // Called directly (no hooks) so renderToBuffer gets the <Document> element it expects.
  return renderToBuffer(ExportPdf({ doc, t, thumbnails, logo }));
}
