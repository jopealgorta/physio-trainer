import { cn } from "@/lib/utils";
import { youtubeThumbnailUrl } from "@/lib/youtube";

/** Decorative YouTube thumbnail (the surrounding control carries the accessible name). */
export function YouTubeThumbnail({ videoId, className }: { videoId: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- third-party thumbnail; no optimisation needed
    <img
      src={youtubeThumbnailUrl(videoId)}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={cn("bg-muted size-full object-cover", className)}
    />
  );
}
