import { expect, test } from "./helpers/auth";

test("a physio updates their profile", async ({ physioPage: page, physio }) => {
  await page.goto("/settings");
  await page.getByLabel("Display name").fill("Renamed Physio");
  const newHandle = `renamed-${physio.id.slice(0, 8)}`;
  await page.getByLabel("Handle").fill(newHandle);
  await expect(
    page.getByText("Links you already shared keep working and will show your new handle."),
  ).toBeVisible();
  await expect(page.getByText("Available", { exact: true })).toBeVisible();
  await page.getByLabel("Timezone").selectOption("Europe/Madrid");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  // React resets a form after its action; the chosen zone must survive that, not snap back.
  await expect(page.getByLabel("Timezone")).toHaveValue("Europe/Madrid");

  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue("Renamed Physio");
  await expect(page.getByLabel("Handle")).toHaveValue(newHandle);
  await expect(page.getByLabel("Timezone")).toHaveValue("Europe/Madrid");
  await expect(page.getByRole("main").getByText(physio.email)).toBeVisible();
});

test("a physio signs out from the account menu", async ({ physioPage: page }) => {
  await page.getByRole("button", { name: "Account menu" }).filter({ visible: true }).click();
  await expect(page.getByRole("menu")).toContainText("E2E Physio");
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByRole("link", { name: "Get started" })).toBeVisible();
});

test("after signing out, protected pages send you to login", async ({ physioPage: page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings$/);
});

test("the landing page offers the dashboard to signed-in physios", async ({ physioPage: page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Open dashboard" })).toHaveAttribute(
    "href",
    "/dashboard",
  );
});
