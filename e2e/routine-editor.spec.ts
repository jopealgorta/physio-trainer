import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/auth";

async function createRoutine(page: Page, name: string) {
  await page.goto("/customers/new");
  await page.getByLabel("First name").fill("Edith");
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/);
  await page.goto(`${new URL(page.url()).pathname}?tab=routines`);
  await page.getByRole("button", { name: "New routine" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create routine" }).click();
  await expect(page).toHaveURL(/\/routines\/[0-9a-f-]{36}$/);
}

test("a physio renames a routine and a stale tab hits the version conflict", async ({
  physioPage: page,
}) => {
  await createRoutine(page, "Week 1");
  const name = page.getByRole("textbox", { name: "Routine name" });
  await expect(name).toHaveValue("Week 1");
  await expect(page.getByRole("link", { name: "Edith" })).toBeVisible();

  // Nothing to save until something changes.
  const save = page.getByRole("button", { name: "Save" });
  await expect(save).toBeDisabled();
  await name.fill("Week 1 - knee");
  await expect(page.getByTestId("save-status")).toHaveText("Unsaved changes");

  // Open the same routine in a second tab before saving in the first.
  const other = await page.context().newPage();
  await other.goto(page.url());
  await expect(other.getByRole("textbox", { name: "Routine name" })).toHaveValue("Week 1");

  await save.click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await expect(save).toBeDisabled();
  await expect(name).toHaveValue("Week 1 - knee");

  // The second tab still holds the old version: its save loses.
  await other.getByRole("textbox", { name: "Routine name" }).fill("Week 1 - hip");
  await other.getByRole("button", { name: "Save" }).click();
  // Next's route announcer is also role=alert, so match on the message.
  const conflict = other.getByRole("alert").filter({ hasText: "changed in another tab" });
  await expect(conflict).toBeVisible();
  await other.getByRole("button", { name: "Reload" }).click();
  await expect(other.getByRole("textbox", { name: "Routine name" })).toHaveValue("Week 1 - knee");
  await expect(conflict).toBeHidden();
  await expect(other.getByRole("button", { name: "Save" })).toBeDisabled();
});

test("leaving with unsaved changes asks first", async ({ physioPage: page }) => {
  await createRoutine(page, "Week 2");
  const name = page.getByRole("textbox", { name: "Routine name" });
  await name.fill("Week 2!");

  const messages: string[] = [];
  page.on("dialog", async (dialog) => {
    messages.push(dialog.message());
    await dialog.dismiss();
  });
  await page.getByRole("link", { name: "Back to routines" }).click();
  await expect.poll(() => messages).toEqual(["You have unsaved changes. Leave without saving?"]);
  await expect(page).toHaveURL(/\/routines\/[0-9a-f-]{36}$/);

  page.removeAllListeners("dialog");
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("link", { name: "Back to routines" }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}\?tab=routines$/);
});

test("a blank name is flagged on the field and not sent", async ({ physioPage: page }) => {
  await createRoutine(page, "Week 3");
  const name = page.getByRole("textbox", { name: "Routine name" });
  await name.fill("");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Enter a name.")).toBeVisible();
  await expect(name).toHaveAttribute("aria-invalid", "true");
});
