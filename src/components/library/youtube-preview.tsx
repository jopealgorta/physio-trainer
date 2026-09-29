"use client";

import { PlayIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { youtubeEmbedUrl } from "@/lib/youtube";

import { YouTubeThumbnail } from "./youtube-thumbnail";

/** Click-to-load YouTube player: no third-party iframe until the physio asks for it. */
export function YouTubePreview({
  videoId,
  isShort,
  title,
  className,
  autoPlay = false,
}: {
  videoId: string;
  isShort: boolean;
  title: string;
  className?: string;
  /** Load the embed immediately (the caller already asked to preview). */
  autoPlay?: boolean;
}) {
  const t = useTranslations("Library.media");
  const [playing, setPlaying] = useState(autoPlay);
  return (
    <div
      className={cn(
        "bg-muted relative overflow-hidden rounded-lg",
        isShort ? "aspect-[9/16] w-full max-w-60" : "aspect-video w-full",
        className,
      )}
    >
      {playing ? (
        <iframe
          src={youtubeEmbedUrl(videoId)}
          title={t("embedTitle", { title })}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="size-full border-0"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={t("play", { title })}
          className="group focus-visible:ring-ring/50 size-full outline-none focus-visible:ring-[3px]"
        >
          <YouTubeThumbnail videoId={videoId} />
          <span className="bg-background/80 text-foreground group-hover:bg-primary group-hover:text-primary-foreground absolute inset-0 m-auto flex size-12 items-center justify-center rounded-full shadow-sm transition-colors">
            <PlayIcon aria-hidden className="size-5" />
          </span>
        </button>
      )}
    </div>
  );
}
