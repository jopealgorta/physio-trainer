/** YouTube links (spec 03): the only kind of exercise media in v1. */
export const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export type YouTubeVideo = {
  videoId: string;
  /** A /shorts/ URL: rendered portrait (9:16). */
  isShort: boolean;
  /** Canonical URL, stored in exercise_media.external_url. */
  url: string;
};

const WATCH_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const SHORT_LINK_HOSTS = new Set(["youtu.be", "www.youtu.be"]);
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Parses a pasted YouTube video or Shorts URL; null for anything else. */
export function parseYouTubeUrl(input: string): YouTubeVideo | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.port) return null;

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);
  let videoId: string | null = null;
  let isShort = false;

  if (SHORT_LINK_HOSTS.has(host)) {
    if (segments.length === 1) videoId = segments[0];
  } else if (WATCH_HOSTS.has(host)) {
    if (segments.length === 1 && segments[0] === "watch") {
      videoId = url.searchParams.get("v");
    } else if (segments.length === 2 && segments[0] === "shorts") {
      videoId = segments[1];
      isShort = true;
    }
  }

  if (!videoId || !YOUTUBE_ID_PATTERN.test(videoId)) return null;
  return {
    videoId,
    isShort,
    url: isShort
      ? `https://www.youtube.com/shorts/${videoId}`
      : `https://www.youtube.com/watch?v=${videoId}`,
  };
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/** Privacy-enhanced embed that plays inline, muted and looping (`loop` needs `playlist`). */
export function youtubeEmbedUrl(videoId: string): string {
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    loop: "1",
    playlist: videoId,
    playsinline: "1",
    rel: "0",
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params}`;
}

/** Canonical watch (or Shorts) URL for a stored video id; mirrors `parseYouTubeUrl`. */
export function youtubeWatchUrl(videoId: string, isShort: boolean): string {
  return isShort
    ? `https://www.youtube.com/shorts/${videoId}`
    : `https://www.youtube.com/watch?v=${videoId}`;
}

/** True 16:9 cover (320x180, no letterbox bars), for print and export. */
export function youtubeCoverUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}
