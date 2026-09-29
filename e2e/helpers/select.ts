import type { Locator, Page } from "@playwright/test";

/** Opens a shadcn Select and picks an option by its visible name. */
export async function chooseOption(page: Page, trigger: Locator, name: string | RegExp) {
  await trigger.click();
  await page.getByRole("option", { name }).click();
}
