import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/auth";
import { formStatus } from "./helpers/form";
import { nameNewRoutine, renamePlan, routineTitle } from "./helpers/page-actions";
import { addExercises, createExercise, hasNoHorizontalOverflow } from "./helpers/routines";
import { chooseOption } from "./helpers/select";

/** `YYYY-MM-DD` of today plus `days` in UTC (the test physio's time zone). */
const dateIn = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

async function createCustomer(page: Page, name: string) {
  await page.goto("/customers/new");
  await page.getByLabel("First name").fill(name);
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname;
}

async function createRoutineFor(page: Page, customerPath: string, name: string) {
  await page.goto(`${customerPath}?tab=routines`);
  await page.getByRole("button", { name: "New routine" }).click();
  await expect(page).toHaveURL(/\/routines\/[0-9a-f-]{36}$/);
  await nameNewRoutine(page, name);
}

/** Sets the phase through the popover on a routine or plan page. */
async function setPhase(page: Page, label: string, startsOn: string, endsOn = "") {
  await page.getByRole("button", { name: /^(Set|Edit) phase$/ }).click();
  await page.getByLabel("Phase name").fill(label);
  await page.getByLabel("Starts on").fill(startsOn);
  await page.getByLabel("Ends on (optional)").fill(endsOn);
  await popover(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByLabel("Phase name")).toBeHidden();
}

/** The edit popover (Radix renders it as a dialog). */
const popover = (page: Page) => page.getByRole("dialog");
const phaseBar = (page: Page) => page.getByRole("region", { name: "Phase", exact: true });

