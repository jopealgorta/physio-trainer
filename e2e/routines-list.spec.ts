import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/auth";
import { chooseOption } from "./helpers/select";
import { nameNewRoutine, routineTitle } from "./helpers/page-actions";

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
  // No dialog: the routine is created with a default name and no case, and opens in the editor.
  await page.getByRole("button", { name: "New routine" }).click();
  await expect(page).toHaveURL(/\/routines\/[0-9a-f-]{36}$/);
  await expect(routineTitle(page, "New routine")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Case" })).toHaveText("No case");
});

test("a physio starts a routine from the routines list by choosing the customer", async ({
  physioPage: page,
}) => {
  await createCustomer(page, "Rita");
  await page.goto("/routines");
  await expect(page.getByText("Pick a customer to create their first routine.")).toBeVisible();
  await page.getByRole("button", { name: "New routine" }).click();
  const dialog = page.getByRole("dialog", { name: "New routine" });
  await expect(dialog.getByRole("button", { name: "Create routine" })).toBeDisabled();
  await chooseOption(page, dialog.getByRole("combobox", { name: "Customer" }), "Rita");
  await dialog.getByRole("button", { name: "Create routine" }).click();
  await expect(page).toHaveURL(/\/routines\/[0-9a-f-]{36}$/);
  await expect(routineTitle(page, "New routine")).toBeVisible();
  await expect(page.getByRole("link", { name: "Rita" })).toBeVisible();
});

test("the routines list filters by search, status and customer", async ({ physioPage: page }) => {
  const customerPath = await createCustomer(page, "Sofia");
  await page.goto(`${customerPath}?tab=routines`);
  await page.getByRole("button", { name: "New routine" }).click();
  await expect(page).toHaveURL(/\/routines\/[0-9a-f-]{36}$/);
  await nameNewRoutine(page, "Hip mobility");

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
