import { useTranslations } from "next-intl";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Building blocks for the `loading.tsx` route fallbacks: rough shapes of a page (header, tabs,
 * toolbar, lists, forms) shown the moment a navigation starts, while the server renders it.
 */

const times = (count: number) => Array.from({ length: count }, (_, index) => index);

/**
 * The fallback's root: one "Loading…" status for assistive tech (not inside a busy region, which
 * screen readers may keep quiet); the shapes themselves are hidden from the accessibility tree.
 */
export function LoadingPage({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("Loading");
  return (
    <div className={cn("grid gap-6", className)}>
      <p role="status" className="sr-only">
        {t("label")}
      </p>
      <div aria-hidden className="contents">
        {children}
      </div>
    </div>
  );
}

/** A page title, optionally with the "back" link above, a description line and actions. */
export function HeaderSkeleton({
  back = false,
  description = false,
  actions = 0,
}: {
  back?: boolean;
  description?: boolean;
  actions?: number;
}) {
  return (
    <div className="grid gap-4">
      {back ? <Skeleton className="h-4 w-28" /> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-2">
          <Skeleton className="h-8 w-56 max-w-full" />
          {description ? <Skeleton className="h-4 w-80 max-w-full" /> : null}
        </div>
        {actions > 0 ? (
          <div className="flex gap-2">
            {times(actions).map((index) => (
              <Skeleton key={index} className="h-9 w-32" />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** A row of URL-driven tabs over a bottom border. */
export function TabsSkeleton({ count }: { count: number }) {
  return (
    <div className="flex gap-4 overflow-hidden border-b px-3 pb-2.5">
      {times(count).map((index) => (
        <Skeleton key={index} className="h-5 w-20 shrink-0" />
      ))}
    </div>
  );
}

/** A search box and `filters` select boxes. */
export function ToolbarSkeleton({ filters = 0 }: { filters?: number }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Skeleton className="h-9 min-w-0 flex-1 basis-56" />
      {times(filters).map((index) => (
        <Skeleton key={index} className="h-9 w-full md:w-44" />
      ))}
    </div>
  );
}

/** Bordered rows: a title and a meta line, with a badge on the right. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="grid gap-3">
      {times(rows).map((index) => (
        <div key={index} className="flex items-center gap-4 rounded-lg border p-4">
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-4 w-1/3 min-w-32" />
            <Skeleton className="h-3 w-1/4 min-w-24" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Cards with a cover image (the exercise library grid). */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {times(count).map((index) => (
        <div key={index} className="grid gap-3 rounded-lg border p-3">
          <Skeleton className="aspect-video w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

/** A bordered block of labelled fields. */
export function FormSkeleton({ fields = 4, className }: { fields?: number; className?: string }) {
  return (
    <div className={cn("grid gap-5 rounded-lg border p-6", className)}>
      {times(fields).map((index) => (
        <div key={index} className="grid gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
      <Skeleton className="h-9 w-28" />
    </div>
  );
}

/** A titled card with a few lines (dashboard panels, overview sections). */
export function PanelSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("grid content-start gap-4 rounded-lg border p-4", className)}>
      <div className="grid gap-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-64 max-w-full" />
      </div>
      {times(lines).map((index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}
