import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/auth";
import { pageAction } from "./helpers/page-actions";
import { addExercises, createExercise, createRoutine } from "./helpers/routines";
import { chooseOption } from "./helpers/select";

const history = (page: Page) => page.getByRole("dialog", { name: "Version history" });
// Said next to History from `sm` up, and in the page notices on phones: one of them shows.
const restoredNotice = (page: Page) =>
  page.getByText("Version restored.").filter({ visible: true });
const repsInput = (page: Page) =>
  page
    .getByTestId("item-row")
    .filter({ hasText: "Squat" })
    .getByLabel("Set 1: Reps", { exact: true });

async function editPrescription(page: Page) {
  await page
    .getByTestId("item-row")
    .filter({ hasText: "Squat" })
    .getByRole("button", { name: "Edit prescription" })
    .click();
}

async function saveRoutine(page: Page) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
}

test("a physio changes reps, sees it in the history and restores the earlier version", async ({
  physioPage: page,
  isMobile,
}) => {
  await createExercise(page, "Squat");
  await createRoutine(page, "History routine");
  await addExercises(page, isMobile, ["Squat"]);

  await editPrescription(page);
  await repsInput(page).fill("10");
  await saveRoutine(page);

  await repsInput(page).fill("12");
  await saveRoutine(page);

  await pageAction(page, "History");
  const sheet = history(page);
  await expect(sheet.getByRole("button").filter({ hasText: "Reps changed on 1" })).toBeVisible();
  await expect(sheet.getByText("Current")).toBeVisible();

  // The version before the reps change.
  await sheet
    .getByRole("button")
    .filter({ hasText: /\+1 exercise/ })
    .click();
  await sheet.getByRole("button", { name: "Restore this version" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Restore", exact: true }).click();

  await expect(restoredNotice(page)).toBeVisible();
  await expect(sheet).toBeHidden();
  await editPrescription(page);
  await expect(repsInput(page)).toHaveValue("10");

  await pageAction(page, "History");
  await expect(sheet.getByText(/^Restored from /).first()).toBeVisible();
});

test("a plan's history lists a routine added to a day and restores the empty plan", async ({
  physioPage: page,
}) => {
  await createRoutine(page, "Plan routine");
  await page.getByRole("link", { name: "Edith" }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/);
  const customer = new URL(page.url()).pathname;

  await page.goto(`${customer}?tab=plans`);
  await page.getByRole("button", { name: "New plan" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("History plan");
  await page.getByRole("button", { name: "Create plan" }).click();
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}$/);

  const monday = page.getByRole("region", { name: "Monday", exact: true });
  await page.getByRole("button", { name: "Add routine to Monday" }).click();
  await page.getByRole("menuitem", { name: "Existing routine…" }).click();
  const add = page.getByRole("dialog", { name: "Add an existing routine to Monday" });
  await chooseOption(page, add.getByRole("combobox", { name: "Routine" }), /^Plan routine/);
  await add.getByRole("button", { name: "Add to plan" }).click();
  await expect(add).toBeHidden();
  await expect(monday.locator("li a[href^='/routines/']")).toHaveCount(1);

  await pageAction(page, "History");
  const sheet = history(page);
  await expect(sheet.getByRole("button").filter({ hasText: "+1 routine" })).toBeVisible();

  await sheet.getByRole("button").filter({ hasText: "Created" }).click();
  await sheet.getByRole("button", { name: "Restore this version" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Restore", exact: true }).click();

  await expect(restoredNotice(page)).toBeVisible();
  await expect(monday).toContainText("Rest day");
  await expect(monday.locator("li a[href^='/routines/']")).toHaveCount(0);
});
