"use client";

import { useEffect } from "react";

import { serviceWorkerUrl } from "@/lib/pwa";

export async function registerServiceWorker({
  enabled,
  buildId,
  container,
}: {
  enabled: boolean;
  buildId: string;
  container: ServiceWorkerContainer | undefined;
}): Promise<void> {
  if (!enabled || !container) return;
  try {
    await container.register(serviceWorkerUrl(buildId), { scope: "/" });
  } catch {
    // The app works without a worker; it only adds the offline page.
  }
}

/**
 * Registers public/sw.js (offline fallback page, see docs/specs/18-pwa.md). Production only: in
 * `next dev` a caching worker would fight hot reloading.
 */
export function ServiceWorkerRegistration({ buildId }: { buildId: string }) {
  useEffect(() => {
    void registerServiceWorker({
      enabled: process.env.NODE_ENV === "production",
      buildId,
      container: "serviceWorker" in navigator ? navigator.serviceWorker : undefined,
    });
  }, [buildId]);

  return null;
}
