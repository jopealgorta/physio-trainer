import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/auth";
import { chooseOption } from "./helpers/select";

async function createCustomer(page: Page, firstName: string) {
  await page.goto("/customers/new");
  await page.getByLabel("First name").fill(firstName);
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname;
}

test("a physio starts a routine from a customer's routines tab", async ({ physioPage: page }) => {
  await page.goto("/routines");
  await expect(page.getByRole("heading", { name: "No routines yet" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to customers" })).toHaveAttribute(
    "href",
    "/customers",
  );

  const customerPath = await createCustomer(page, "Rita");
  await page.getByRole("button", { name: "New case" }).click();
  const sheet = page.getByRole("dialog", { name: "New case" });
  await sheet.getByLabel("Title").fill("Meniscus");
  await sheet.getByRole("button", { name: "Create case" }).click();
  await expect(sheet).toBeHidden();

  await page.goto(`${customerPath}?tab=routines`);
  await expect(page.getByText("No routines for Rita yet.")).toBeVisible();
  await page.getByRole("button", { name: "New routine" }).click();
  const dialog = page.getByRole("dialog", { name: "New routine for Rita" });

  // A blank name is rejected by the server and keeps the dialog open.
  await dialog.getByRole("button", { name: "Create routine" }).click();
  await expect(dialog.getByText("Enter a name.")).toBeVisible();

  await dialog.getByLabel("Name").fill("Week 1");
  await chooseOption(page, dialog.getByRole("combobox", { name: "Case" }), "Meniscus");
  await dialog.getByRole("button", { name: "Create routine" }).click();
  // The editor page arrives with the next spec: only the redirect is checked here.
  await expect(page).toHaveURL(/\/routines\/[0-9a-f-]{36}$/);
});

test("the routines list filters by search, status and customer", async ({ physioPage: page }) => {
  const customerPath = await createCustomer(page, "Sofia");
  await page.goto(`${customerPath}?tab=routines`);
  await page.getByRole("button", { name: "New routine" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("Hip mobility");
  await page.getByRole("button", { name: "Create routine" }).click();
  await expect(page).toHaveURL(/\/routines\/[0-9a-f-]{36}$/);

  await page.goto(`${customerPath}?tab=routines`);
  await expect(
    page.getByRole("link", { name: "Hip mobility" }).filter({ visible: true }),
  ).toBeVisible();

  await page.goto("/routines");
  const row = page.getByRole("link", { name: "Hip mobility" }).filter({ visible: true });
  await expect(row).toBeVisible();

  await page.getByRole("searchbox", { name: "Search routines" }).fill("zzz");
  await expect(page).toHaveURL(/\/routines\?q=zzz$/);
  await expect(page.getByText("No routines match these filters.")).toBeVisible();
  await page.getByRole("link", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/routines$/);
  await expect(row).toBeVisible();

  await chooseOption(page, page.getByRole("combobox", { name: "Status" }), "Active");
  await expect(page).toHaveURL(/status=active/);
  await expect(page.getByText("No routines match these filters.")).toBeVisible();
  await chooseOption(page, page.getByRole("combobox", { name: "Status" }), "Draft");
  await expect(row).toBeVisible();
  await chooseOption(page, page.getByRole("combobox", { name: "Customer" }), "Sofia");
  await expect(page).toHaveURL(/customer=/);
  await expect(row).toBeVisible();
});
