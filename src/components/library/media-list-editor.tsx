"use client";

import { GripVerticalIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { SortableList } from "@/components/sortable/sortable-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_MEDIA } from "@/server/library/schemas";
import { cn } from "@/lib/utils";
import { parseYouTubeUrl } from "@/lib/youtube";

import { YouTubePreview } from "./youtube-preview";
import { YouTubeThumbnail } from "./youtube-thumbnail";

type Item = { key: string; url: string; videoId: string; isShort: boolean };
type MediaError = "notYouTube" | "duplicate" | "limit";

function initialItems(urls: string[]): Item[] {
  const items: Item[] = [];
  for (const raw of urls) {
    const video = parseYouTubeUrl(raw);
    if (video && !items.some((item) => item.videoId === video.videoId)) {
      items.push({ key: crypto.randomUUID(), ...video });
    }
  }
  return items.slice(0, MAX_MEDIA);
}

/** Ordered YouTube links for an exercise; submits canonical URLs as repeated hidden inputs. */
export function MediaListEditor({
  name = "media",
  defaultValue,
  title,
}: {
  name?: string;
  defaultValue: string[];
  title: string;
}) {
  const t = useTranslations("Library.media");
  const id = useId();
  const [items, setItems] = useState(() => initialItems(defaultValue));
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<MediaError | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  const atLimit = items.length >= MAX_MEDIA;
  const shownError: MediaError | null = atLimit ? "limit" : error;

  function add() {
    if (atLimit) return;
    const video = parseYouTubeUrl(draft);
    if (!video) return setError("notYouTube");
    if (items.some((item) => item.videoId === video.videoId)) return setError("duplicate");
    setItems([...items, { key: crypto.randomUUID(), ...video }]);
    setDraft("");
    setError(null);
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor={`${id}-input`}>{t("label")}</Label>
        <div className="flex gap-2">
          <Input
            id={`${id}-input`}
            value={draft}
            disabled={atLimit}
            inputMode="url"
            placeholder={t("placeholder")}
            aria-invalid={shownError !== null}
            aria-describedby={`${id}-hint${shownError ? ` ${id}-error` : ""}`}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
          />
          <Button type="button" variant="outline" disabled={atLimit} onClick={add}>
            {t("add")}
          </Button>
        </div>
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {t("hint")}
        </p>
        {shownError ? (
          <p id={`${id}-error`} role="alert" className="text-destructive text-sm">
            {t(`errors.${shownError}`, { max: MAX_MEDIA })}
          </p>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <SortableList
          items={items}
          onReorder={setItems}
          label={(item) => t("itemLabel", { position: items.indexOf(item) + 1 })}
          className="grid gap-2"
          renderItem={(item, handle) => {
            const position = items.indexOf(item) + 1;
            return (
              <div className="bg-card grid gap-2 rounded-lg border p-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    {...handle}
                    className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 cursor-grab touch-none rounded-md p-1 outline-none focus-visible:ring-[3px]"
                  >
                    <GripVerticalIcon aria-hidden className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewKey(previewKey === item.key ? null : item.key)}
                    aria-label={t("play", { title })}
                    aria-expanded={previewKey === item.key}
                    className={cn(
                      "focus-visible:ring-ring/50 w-24 shrink-0 overflow-hidden rounded-md outline-none focus-visible:ring-[3px]",
                      item.isShort ? "aspect-[9/16] w-12" : "aspect-video",
                    )}
                  >
                    <YouTubeThumbnail videoId={item.videoId} />
                  </button>
                  {position === 1 ? <Badge variant="secondary">{t("cover")}</Badge> : null}
                  <span className="text-muted-foreground min-w-0 flex-1 truncate text-sm">
                    {item.url}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("remove", { position })}
                    onClick={() => setItems(items.filter((other) => other.key !== item.key))}
                  >
                    <XIcon aria-hidden />
                  </Button>
                </div>
                {previewKey === item.key ? (
                  <YouTubePreview videoId={item.videoId} isShort={item.isShort} title={title} />
                ) : null}
              </div>
            );
          }}
        />
      )}

      {items.map((item) => (
        <input key={item.key} type="hidden" name={name} value={item.url} />
      ))}
    </div>
  );
}
