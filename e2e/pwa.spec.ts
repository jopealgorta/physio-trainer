import { expect, test } from "./helpers/auth";

/** Width and height from a PNG's IHDR chunk. */
function pngSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test.describe("installable app", () => {
  test("the manifest describes the physio app and its icons exist", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.ok()).toBe(true);
    const manifest = await response.json();
    expect(manifest).toMatchObject({
      name: "Physio Trainer",
      start_url: "/dashboard",
      display: "standalone",
      lang: "en",
    });
    expect(manifest.icons.map((icon: { purpose: string }) => icon.purpose)).toEqual([
      "any",
      "any",
      "maskable",
    ]);

    for (const icon of manifest.icons as { src: string; sizes: string }[]) {
      const res = await request.get(icon.src);
      expect(res.headers()["content-type"], icon.src).toBe("image/png");
      const { width, height } = pngSize(await res.body());
      expect(`${width}x${height}`, icon.src).toBe(icon.sizes);
    }
  });

  test("pages link the manifest and an Apple touch icon", async ({ page, request }) => {
    await page.goto("/login");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      /\/manifest\.webmanifest/,
    );
    const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
    expect(appleIcon).toBeTruthy();
    const res = await request.get(appleIcon!);
    expect(res.headers()["content-type"]).toBe("image/png");
    expect(pngSize(await res.body())).toEqual({ width: 180, height: 180 });
  });

  test("the manifest follows the visitor's language", async ({ request }) => {
    // API requests don't inherit the context locale, so send the header a browser would.
    const res = await request.get("/manifest.webmanifest", {
      headers: { "Accept-Language": "es-UY,es;q=0.9" },
    });
    const manifest = await res.json();
    expect(manifest.lang).toBe("es");
    expect(manifest.description).toBe(
      "Rutinas de rehabilitación que tus pacientes abren con un solo link.",
    );
  });
});

test.describe("offline", () => {
  test("a physio who loses connection sees the offline page, then recovers", async ({
    physioPage: page,
    context,
  }) => {
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller);

    await context.setOffline(true);
    await page.goto("/customers");
    await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();

    // Only the offline page and public build assets are cached, never pages or data.
    const cached = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) urls.push(new URL(request.url).pathname);
      }
      return urls;
    });
    expect(cached).toContain("/offline");
    for (const path of cached) {
      expect(path === "/offline" || path.startsWith("/_next/static/"), path).toBe(true);
    }

    await context.setOffline(false);
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
    await expect(page).toHaveURL(/\/customers$/);
  });
});
