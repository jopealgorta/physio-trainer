import "server-only";

import { LOGO_CONTENT_TYPES, LOGO_MAX_BYTES, sniffImageType } from "@/lib/branding";

const DEFAULT_TIMEOUT_MS = 3000;

/** The body's bytes, or null as soon as it grows past `maxBytes` (a missing or lying length). */
async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * An image as a `data:` URI that renderers (react-pdf, Satori) can embed without fetching. Only
 * PNG and JPEG (sniffed from the bytes, not the declared type) up to `maxBytes`; any failure
 * (status, timeout, network, size, type) is null, so the caller draws without the image.
 */
export async function fetchImageDataUri(
  url: string,
  opts: { maxBytes?: number; timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<string | null> {
  const { maxBytes = LOGO_MAX_BYTES, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = opts;
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    // Refuse oversized files before buffering them.
    const declared = Number(response.headers.get("content-length"));
    if (declared > maxBytes) return null;
    const bytes = await readCapped(response, maxBytes);
    if (!bytes || bytes.length === 0) return null;
    const type = sniffImageType(bytes);
    if (type !== "png" && type !== "jpeg") return null;
    return `data:${LOGO_CONTENT_TYPES[type]};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return null;
  }
}
