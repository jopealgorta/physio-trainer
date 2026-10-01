import { describe, expect, it } from "vitest";

import { APP_ICONS, buildManifest, buildPatientManifest, serviceWorkerUrl } from "./pwa";

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

describe("buildPatientManifest", () => {
  const manifest = buildPatientManifest({
    locale: "es",
    clinicName: "Maria Physio",
    path: "/maria-lopez/ana-7k2m9qpx",
    themeColor: "#0f766e",
  });

  it("installs the link itself, named after the clinic and scoped to it", () => {
    expect(manifest).toMatchObject({
      id: "/maria-lopez/ana-7k2m9qpx",
      name: "Maria Physio",
      short_name: "Maria Physio",
      lang: "es",
      start_url: "/maria-lopez/ana-7k2m9qpx",
      scope: "/maria-lopez/ana-7k2m9qpx",
      display: "standalone",
      theme_color: "#0f766e",
    });
  });

  it("keeps the start URL inside the scope", () => {
    expect(manifest.start_url!.startsWith(manifest.scope!)).toBe(true);
  });

  it("lists the installable app icons", () => {
    expect(manifest.icons?.map((icon) => icon.src)).toEqual(
      APP_ICONS.map((icon) => `/icon/${icon.id}`),
    );
  });

  it("shortens long clinic names for the home screen and falls back to the app colour", () => {
    const long = buildPatientManifest({
      locale: "en",
      clinicName: "Centro de Rehabilitación Integral del Sur",
      path: "/h/x-7k2m9qpx",
      themeColor: null,
    });
    expect(long.name).toBe("Centro de Rehabilitación Integral del Sur");
    expect(long.short_name!.length).toBeLessThanOrEqual(12);
    expect(long.theme_color).toBe("#ffffff");
  });
});
