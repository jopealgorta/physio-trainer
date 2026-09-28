import { expect, test } from "@playwright/test";

test("landing page renders the headline and a sign-in link", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Get started" })).toHaveAttribute("href", "/login");
});

test("signed-out visitors of the workspace are sent to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
});

test("unknown patient links return 404", async ({ page }) => {
  const response = await page.goto("/some-physio/ana-k7x2m9qp");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});

test("health check responds", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ status: "ok" });
});
