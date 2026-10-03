import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/auth";
import { hasNoHorizontalOverflow } from "./helpers/routines";
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
  await expect(page).toHaveURL(/\/routines\/[0-9a-f-]{36}/);
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

const day = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
/** The routine names on a day, in order. */
const routineNames = (page: Page, name: string) =>
  day(page, name)
    .locator("li a[href^='/routines/']")
    .evaluateAll((links) => links.map((link) => link.textContent?.trim() ?? ""));

/**
 * Resolves once the next board action has committed on the server (Next sends a server action's
 * response only after the action returns). The board shows a change before its action commits,
 * so a reload right after an optimistic assertion can render the plan as it was: start this
 * before the action, await it before reloading.
 */
const boardActionSettled = (page: Page) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.request().headers()["next-action"] !== undefined &&
      new URL(response.url()).pathname.startsWith("/plans/"),
  );

/** The routine names on a day, in order (polls: the board updates after each action). */
const expectDay = (page: Page, name: string, expected: string[]) =>
  expect.poll(() => routineNames(page, name)).toEqual(expected);

async function addExisting(page: Page, weekday: string, routine: string, label?: string) {
  await page.getByRole("button", { name: `Add routine to ${weekday}` }).click();
  await page.getByRole("menuitem", { name: "Existing routine…" }).click();
  const dialog = page.getByRole("dialog", { name: `Add an existing routine to ${weekday}` });
  await chooseOption(
    page,
    dialog.getByRole("combobox", { name: "Routine" }),
    new RegExp(`^${routine}`),
  );
  if (label) await dialog.getByLabel("Label").fill(label);
  await dialog.getByRole("button", { name: "Add to plan" }).click();
  await expect(dialog).toBeHidden();
}

async function entryAction(page: Page, weekday: string, routine: string, action: string | RegExp) {
  await day(page, weekday)
    .getByRole("button", { name: `Actions for ${routine}` })
    .first()
    .click();
  await page.getByRole("menuitem", { name: action }).click();
}

test("a physio builds a weekly plan, edits it from the board, and it persists", async ({
  physioPage: page,
}) => {
  const customer = await createCustomer(page, "Ana");
  await createRoutineFor(page, customer, "Knee rehab A");
  await createPlanFor(page, customer, "Week 1");

  await expect(day(page, "Monday")).toContainText("Rest day");

  // Existing routine on two days: shared by reference.
  await addExisting(page, "Monday", "Knee rehab A");
  await addExisting(page, "Thursday", "Knee rehab A", "Morning");
  await expect(day(page, "Monday").getByText("Shared ×2")).toBeVisible();
  await expect(day(page, "Thursday").getByText("Morning")).toBeVisible();

  // A new routine on Monday opens the editor, which leads back to the plan.
  await page.getByRole("button", { name: "Add routine to Monday" }).click();
  await page.getByRole("menuitem", { name: "New routine…" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("Gym upper");
  await page.getByRole("button", { name: "Create and edit" }).click();
  await expect(page).toHaveURL(/\/routines\/[0-9a-f-]{36}\?plan=/);
  await page.getByRole("link", { name: "Back to plan" }).click();
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}$/);
  await expectDay(page, "Monday", ["Knee rehab A", "Gym upper"]);

  // Reorder, move and copy from the entry menu.
  await entryAction(page, "Monday", "Gym upper", "Move up");
  await expectDay(page, "Monday", ["Gym upper", "Knee rehab A"]);
  await entryAction(page, "Monday", "Gym upper", "Move to…");
  await page.getByRole("menuitem", { name: "Friday" }).click();
  await expectDay(page, "Friday", ["Gym upper"]);
  await entryAction(page, "Friday", "Gym upper", "Copy to…");
  await page.getByRole("menuitem", { name: "Saturday" }).click();
  await expectDay(page, "Saturday", ["Gym upper"]);
  await expect(day(page, "Friday").getByText("Shared ×2")).toBeVisible();

  // Edit a label.
  await entryAction(page, "Monday", "Knee rehab A", "Edit label…");
  await page.getByRole("dialog").getByLabel("Label").fill("Evening");
  const labelled = boardActionSettled(page);
  await page.getByRole("button", { name: "Save label" }).click();
  await expect(day(page, "Monday").getByText("Evening")).toBeVisible();

  // The week summary counts every scheduled routine.
  await expect(page.getByText("4 routines a week")).toBeVisible();

  // Everything survives a reload.
  await labelled;
  await page.reload();
  await expectDay(page, "Monday", ["Knee rehab A"]);
  await expectDay(page, "Thursday", ["Knee rehab A"]);
  await expectDay(page, "Friday", ["Gym upper"]);
  await expectDay(page, "Saturday", ["Gym upper"]);
  await expect(day(page, "Monday").getByText("Evening")).toBeVisible();
  await expect(day(page, "Thursday").getByText("Morning")).toBeVisible();

  // "Make a separate copy" diverges only Thursday's entry.
  await entryAction(page, "Thursday", "Knee rehab A", "Make a separate copy");
  await expectDay(page, "Thursday", ["Knee rehab A (copy)"]);
  await expectDay(page, "Monday", ["Knee rehab A"]);
  await expect(day(page, "Monday").getByText(/Shared/)).toHaveCount(0);
  await page.reload();
  await expectDay(page, "Thursday", ["Knee rehab A (copy)"]);

  // A plan with routines can be activated, and the plans list shows its week.
  await chooseOption(page, page.getByRole("combobox", { name: "Status" }), "Active");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await page.goto("/plans");
  // A table on wide screens, cards on narrow ones: only the rendered one is in the a11y tree.
  await expect(page.getByRole("link", { name: "Week 1" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Monday: 1 routine, Tuesday: rest/ })).toBeVisible();

  expect(await hasNoHorizontalOverflow(page)).toBe(true);
});

