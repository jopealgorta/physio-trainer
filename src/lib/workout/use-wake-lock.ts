"use client";

import { useEffect } from "react";

/**
 * Keeps the screen on while `active` (Screen Wake Lock API, where available). The browser drops
 * the lock whenever the tab is hidden, so it is asked for again when the tab comes back.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    let requesting = false;

    const request = async () => {
      requesting = true;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) void lock.release();
        else sentinel = lock;
      } catch {
        // Refused (low battery, no permission): the workout still works, the screen may dim.
      } finally {
        requesting = false;
      }
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible" || requesting) return;
      if (sentinel === null || sentinel.released) void request();
    };

    void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release();
    };
  }, [active]);
}
