import { contentDisposition, EXPORT_CONTENT_TYPES, type ExportFormat } from "./model";

/** `format` is required (pdf|xlsx); `tracking` is "0" or "1" and defaults to on. Else null. */
export function parseExportQuery(url: URL): { format: ExportFormat; tracking: boolean } | null {
  const format = url.searchParams.get("format");
  if (format !== "pdf" && format !== "xlsx") return null;
  const tracking = url.searchParams.get("tracking");
  if (tracking !== null && tracking !== "0" && tracking !== "1") return null;
  return { format, tracking: tracking !== "0" };
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
