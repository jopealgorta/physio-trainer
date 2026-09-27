import { expect, test } from "@playwright/test";

test("landing page renders the headline and a sign-in link", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Get started" })).toHaveAttribute("href", "/login");
});

test("physio workspace shows navigation", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  const nav = page.getByRole("navigation").filter({ visible: true }).first();
  await nav.getByRole("link", { name: "Customers" }).click();
  await expect(page).toHaveURL(/\/customers$/);
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
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
