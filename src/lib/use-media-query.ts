"use client";

import { useSyncExternalStore } from "react";

/**
 * Tracks a CSS media query. Renders `false` on the server and during hydration, then the real
 * value, so the first client render always matches the server's HTML.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Below Tailwind's `sm` breakpoint (40rem): phones in portrait. */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 39.999rem)");
}
