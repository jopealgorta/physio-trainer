import { describe, expect, it } from "vitest";

import { APP_ICONS, buildManifest, serviceWorkerUrl } from "./pwa";

describe("buildManifest", () => {
  const manifest = buildManifest({
    locale: "es",
    name: "Physio Trainer",
    description: "Rutinas de rehabilitación",
  });

  it("opens the physio dashboard as a standalone app", () => {
    expect(manifest).toMatchObject({
      id: "/",
      name: "Physio Trainer",
      short_name: "Physio Trainer",
      start_url: "/dashboard",
      scope: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#ffffff",
    });
  });

  it("uses the request locale for the description and lang", () => {
    expect(manifest.description).toBe("Rutinas de rehabilitación");
    expect(manifest.lang).toBe("es");
  });

  it("lists 192 and 512 icons for any purpose plus a maskable 512", () => {
    expect(manifest.icons).toEqual([
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ]);
  });
});

describe("APP_ICONS", () => {
  it("has unique ids so every icon gets its own URL", () => {
    const ids = APP_ICONS.map((icon) => icon.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("serviceWorkerUrl", () => {
  it("versions the script URL with the build id so each deploy installs a new worker", () => {
    expect(serviceWorkerUrl("abc123")).toBe("/sw.js?v=abc123");
  });

  it("encodes the build id", () => {
    expect(serviceWorkerUrl("a b&c")).toBe("/sw.js?v=a%20b%26c");
  });
});
