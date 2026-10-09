import type { Locator, Page } from "@playwright/test";

import { expect } from "./auth";
import { nameNewRoutine } from "./page-actions";

/** Creates an exercise with just a name through the library form. */
export async function createExercise(page: Page, name: string) {
  await page.goto("/library/new");
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create exercise" }).click();
  await expect(page).toHaveURL(/\/library$/);
}

/** Opens an exercise from the library (saving the form lands there). */
export async function openExercise(page: Page, name: string) {
  await expect(page).toHaveURL(/\/library$/);
  await page.getByRole("link", { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(/\/library\/[0-9a-f-]{36}$/);
}

/** Creates a customer, then a routine for them from the customer's Routines tab. */
export async function createRoutine(page: Page, name: string, customer = "Edith") {
  await page.goto("/customers/new");
  await page.getByLabel("First name").fill(customer);
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/);
  await page.goto(`${new URL(page.url()).pathname}?tab=routines`);
  await page.getByRole("button", { name: "New routine" }).click();
  await expect(page).toHaveURL(/\/routines\/[0-9a-f-]{36}$/);
  await nameNewRoutine(page, name);
}

/**
 * The exercise picker: a side panel on desktop, a bottom sheet (opened by "Add exercises") on
 * mobile. Both render the same component, and only one of them is visible at a time.
 */
export async function openPicker(page: Page, isMobile: boolean): Promise<Locator> {
  if (!isMobile) return page.getByRole("complementary");
  await page.getByRole("button", { name: "Add exercises" }).click();
  const sheet = page.getByRole("dialog", { name: "Add exercises" });
  await expect(sheet).toBeVisible();
  return sheet;
}

/** Closes the mobile sheet with its "Done" ("2 added · Done") button; nothing to do on desktop. */
export async function closePicker(page: Page, isMobile: boolean) {
  if (!isMobile) return;
  await page
    .getByRole("dialog", { name: "Add exercises" })
    .getByRole("button", { name: /Done$/ })
    .click();
  await expect(page.getByRole("dialog", { name: "Add exercises" })).toBeHidden();
}

/**
 * Picks the named exercises in order. The picker stays open, so a batch is one open/close. A
 * recently used exercise is listed twice (under "Recent" and in the list): either one adds it.
 */
export async function addExercises(page: Page, isMobile: boolean, names: string[]) {
  const picker = await openPicker(page, isMobile);
  for (const name of names) await picker.getByRole("button", { name, exact: true }).first().click();
  await closePicker(page, isMobile);
}

export async function hasNoHorizontalOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
}
