import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/auth";
import { addExercises, createExercise, hasNoHorizontalOverflow } from "./helpers/routines";
import { chooseOption } from "./helpers/select";

/** Creates a customer and returns the path of their page. */
async function createCustomer(page: Page, name: string) {
  await page.goto("/customers/new");
  await page.getByLabel("First name").fill(name);
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname;
}

/** Creates a routine from the customer's Routines tab; leaves the page on the editor. */
async function createRoutineFor(page: Page, customerPath: string, name: string) {
  await page.goto(`${customerPath}?tab=routines`);
  await page.getByRole("button", { name: "New routine" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create routine" }).click();
  await expect(page).toHaveURL(/\/routines\/[0-9a-f-]{36}$/);
}

/** Creates a plan from the customer's Plans tab; leaves the page on the board. */
async function createPlanFor(page: Page, customerPath: string, name: string) {
  await page.goto(`${customerPath}?tab=plans`);
  await page.getByRole("button", { name: "New plan" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create plan" }).click();
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

const saveStatus = (page: Page) => page.getByTestId("save-status");
const day = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const routineNames = (page: Page, name: string) =>
  day(page, name)
    .locator("li a[href^='/routines/']")
    .evaluateAll((links) => links.map((link) => link.textContent?.trim() ?? ""));
const expectDay = (page: Page, name: string, expected: string[]) =>
  expect.poll(() => routineNames(page, name)).toEqual(expected);

async function saveRoutine(page: Page) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(saveStatus(page)).toHaveText("Saved");
}

/** "Save as template…" on a customer's routine/plan page; leaves the page on the new template. */
async function saveAsTemplate(page: Page, name: string, kind: "routines" | "plans") {
  await page.getByRole("button", { name: "Save as template…" }).click();
  const dialog = page.getByRole("dialog", { name: "Save as template" });
  await expect(
    dialog.getByText(
      "Notes and labels are copied as they are. Review them for patient information.",
    ),
  ).toBeVisible();
  await dialog.getByLabel("Template name").fill(name);
  await dialog.getByRole("button", { name: "Save template" }).click();
  await expect(page).toHaveURL(new RegExp(`/${kind}/[0-9a-f-]{36}$`));
  await expect(page.getByText("Template", { exact: true })).toBeVisible();
}

/** "From template…" on the customer's tab: pick a template and assign it as a draft. */
async function assignFromPicker(page: Page, customerPath: string, tab: string, template: string) {
  await page.goto(`${customerPath}?tab=${tab}`);
  await page.getByRole("button", { name: "From template…" }).click();
  await page.getByRole("button", { name: new RegExp(template) }).click();
  const dialog = page.getByRole("dialog", { name: "Assign to a customer" });
  await expect(dialog.getByLabel("Name")).toHaveValue(template);
  await dialog.getByRole("button", { name: "Assign", exact: true }).click();
}

test("a routine saved as a template is assigned to another customer as an independent copy", async ({
  physioPage: page,
  isMobile,
}) => {
  for (const name of ["Squat", "Lunge", "Bridge"]) await createExercise(page, name);
  const ana = await createCustomer(page, "Ana");
  await createRoutineFor(page, ana, "Knee rehab A");
  await addExercises(page, isMobile, ["Squat", "Lunge"]);
  await saveRoutine(page);

  await saveAsTemplate(page, "ACL protocol", "routines");
  // The template has the customer's exercises, no customer and no case.
  await expect(page.getByTestId("item-row")).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Ana" })).toHaveCount(0);
  const templatePath = new URL(page.url()).pathname;

  await page.goto("/routines?tab=templates");
  await expect(page.getByRole("link", { name: "ACL protocol" })).toBeVisible();
  expect(await hasNoHorizontalOverflow(page)).toBe(true);

  const bea = await createCustomer(page, "Bea");
  await assignFromPicker(page, bea, "routines", "ACL protocol");
  await expect(page).toHaveURL(/\/routines\/[0-9a-f-]{36}$/);
  await expect(page).not.toHaveURL(templatePath);
  await expect(page.getByText("From template:")).toBeVisible();
  await expect(page.getByRole("link", { name: "Bea" })).toBeVisible();
  await expect(page.getByTestId("item-row")).toHaveCount(2);

  // Editing the copy leaves the template alone.
  await addExercises(page, isMobile, ["Bridge"]);
  await page.getByLabel("Notes for the patient").fill("Only for Bea");
  await saveRoutine(page);
  await expect(page.getByTestId("item-row")).toHaveCount(3);

  await page.getByRole("link", { name: "ACL protocol" }).click();
  await expect(page).toHaveURL(templatePath);
  await expect(page.getByTestId("item-row")).toHaveCount(2);
  await expect(page.getByLabel("Notes for the patient")).toHaveValue("");
});

test("a plan template keeps a routine shared across days shared in the copy", async ({
  physioPage: page,
}) => {
  const ana = await createCustomer(page, "Ana");
  await createRoutineFor(page, ana, "Mobility");
  await createPlanFor(page, ana, "Week 1");
  for (const weekday of ["Monday", "Thursday"]) {
    await page.getByRole("button", { name: `Add routine to ${weekday}` }).click();
    await page.getByRole("menuitem", { name: "Existing routine…" }).click();
    const dialog = page.getByRole("dialog", { name: `Add an existing routine to ${weekday}` });
    await chooseOption(
      page,
      dialog.getByRole("combobox", { name: "Routine" }),
      new RegExp("^Mobility"),
    );
    await dialog.getByRole("button", { name: "Add to plan" }).click();
    await expect(dialog).toBeHidden();
  }
  await expect(day(page, "Monday").getByText("Shared ×2")).toBeVisible();

  await saveAsTemplate(page, "Mobility week", "plans");
  await expectDay(page, "Monday", ["Mobility"]);
  await expectDay(page, "Thursday", ["Mobility"]);
  await expect(day(page, "Monday").getByText("Shared ×2")).toBeVisible();

  const bea = await createCustomer(page, "Bea");
  await assignFromPicker(page, bea, "plans", "Mobility week");
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}$/);
  await expect(page.getByText("From template:")).toBeVisible();
  const copyPath = new URL(page.url()).pathname;
  await expectDay(page, "Monday", ["Mobility"]);
  await expectDay(page, "Thursday", ["Mobility"]);
  await expect(day(page, "Monday").getByText("Shared ×2")).toBeVisible();

  // One routine behind both days: renaming it once shows on both.
  await day(page, "Monday").getByRole("link", { name: "Mobility" }).click();
  await expect(page).toHaveURL(/\/routines\/[0-9a-f-]{36}\?plan=/);
  await page.getByRole("textbox", { name: "Routine name" }).fill("Mobility B");
  await saveRoutine(page);
  await page.goto(copyPath);
  await expectDay(page, "Monday", ["Mobility B"]);
  await expectDay(page, "Thursday", ["Mobility B"]);
});

test("an archived template can no longer be assigned", async ({ physioPage: page }) => {
  const ana = await createCustomer(page, "Ana");

  await page.goto("/routines?tab=templates");
  await page.getByRole("button", { name: "New routine template" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("Old protocol");
  await page.getByRole("button", { name: "Create template" }).click();
  await expect(page).toHaveURL(/\/routines\/[0-9a-f-]{36}$/);
  // Templates are active or archived: no draft.
  await page.getByRole("combobox", { name: "Status" }).click();
  await expect(page.getByRole("option")).toHaveText(["Active", "Archived"]);
  await page.getByRole("option", { name: "Archived" }).click();
  await saveRoutine(page);

  // It is gone from the customer's picker...
  await page.goto(`${ana}?tab=routines`);
  await page.getByRole("button", { name: "From template…" }).click();
  await expect(
    page.getByText("You have no routine templates yet. Save a routine as a template first."),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // ...and assigning it from the list is refused.
  await page.goto("/routines?tab=templates");
  await page.getByRole("button", { name: "Actions for Old protocol" }).first().click();
  await page.getByRole("menuitem", { name: "Assign to customer…" }).click();
  const dialog = page.getByRole("dialog", { name: "Assign to a customer" });
  await chooseOption(page, dialog.getByRole("combobox", { name: "Customer" }), "Ana");
  await dialog.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "This template is archived. Make it active to assign it.",
  );
});

test("templates never show up in customer lists or in another customer's pickers", async ({
  physioPage: page,
}) => {
  const ana = await createCustomer(page, "Ana");
  await createRoutineFor(page, ana, "Mine");

  await page.goto("/routines?tab=templates");
  await page.getByRole("button", { name: "New routine template" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("Hidden template");
  await page.getByRole("button", { name: "Create template" }).click();
  await expect(page).toHaveURL(/\/routines\/[0-9a-f-]{36}$/);

  // Customers tab and the customer's own tab list only the customer's routine.
  await page.goto("/routines");
  await expect(page.getByRole("link", { name: "Mine" })).toBeVisible();
  await expect(page.getByText("Hidden template")).toHaveCount(0);
  await page.goto(`${ana}?tab=routines`);
  await expect(page.getByRole("link", { name: "Mine" })).toBeVisible();
  await expect(page.getByText("Hidden template")).toHaveCount(0);

  // The plan board's "existing routine" picker offers only the customer's routines.
  await createPlanFor(page, ana, "Week 1");
  await page.getByRole("button", { name: "Add routine to Monday" }).click();
  await page.getByRole("menuitem", { name: "Existing routine…" }).click();
  const dialog = page.getByRole("dialog", { name: "Add an existing routine to Monday" });
  await dialog.getByRole("combobox", { name: "Routine" }).click();
  await expect(page.getByRole("option", { name: /Mine/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Hidden template/ })).toHaveCount(0);
});
