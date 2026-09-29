"use client";

import { SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CUSTOMER_SEARCH_MAX_LENGTH,
  customersHref,
  type CustomerFilters,
  type CustomerSort,
} from "@/lib/customer-params";

const SEARCH_DEBOUNCE_MS = 300;

export function CustomerToolbar({ filters }: { filters: CustomerFilters }) {
  const t = useTranslations("Customers");
  const router = useRouter();
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
  const navigate = (changes: Partial<CustomerFilters>, flushSearch = false) => {
    const pending = (flushSearch || timer.current !== null) && searchRef.current;
    const q = pending ? searchRef.current!.value.trim() : latest.current.q;
    cancelTimer();
    router.replace(customersHref({ ...latest.current, q }, changes), { scroll: false });
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
          aria-label={t("searchLabel")}
          placeholder={t("searchPlaceholder")}
          defaultValue={filters.q}
          maxLength={CUSTOMER_SEARCH_MAX_LENGTH}
          className="pl-7"
          onChange={() => onSearchChange()}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            navigate({}, true);
          }}
        />
      </div>
      <div className="grid gap-1 md:w-44">
        <Label htmlFor="customer-sort" className="text-muted-foreground">
          {t("sortLabel")}
        </Label>
        <Select
          value={filters.sort}
          onValueChange={(sort) => {
            // "" only comes from Radix's internal <select>, never from a choice (see select-value).
            if (sort !== "name" && sort !== "recent") return;
            navigate({ sort: sort satisfies CustomerSort });
          }}
        >
          <SelectTrigger id="customer-sort" className="w-full">
            <SelectValue>{filters.sort === "recent" ? t("sortRecent") : t("sortName")}</SelectValue>
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="name">{t("sortName")}</SelectItem>
            <SelectItem value="recent">{t("sortRecent")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex h-7 items-center gap-2">
        <Checkbox
          id="customer-archived"
          checked={filters.archived}
          onCheckedChange={(checked) => navigate({ archived: checked === true })}
        />
        <Label htmlFor="customer-archived" className="text-sm font-normal">
          {t("showArchived")}
        </Label>
      </div>
    </div>
  );
}
