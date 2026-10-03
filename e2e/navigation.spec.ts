import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/auth";
import { insertCustomer } from "./helpers/patient";

/** How long a held-back navigation takes; feedback must show well before it ends. */
const SLOW_MS = 2_500;
const FEEDBACK_MS = 1_000;

/**
 * Holds back every navigation's server response (not prefetches) by SLOW_MS, so the test can
 * see what the page shows while the server is still rendering.
 */
async function slowNavigations(page: Page) {
  await page.route("**/*", async (route) => {
    const headers = route.request().headers();
    if (headers.rsc === "1" && !headers["next-router-prefetch"]) {
      await new Promise((resolve) => setTimeout(resolve, SLOW_MS));
    }
    await route.continue();
  });
}

const loading = (page: Page) => page.getByRole("status").filter({ hasText: "Loading…" });

test("a path change shows the page's skeleton at once", async ({ physioPage: page }) => {
  // Let the links' prefetches (which carry the loading states) finish.
  await page.waitForLoadState("networkidle");
  await slowNavigations(page);

  await page.getByRole("link", { name: "Routines", exact: true }).filter({ visible: true }).click();
  await expect(loading(page)).toBeAttached({ timeout: FEEDBACK_MS });
  await expect(page).toHaveURL(/\/routines$/);

  await expect(page.getByRole("heading", { name: "Routines", level: 1 })).toBeVisible();
  await expect(loading(page)).toHaveCount(0);
});

test("a tab change marks the tab and dims the list until it loads", async ({
  physioPage: page,
}) => {
  await page.goto("/routines");
  await page.waitForLoadState("networkidle");
  await slowNavigations(page);

  const tabs = page.getByRole("navigation", { name: "List type" });
  const templates = tabs.getByRole("link", { name: "Templates" });
  await templates.click();
  await expect(templates.locator("[data-pending]")).toBeAttached({ timeout: FEEDBACK_MS });
  await expect(page.locator("main [aria-busy=true]").first()).toBeAttached({
    timeout: FEEDBACK_MS,
  });
  // The page stays (dimmed): a search-param navigation never shows the route skeleton.
  await expect(loading(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Routines", level: 1 })).toBeVisible();

  await expect(templates).toHaveAttribute("aria-current", "page");
  await expect(page.locator("main [aria-busy=true]")).toHaveCount(0);
  await expect(templates.locator("[data-pending]")).toHaveCount(0);
});

test("a filter change dims the results until they load", async ({ physio, physioPage: page }) => {
  await insertCustomer(physio.id, { firstName: "Active" });
  await insertCustomer(physio.id, { firstName: "Retired", archived: true });
  await page.goto("/customers");
  await expect(page.getByRole("link", { name: /Active/ }).first()).toBeVisible();
  await slowNavigations(page);

  await page.getByLabel("Show archived").click();
  await expect(page.locator("main [aria-busy=true]").first()).toBeAttached({
    timeout: FEEDBACK_MS,
  });

  await expect(page).toHaveURL(/archived=/);
  await expect(page.getByRole("link", { name: /Retired/ }).first()).toBeVisible();
  await expect(page.locator("main [aria-busy=true]")).toHaveCount(0);
});