test("removing the last use of a plan-only routine offers to delete it", async ({
  physioPage: page,
}) => {
  const customer = await createCustomer(page, "Bea");
  await createPlanFor(page, customer, "Week 2");
  await page.getByRole("button", { name: "Add routine to Tuesday" }).click();
  await page.getByRole("menuitem", { name: "New routine…" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("Board only");
  await page.getByRole("button", { name: "Create and edit" }).click();
  await page.getByRole("link", { name: "Back to plan" }).click();

  await entryAction(page, "Tuesday", "Board only", "Remove from plan");
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByLabel("Also delete the routine")).toBeChecked();
  const removed = boardActionSettled(page);
  await dialog.getByRole("button", { name: "Remove" }).click();
  await expect(day(page, "Tuesday")).toContainText("Rest day");
  // The board updates optimistically: wait for the server before leaving the page.
  await removed;

  // The routine is gone from the customer's list.
  await page.goto(`${customer}?tab=routines`);
  await expect(page.getByText("Board only")).toHaveCount(0);
});

test("a plan needs a routine before it can be activated", async ({ physioPage: page }) => {
  const customer = await createCustomer(page, "Cy");
  await createPlanFor(page, customer, "Empty week");
  await chooseOption(page, page.getByRole("combobox", { name: "Status" }), "Active");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(
    page.getByText("Add at least one routine before activating the plan."),
  ).toBeVisible();
});

test("archiving a routine used by an active plan is blocked and names the plan", async ({
  physioPage: page,
}) => {
  const customer = await createCustomer(page, "Di");
  await createRoutineFor(page, customer, "Shared rehab");
  const routineUrl = page.url();
  await createPlanFor(page, customer, "Live plan");
  await addExisting(page, "Monday", "Shared rehab");
  await chooseOption(page, page.getByRole("combobox", { name: "Status" }), "Active");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

  await page.goto(routineUrl);
  await chooseOption(page, page.getByRole("combobox", { name: "Status" }), "Archived");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/used in an active weekly plan: Live plan/)).toBeVisible();
});

test("dragging a card to another day moves it (desktop)", async ({
  physioPage: page,
  isMobile,
}) => {
  test.skip(isMobile, "the drag handle is hidden on touch layouts; the menu covers moves");
  const customer = await createCustomer(page, "Eli");
  await createRoutineFor(page, customer, "Drag me");
  await createPlanFor(page, customer, "Drag week");
  await addExisting(page, "Monday", "Drag me");

  const handle = page.getByRole("button", { name: "Move Drag me" });
  // Mouse coordinates are viewport coordinates: bring the board into view before measuring it
  // (the plan form above it is tall enough to push the cards below a 720 px viewport).
  await handle.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  const to = await day(page, "Wednesday").boundingBox();
  if (!from || !to) throw new Error("layout not ready");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y + 20, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height - 20, { steps: 15 });
  const moved = boardActionSettled(page);
  await page.mouse.up();

  await expectDay(page, "Wednesday", ["Drag me"]);
  await expect(day(page, "Monday")).toContainText("Rest day");
  await moved;
  await page.reload();
  await expectDay(page, "Wednesday", ["Drag me"]);
});

test("a plan is renamed from its title and saves at once", async ({ physioPage: page }) => {
  const customer = await createCustomer(page, "Eli");
  await createPlanFor(page, customer, "Week A");
  // The details card has no name field any more: the title is the name.
  await expect(page.getByLabel("Name", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Rename plan" }).click();
  const input = page.getByRole("textbox", { name: "Plan name" });
  await input.fill("Week B");
  await input.press("Enter");
  await expect(page.getByRole("heading", { name: "Week B", level: 1 })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Week B", level: 1 })).toBeVisible();
});
