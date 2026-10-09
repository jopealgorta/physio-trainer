import { contentDisposition, EXPORT_CONTENT_TYPES, type ExportFormat } from "./model";

/**
 * `format` is required (pdf|xlsx), else null. The retired `tracking` parameter (paper tick boxes)
 * is ignored, so URLs saved before it went away keep working.
 */
export function parseExportQuery(url: URL): { format: ExportFormat } | null {
  const format = url.searchParams.get("format");
  if (format !== "pdf" && format !== "xlsx") return null;
  return { format };
}

export function fileResponse(
  body: Buffer,
  format: ExportFormat,
  name: string,
  generatedOn: string,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      ...extraHeaders,
      "Content-Type": EXPORT_CONTENT_TYPES[format],
      "Content-Disposition": contentDisposition(name, generatedOn, format),
      "Cache-Control": "private, no-store",
      "Content-Length": String(body.length),
    },
  });
}
