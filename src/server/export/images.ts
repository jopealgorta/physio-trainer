import { LOGO_CONTENT_TYPES, LOGO_MAX_BYTES, sniffImageType } from "@/lib/branding";
import { youtubeCoverUrl } from "@/lib/youtube";

const DEFAULT_TIMEOUT_MS = 3000;
const THUMBNAIL_TIMEOUT_MS = 2000;
const THUMBNAIL_MAX_BYTES = 512 * 1024;
const THUMBNAIL_CACHE_SIZE = 200;

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

/** Cover data URIs by video id, least recently used first. Covers never change for an id. */
const thumbnailCache = new Map<string, string>();

function remember(videoId: string, dataUri: string) {
  thumbnailCache.delete(videoId);
  if (thumbnailCache.size >= THUMBNAIL_CACHE_SIZE) {
    thumbnailCache.delete(thumbnailCache.keys().next().value!);
  }
  thumbnailCache.set(videoId, dataUri);
}

/**
 * YouTube covers (`mqdefault.jpg`) for the given video ids, fetched in parallel. Ids whose cover
 * could not be loaded are missing from the map (the PDF draws a grey box); failures are not
 * cached, so the next export retries them.
 */
export async function loadThumbnails(
  videoIds: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, string>> {
  const ids = [...new Set(videoIds)];
  const uris = await Promise.all(
    ids.map(async (videoId) => {
      const dataUri =
        thumbnailCache.get(videoId) ??
        (await fetchImageDataUri(youtubeCoverUrl(videoId), {
          maxBytes: THUMBNAIL_MAX_BYTES,
          timeoutMs: THUMBNAIL_TIMEOUT_MS,
          fetchImpl,
        }));
      if (dataUri) remember(videoId, dataUri);
      return dataUri;
    }),
  );
  const result = new Map<string, string>();
  ids.forEach((videoId, index) => {
    const dataUri = uris[index];
    if (dataUri) result.set(videoId, dataUri);
  });
  return result;
}