test("a physio copies a routine into the next phase and sees the timeline", async ({
  physioPage: page,
}, testInfo) => {
  const isMobile = testInfo.project.name === "mobile";
  await createExercise(page, "Squat");
  const customer = await createCustomer(page, "Ana");
  await createRoutineFor(page, customer, "Knee rehab");
  await addExercises(page, isMobile, ["Squat"]);
  await chooseOption(page, page.getByRole("combobox", { name: "Status" }), "Active");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  const firstUrl = page.url();

  // A window that is already running reads as current.
  await expect(phaseBar(page).getByText("No phase set")).toBeVisible();
  await setPhase(page, "Phase 1", dateIn(-7));
  await expect(phaseBar(page).getByText("Phase 1")).toBeVisible();
  await expect(phaseBar(page).getByText("Current")).toBeVisible();

  // A reversed window is refused before it reaches the server.
  await page.getByRole("button", { name: "Edit phase" }).click();
  // On a phone the popover is a bottom sheet; on desktop it floats and stays on screen.
  await expect(popover(page)).toHaveAttribute("data-presentation", isMobile ? "sheet" : "popover");
  const box = (await popover(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.getByLabel("Ends on (optional)").fill(dateIn(-9));
  await popover(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("The end date can't be before the start date.")).toBeVisible();
  await page.keyboard.press("Escape");

  // The next phase defaults to "Phase 2", starting tomorrow, ending this one today.
  await page.getByRole("button", { name: "Copy into next phase" }).click();
  const dialog = page.getByRole("dialog", { name: "Copy routine into next phase" });
  await expect(dialog.getByLabel("Phase name")).toHaveValue("Phase 2");
  await expect(dialog.getByLabel("Starts on")).toHaveValue(dateIn(1));
  await dialog.getByRole("button", { name: "Create next phase" }).click();

  // The copy opens, scheduled for tomorrow, with its own exercises.
  await expect(page).not.toHaveURL(firstUrl);
  await expect(page).toHaveURL(/\/routines\/[0-9a-f-]{36}$/);
  await expect(phaseBar(page).getByText("Phase 2")).toBeVisible();
  await expect(phaseBar(page).getByText("Upcoming")).toBeVisible();
  await expect(page.getByText("Squat").first()).toBeVisible();

  // The original now ends today and is still the current phase.
  await page.goto(firstUrl);
  await expect(phaseBar(page).getByText("Current")).toBeVisible();

  // The customer's Routines tab shows the two phases as a timeline, current one highlighted.
  await page.goto(`${customer}?tab=routines`);
  const timeline = page.getByRole("list", { name: "Phases" });
  const links = timeline.getByRole("link");
  await expect(links).toHaveCount(2);
  await expect(links.nth(0)).toContainText("Phase 1");
  await expect(links.nth(0)).toHaveAttribute("aria-current", "step");
  await expect(links.nth(1)).toContainText("Phase 2");
  await expect(links.nth(1)).toContainText("Upcoming");
  expect(await hasNoHorizontalOverflow(page)).toBe(true);
});

test("a physio copies a plan into the next phase with independent routines", async ({
  physioPage: page,
}) => {
  const customer = await createCustomer(page, "Ana");
  await createRoutineFor(page, customer, "Knee rehab A");

  await page.goto(`${customer}?tab=plans`);
  await page.getByRole("button", { name: "New plan" }).click();
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}$/);
  await renamePlan(page, "Week 1");
  const planUrl = page.url();

  await page.getByRole("button", { name: "Add routine to Monday" }).click();
  await page.getByRole("menuitem", { name: "Existing routine…" }).click();
  const add = page.getByRole("dialog", { name: "Add an existing routine to Monday" });
  await chooseOption(page, add.getByRole("combobox", { name: "Routine" }), /^Knee rehab A/);
  await add.getByRole("button", { name: "Add to plan" }).click();
  await expect(add).toBeHidden();
  const monday = page.getByRole("region", { name: "Monday", exact: true });
  const original = await monday.locator("a[href^='/routines/']").first().getAttribute("href");

  await chooseOption(page, page.getByRole("combobox", { name: "Status" }), "Active");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(formStatus(page).filter({ hasText: /^Saved$/ })).toBeVisible();

  await setPhase(page, "Phase 1", dateIn(-7));
  await expect(phaseBar(page).getByText("Current")).toBeVisible();

  await page.getByRole("button", { name: "Copy into next phase" }).click();
  const dialog = page.getByRole("dialog", { name: "Copy plan into next phase" });
  await dialog.getByRole("button", { name: "Create next phase" }).click();

  // The new plan has the same week, but its routine is a copy of its own.
  await expect(page).not.toHaveURL(planUrl);
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}$/);
  await expect(phaseBar(page).getByText("Phase 2")).toBeVisible();
  await expect(phaseBar(page).getByText("Upcoming")).toBeVisible();
  const copied = await page
    .getByRole("region", { name: "Monday", exact: true })
    .locator("a[href^='/routines/']")
    .first();
  await expect(copied).toHaveText("Knee rehab A");
  expect(await copied.getAttribute("href")).not.toBe(original);

  // The customer's Plans tab shows the two phases as a timeline.
  await page.goto(`${customer}?tab=plans`);
  const links = page.getByRole("list", { name: "Phases" }).getByRole("link");
  await expect(links).toHaveCount(2);
  await expect(links.nth(0)).toContainText("Phase 1");
  await expect(links.nth(1)).toContainText("Phase 2");
  expect(await hasNoHorizontalOverflow(page)).toBe(true);
});

test("a routine inside a plan has no phase controls of its own", async ({ physioPage: page }) => {
  const customer = await createCustomer(page, "Ana");
  await page.goto(`${customer}?tab=plans`);
  await page.getByRole("button", { name: "New plan" }).click();
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}$/);
  await renamePlan(page, "Week 1");
  await page.getByRole("button", { name: "Add routine to Monday" }).click();
  await page.getByRole("menuitem", { name: "New routine", exact: true }).click();
  await expect(page).toHaveURL(/\/routines\/[0-9a-f-]{36}\?plan=/);
  await nameNewRoutine(page, "Gym upper");
  await expect(routineTitle(page, "Gym upper")).toBeVisible();
  await expect(phaseBar(page)).toHaveCount(0);
});
