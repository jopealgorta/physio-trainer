"use client";

import { LayoutGridIcon, ListIcon, SearchIcon, SlidersHorizontalIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { selectClassName } from "@/components/prescription/prescription-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { BODY_AREAS, bodyAreaSchema } from "@/lib/body-areas";
import { libraryHref, SEARCH_MAX_LENGTH, type LibraryFilters } from "@/lib/library-params";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 300;

function FilterSelects({
  filters,
  tags,
  idPrefix,
  onChange,
}: {
  filters: LibraryFilters;
  tags: string[];
  idPrefix: string;
  onChange: (changes: Partial<LibraryFilters>) => void;
}) {
  const t = useTranslations("Library.filters");
  const tAreas = useTranslations("BodyAreas.areas");
  // A tag from the URL that no exercise has (or that was just removed) stays selectable.
  const tagOptions = filters.tag && !tags.includes(filters.tag) ? [filters.tag, ...tags] : tags;
  return (
    <>
      <div className="grid gap-1 md:w-44">
        <label htmlFor={`${idPrefix}-area`} className="text-muted-foreground text-xs">
          {t("area")}
        </label>
        <select
          id={`${idPrefix}-area`}
          className={selectClassName}
          value={filters.area ?? ""}
          onChange={(event) => {
            const area = bodyAreaSchema.safeParse(event.target.value);
            onChange({ area: area.success ? area.data : null });
          }}
        >
          <option value="">{t("allAreas")}</option>
          {BODY_AREAS.map((area) => (
            <option key={area} value={area}>
              {tAreas(area)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1 md:w-44">
        <label htmlFor={`${idPrefix}-tag`} className="text-muted-foreground text-xs">
          {t("tag")}
        </label>
        <select
          id={`${idPrefix}-tag`}
          className={selectClassName}
          value={filters.tag ?? ""}
          onChange={(event) => onChange({ tag: event.target.value || null })}
        >
          <option value="">{t("allTags")}</option>
          {tagOptions.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

export function LibraryToolbar({
  filters,
  tags,
  children,
}: {
  filters: LibraryFilters;
  tags: string[];
  /** The category tree, shown inside the mobile filters sheet. */
  children: ReactNode;
}) {
  const t = useTranslations("Library.filters");
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const latest = useRef(filters);
  useEffect(() => {
    latest.current = filters;
  });

  const cancelTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  // Reads the newest filters (not the render that scheduled us) and folds in a pending search.
  const navigate = (changes: Partial<LibraryFilters>, flushSearch = false) => {
    const pending = (flushSearch || timer.current !== null) && searchRef.current;
    const q = pending ? searchRef.current!.value.trim() : latest.current.q;
    cancelTimer();
    router.replace(libraryHref({ ...latest.current, q }, changes), { scroll: false });
  };
  useEffect(() => cancelTimer, []);
  // Keep the box in step when the URL changes elsewhere (e.g. "Clear filters"), but never
  // while the user is typing in it: a stale URL update must not eat newer keystrokes.
  useEffect(() => {
    const input = searchRef.current;
    if (!input || document.activeElement === input || input.value.trim() === filters.q) return;
    input.value = filters.q;
  }, [filters.q]);

  const onSearchChange = () => {
    cancelTimer();
    timer.current = setTimeout(() => navigate({}, true), SEARCH_DEBOUNCE_MS);
  };

  const viewLink = (view: LibraryFilters["view"], label: string, icon: ReactNode) => {
    const active = filters.view === view;
    return (
      <Link
        href={libraryHref(filters, { view })}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        title={label}
        replace
        scroll={false}
        className={cn(
          "focus-visible:ring-ring/30 flex size-7 items-center justify-center rounded-sm outline-none focus-visible:ring-2",
          active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50",
        )}
      >
        {icon}
      </Link>
    );
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="relative min-w-0 flex-1 basis-56">
        <SearchIcon
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2"
        />
        <Input
          ref={searchRef}
          type="search"
          aria-label={t("search")}
          placeholder={t("searchPlaceholder")}
          defaultValue={filters.q}
          maxLength={SEARCH_MAX_LENGTH}
          className="pl-7"
          onChange={(event) => onSearchChange()}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            navigate({}, true);
          }}
        />
      </div>
      <div className="hidden items-end gap-3 md:flex">
        <FilterSelects
          filters={filters}
          tags={tags}
          idPrefix="desktop"
          onChange={(changes) => navigate(changes)}
        />
      </div>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <Button type="button" variant="outline" className="md:hidden">
            <SlidersHorizontalIcon aria-hidden />
            {t("open")}
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t("open")}</SheetTitle>
            <SheetDescription>{t("sheetDescription")}</SheetDescription>
          </SheetHeader>
          <div
            className="grid gap-4 px-6 pb-6"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a")) setSheetOpen(false);
            }}
          >
            <FilterSelects
              filters={filters}
              tags={tags}
              idPrefix="mobile"
              onChange={(changes) => navigate(changes)}
            />
            {children}
          </div>
        </SheetContent>
      </Sheet>
      <div role="group" aria-label={t("view")} className="flex gap-0.5 rounded-md border p-0.5">
        {viewLink("grid", t("grid"), <LayoutGridIcon aria-hidden className="size-3.5" />)}
        {viewLink("list", t("list"), <ListIcon aria-hidden className="size-3.5" />)}
      </div>
    </div>
  );
}
