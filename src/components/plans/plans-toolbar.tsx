"use client";

import { SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { plansHref, type PlanFilters } from "@/lib/plan-params";
import { ROUTINE_SEARCH_MAX_LENGTH, ROUTINE_STATUSES } from "@/lib/routines";
import { fromSelectValue, toSelectValue } from "@/lib/select-value";
import { TEMPLATE_STATUSES } from "@/lib/templates";

const SEARCH_DEBOUNCE_MS = 300;
const ALL = "all";

/** URL-driven filters for /plans: debounced search, status and customer. */
export function PlansToolbar({
  filters,
  customers,
}: {
  filters: PlanFilters;
  customers: { id: string; name: string }[];
}) {
  const t = useTranslations("Plans");
  const tStatus = useTranslations("Routines.status");
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
  const navigate = (changes: Partial<PlanFilters>, flushSearch = false) => {
    const pending = (flushSearch || timer.current !== null) && searchRef.current;
    const q = pending ? searchRef.current!.value.trim() : latest.current.q;
    cancelTimer();
    router.replace(plansHref({ ...latest.current, q }, changes), { scroll: false });
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

  // Templates are never drafts and belong to no customer (spec 07).
  const isTemplates = filters.tab === "templates";
  const statuses = isTemplates ? TEMPLATE_STATUSES : ROUTINE_STATUSES;

  // A customer id from the URL that is not in the list (deleted, or not visible) still shows a label.
  const selectedCustomer = customers.find((customer) => customer.id === filters.customerId);

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
          aria-label={t("filters.search")}
          placeholder={t("filters.search")}
          defaultValue={filters.q}
          maxLength={ROUTINE_SEARCH_MAX_LENGTH}
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
        <Label htmlFor="plans-status" className="text-muted-foreground">
          {t("filters.status")}
        </Label>
        <Select
          value={filters.status}
          onValueChange={(status) => {
            // "" only comes from Radix's internal <select>, never from a choice (see select-value).
            const next = statuses.find((candidate) => candidate === status);
            if (next) navigate({ status: next });
            else if (status === ALL) navigate({ status: ALL });
          }}
        >
          <SelectTrigger id="plans-status" className="w-full">
            <SelectValue>
              {filters.status === ALL ? t("filters.allStatuses") : tStatus(filters.status)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={ALL}>{t("filters.allStatuses")}</SelectItem>
            {statuses.map((status) => (
              <SelectItem key={status} value={status}>
                {tStatus(status)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isTemplates ? null : (
        <div className="grid gap-1 md:w-52">
          <Label htmlFor="plans-customer" className="text-muted-foreground">
            {t("filters.customer")}
          </Label>
          <Select
            value={toSelectValue(filters.customerId ?? "")}
            onValueChange={(value) => {
              if (value === "") return;
              navigate({ customerId: fromSelectValue(value) || null });
            }}
          >
            <SelectTrigger id="plans-customer" className="w-full">
              <SelectValue>
                {filters.customerId
                  ? (selectedCustomer?.name ?? t("filters.customer"))
                  : t("filters.allCustomers")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value={toSelectValue("")}>{t("filters.allCustomers")}</SelectItem>
              {customers.map((customer) => (
                <SelectItem key={customer.id} value={customer.id}>
                  {customer.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
