import type { Locator, Page } from "@playwright/test";

import { expect } from "./auth";

/**
 * The "More actions" button when the page shows it (phones), else null. Waits until either it or
 * the control it stands in for is visible, so a page still settling is not mistaken for either.
 */
export async function phoneMenu(page: Page, control: Locator): Promise<Locator | null> {
  const more = page.getByRole("button", { name: "More actions" });
  await expect(more.or(control).filter({ visible: true }).first()).toBeVisible();
  return (await more.isVisible()) ? more : null;
}

/**
 * Routine and plan pages show their controls as buttons from `sm` up and in a "More actions"
 * menu on phones. Runs the named one either way: the button, or the menu item.
 */
export async function pageAction(page: Page, name: string | RegExp) {
  const button = page.getByRole("button", { name, exact: typeof name === "string" });
  const more = await phoneMenu(page, button);
  if (more) {
    await more.click();
    await page.getByRole("menuitem", { name }).click();
  } else {
    await button.click();
  }
}

/** Renames the routine through its title (pencil, type, Enter); Save still saves it. */
export async function renameRoutine(page: Page, name: string) {
  await page.getByRole("button", { name: "Rename routine" }).click();
  const input = page.getByRole("textbox", { name: "Routine name" });
  await input.fill(name);
  await input.press("Enter");
  await expect(routineTitle(page, name)).toBeVisible();
}

/**
 * Names a routine (or routine template) just created with its default name: renames it through
 * the title and saves, so the name sticks even if the test leaves the editor right away.
 */
export async function nameNewRoutine(page: Page, name: string) {
  await expect(
    page.getByRole("heading", { level: 1, name: /^New routine( template)?$/ }),
  ).toBeVisible();
  await renameRoutine(page, name);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
}

/**
 * Renames a plan just created with its default name through its title (a plan rename saves at
 * once). Reloads so the name is known to be stored and no "Saved" from it lingers on the page
 * to be mistaken for the next save's.
 */
export async function renamePlan(page: Page, name: string) {
  await expect(routineTitle(page, "New plan")).toBeVisible();
  await page.getByRole("button", { name: "Rename plan" }).click();
  const input = page.getByRole("textbox", { name: "Plan name" });
  await input.fill(name);
  await input.press("Enter");
  await expect(routineTitle(page, name)).toBeVisible();
  await page.reload();
  await expect(routineTitle(page, name)).toBeVisible();
}

/** The routine or plan page's title. */
export const routineTitle = (page: Page, name: string) =>
  page.getByRole("heading", { level: 1, name, exact: true });

/** "From template: X" shows on the page from `sm` up and as a menu item (a link) on phones. */
export async function expectFromTemplate(page: Page) {
  const more = await phoneMenu(page, page.getByText("From template:"));
  if (more) {
    await more.click();
    await expect(page.getByRole("menuitem", { name: /^From template: / })).toBeVisible();
    await page.keyboard.press("Escape");
  } else {
    await expect(page.getByText("From template:")).toBeVisible();
  }
}

/** Follows "From template: X" to the template: the link, or the menu item on phones. */
export async function openFromTemplate(page: Page, name: string) {
  const link = page.getByRole("link", { name });
  const more = await phoneMenu(page, link);
  if (more) {
    await more.click();
    await page.getByRole("menuitem", { name: `From template: ${name}` }).click();
  } else {
    await link.click();
  }
}
