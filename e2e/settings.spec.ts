import { expect, test } from "./helpers/auth";
import { chooseOption } from "./helpers/select";

test("a physio updates their profile", async ({ physioPage: page, physio }) => {
  await page.goto("/settings");
  await page.getByLabel("Display name").fill("Renamed Physio");
  const newHandle = `renamed-${physio.id.slice(0, 8)}`;
  await page.getByLabel("Handle").fill(newHandle);
  await expect(
    page.getByText("Links you already shared keep working and will show your new handle."),
  ).toBeVisible();
  await expect(page.getByText("Available", { exact: true })).toBeVisible();
  await chooseOption(page, page.getByLabel("Timezone"), /^Europe\/Madrid/);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  // React resets a form after its action; the chosen zone must survive that, not snap back.
  await expect(page.getByLabel("Timezone")).toHaveText(/^Europe\/Madrid/);

  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue("Renamed Physio");
  await expect(page.getByLabel("Handle")).toHaveValue(newHandle);
  await expect(page.getByLabel("Timezone")).toHaveText(/^Europe\/Madrid/);
  await page.goto("/settings?section=account");
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
  await page.goto("/settings?section=account");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings$/);
});

test("settings sections are tabs driven by the URL", async ({ physioPage: page }) => {
  await page.goto("/settings");
  const tabs = page.getByRole("navigation", { name: "Settings sections" });
  await expect(tabs.getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("link", { name: "Branding" }).click();
  await expect(page).toHaveURL(/\/settings\?section=branding$/);
  await expect(tabs.getByRole("link", { name: "Branding" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByText("How your clinic looks to patients")).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel("Display name")).toBeVisible();
});

test("the landing page offers the dashboard to signed-in physios", async ({ physioPage: page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Open dashboard" })).toHaveAttribute(
    "href",
    "/dashboard",
  );
});
