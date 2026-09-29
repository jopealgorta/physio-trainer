"use client";

import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { MAX_TAGS, normalizeTag, normalizeTags, splitTagInput } from "@/lib/tags";

/** Free-form tag chips with suggestions; submits one hidden input per tag. */
export function TagInput({
  name = "tags",
  id,
  defaultValue,
  suggestions,
  describedBy,
}: {
  name?: string;
  id?: string;
  defaultValue: string[];
  suggestions: string[];
  describedBy?: string;
}) {
  const t = useTranslations("Library.tags");
  const listId = useId();
  const limitId = useId();
  const [tags, setTags] = useState(() => normalizeTags(defaultValue).slice(0, MAX_TAGS));
  const [draft, setDraft] = useState("");
  const [active, setActive] = useState(-1);

  const atLimit = tags.length >= MAX_TAGS;
  const prefix = normalizeTag(draft);
  const matches = prefix
    ? suggestions.filter((tag) => tag.startsWith(prefix) && !tags.includes(tag)).slice(0, 8)
    : [];
  const showList = matches.length > 0 && !atLimit;

  function commit(text: string) {
    const next = [...tags];
    for (const tag of splitTagInput(text)) if (!next.includes(tag)) next.push(tag);
    setTags(next.slice(0, MAX_TAGS));
    setDraft("");
    setActive(-1);
  }

  return (
    <div className="relative grid gap-1">
      <div className="border-input bg-input/20 dark:bg-input/30 focus-within:border-ring focus-within:ring-ring/30 flex flex-wrap items-center gap-1 rounded-md border px-2 py-1 focus-within:ring-2">
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1">
            {tag}
            <button
              type="button"
              aria-label={t("remove", { tag })}
              onClick={() => setTags(tags.filter((other) => other !== tag))}
              className="hover:text-foreground focus-visible:ring-ring/50 rounded-sm outline-none focus-visible:ring-[3px]"
            >
              <XIcon aria-hidden />
            </button>
          </Badge>
        ))}
        <input
          id={id}
          type="text"
          value={draft}
          disabled={atLimit}
          placeholder={tags.length === 0 ? t("placeholder") : undefined}
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
          aria-describedby={
            [describedBy, atLimit ? limitId : null].filter(Boolean).join(" ") || undefined
          }
          className="placeholder:text-muted-foreground min-w-24 flex-1 bg-transparent py-0.5 text-sm outline-none disabled:cursor-not-allowed"
          onChange={(event) => {
            const value = event.target.value;
            const comma = value.lastIndexOf(",");
            if (comma >= 0) {
              const rest = value.slice(comma + 1);
              const next = [...tags];
              for (const tag of splitTagInput(value.slice(0, comma))) {
                if (!next.includes(tag)) next.push(tag);
              }
              setTags(next.slice(0, MAX_TAGS));
              setDraft(rest);
            } else {
              setDraft(value);
            }
            setActive(-1);
          }}
          onBlur={() => {
            if (draft) commit(draft);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && showList) {
              event.preventDefault();
              setActive((active + 1) % matches.length);
            } else if (event.key === "ArrowUp" && showList) {
              event.preventDefault();
              setActive((active - 1 + matches.length) % matches.length);
            } else if (event.key === "Escape" && showList) {
              setDraft("");
            } else if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              commit(showList && active >= 0 ? matches[active] : draft);
            } else if (event.key === "Backspace" && draft === "" && tags.length > 0) {
              setTags(tags.slice(0, -1));
            }
          }}
        />
      </div>
      {atLimit ? (
        <p id={limitId} className="text-muted-foreground text-xs">
          {t("limit", { max: MAX_TAGS })}
        </p>
      ) : null}
      {showList ? (
        <div
          id={listId}
          role="listbox"
          aria-label={t("suggestions")}
          className="bg-popover text-popover-foreground absolute top-full z-20 mt-1 grid w-full gap-0.5 rounded-md border p-1 shadow-md"
        >
          {matches.map((tag, index) => (
            <button
              key={tag}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={index === active}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => commit(tag)}
              className="hover:bg-accent aria-selected:bg-accent rounded-sm px-2 py-1 text-left text-sm"
            >
              {tag}
            </button>
          ))}
        </div>
      ) : null}
      {tags.map((tag) => (
        <input key={tag} type="hidden" name={name} value={tag} />
      ))}
    </div>
  );
}
