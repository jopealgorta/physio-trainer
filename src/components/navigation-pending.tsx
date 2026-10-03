"use client";

import { useLinkStatus } from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type TransitionStartFunction,
} from "react";

import { cn } from "@/lib/utils";

/**
 * Feedback for navigations that only change the search params (tabs, filters, view toggles).
 * `loading.tsx` covers path changes, but a search-param navigation keeps showing the old page
 * until the server has rendered the new one. A `PendingScope` groups the controls with the
 * content they drive: while a filter's transition or a link inside the scope is pending, the
 * `PendingContent` is dimmed and marked busy.
 */

type Scope = { pending: boolean; navigate: TransitionStartFunction; report: (on: boolean) => void };

const PendingContext = createContext<Scope | null>(null);

export function PendingScope({ children }: { children: React.ReactNode }) {
  const [transitionPending, navigate] = useTransition();
  const [pendingLinks, setPendingLinks] = useState(0);
  const report = useCallback(
    (on: boolean) => setPendingLinks((count) => count + (on ? 1 : -1)),
    [],
  );
  const scope = useMemo(
    () => ({ pending: transitionPending || pendingLinks > 0, navigate, report }),
    [transitionPending, pendingLinks, navigate, report],
  );
  return <PendingContext value={scope}>{children}</PendingContext>;
}

/**
 * `navigate(() => router.replace(...))` runs the navigation as a transition of the nearest
 * scope (or of the calling component when there is none).
 */
export function usePendingNavigation(): { pending: boolean; navigate: TransitionStartFunction } {
  const scope = useContext(PendingContext);
  const [pending, navigate] = useTransition();
  return scope ?? { pending, navigate };
}

/** The content a scope's controls change: dimmed (after a short delay) and busy while pending. */
export function PendingContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const pending = useContext(PendingContext)?.pending ?? false;
  return (
    <div
      aria-busy={pending || undefined}
      className={cn(
        "transition-opacity duration-200",
        pending && "opacity-50 delay-100",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Goes inside a `<Link>` (which needs `relative`): an underline that pulses while that link's
 * navigation is pending, fading in after 100ms so fast navigations don't flash. Also marks the
 * surrounding `PendingScope` busy.
 */
export function LinkPendingHint({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  const report = useContext(PendingContext)?.report;
  useEffect(() => {
    if (!pending || !report) return;
    report(true);
    return () => report(false);
  }, [pending, report]);
  return (
    <span
      aria-hidden
      data-pending={pending || undefined}
      className={cn(
        "bg-primary pointer-events-none absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full opacity-0",
        pending && "opacity-100 transition-opacity delay-100 motion-safe:animate-pulse",
        className,
      )}
    />
  );
}
