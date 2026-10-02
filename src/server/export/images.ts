import { youtubeCoverUrl } from "@/lib/youtube";
import { fetchImageDataUri } from "@/server/images";

const THUMBNAIL_TIMEOUT_MS = 2000;
const THUMBNAIL_MAX_BYTES = 512 * 1024;
const THUMBNAIL_CACHE_SIZE = 200;

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
