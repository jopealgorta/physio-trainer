import type { Page } from "@playwright/test";

import { expect, signIn, test } from "./helpers/auth";
import {
  activateRoutines,
  insertCustomer,
  insertCustomerLink,
  insertDayNote,
  insertPlan,
  insertRoutine,
} from "./helpers/patient";
import { addExercises, hasNoHorizontalOverflow } from "./helpers/routines";

/**
 * Picks a rating on a scale (inline log or session sheet), found by its group name (native
 * radios: click the label).
 */
const rate = (page: Page, group: string, value: number) =>
  page
    .getByRole("group", { name: group })
    .locator("label")
    .filter({ hasText: new RegExp(`^${value}$`) })
    .click();

test.describe("patient page v2", () => {
  test("a patient logs one exercise and the physio sees it as new", async ({ page, physio }) => {
    const customerId = await insertCustomer(physio.id, { firstName: "Ana" });
    await insertRoutine(physio.id, customerId, "Knee rehab", { exercise: "Squat" });
    const link = await insertCustomerLink(physio, customerId);

    await page.goto(link.path);
    await expect(page.getByRole("heading", { level: 4, name: /Squat/ })).toBeVisible();
    const toggle = page.getByRole("button", { name: "Log Squat" });
    await toggle.click();
    const region = page.getByRole("region", { name: "How did Squat go?" });
    await expect(region).toBeVisible();
    await region.getByLabel("Set 1 weight in kg").fill("20");
    await region.getByLabel("Set 2 weight in kg").fill("22,5");
    await region.getByLabel("Set 3 weight in kg").fill("25");
    await rate(page, "Effort (RPE)", 6);
    await region.getByLabel("Comment (optional)").fill("Felt fine");
    await region.getByLabel("Comment (optional)").blur();
    await expect(region.getByText("Saved", { exact: true })).toBeVisible();
    const logged = page.getByRole("list", { name: "Logged" });
    await expect(logged).toContainText("20 · 22.5 · 25 kg");
    await expect(logged).toContainText("RPE 6");

    // At phone width an open panel must not overflow the page.
    await page.setViewportSize({ width: 360, height: 740 });
    expect(await hasNoHorizontalOverflow(page)).toBe(true);

    await page.reload();
    await page.getByRole("button", { name: "Log Squat" }).click();
    const reopened = page.getByRole("region", { name: "How did Squat go?" });
    await expect(reopened.getByLabel("Set 1 weight in kg")).toHaveValue("20");
    await expect(reopened.getByLabel("Set 2 weight in kg")).toHaveValue("22.5");
    await expect(reopened.getByLabel("Set 3 weight in kg")).toHaveValue("25");
    await expect(reopened.getByLabel("Comment (optional)")).toHaveValue("Felt fine");

    await signIn(page, physio, `/customers/${customerId}?tab=activity`);
    const section = page.getByRole("region", { name: "Exercise log" });
    await expect(section).toContainText("20 · 22.5 · 25 kg");
    await expect(section).toContainText("Felt fine");
    await expect(section.getByText("New", { exact: true })).toBeVisible();
  });

  test("an RPE on a session shows in the Activity comments feed", async ({ page, physio }) => {
    const customerId = await insertCustomer(physio.id, { firstName: "Ana" });
    await insertRoutine(physio.id, customerId, "Knee rehab");
    const link = await insertCustomerLink(physio, customerId);

    await page.goto(link.path);
    await page.getByRole("button", { name: "Mark as done" }).click();
    const dialog = page.getByRole("dialog", { name: "How did it go?" });
    await rate(page, "Effort (RPE)", 7);
    await dialog.getByLabel("Comment (optional)").fill("Tough but fine");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();

    await signIn(page, physio, `/customers/${customerId}?tab=activity`);
    const feed = page.getByRole("region", { name: "Comments" });
    await expect(feed).toContainText("Tough but fine");
    await expect(feed).toContainText("RPE 7");
  });

  test("a day note edited on the plan board reaches the patient", async ({ page, physio }) => {
    const customerId = await insertCustomer(physio.id, { firstName: "Ana" });
    const routineId = await insertRoutine(physio.id, customerId, "Gym", {
      standalone: false,
    });
    const planId = await insertPlan(physio.id, customerId, "Week 1", [{ weekday: 3, routineId }]);
    const link = await insertCustomerLink(physio, customerId, { weeklyPlanId: planId });

    await signIn(page, physio, `/plans/${planId}`);
    // The button is server-rendered: a click before hydration opens nothing, so retry until it does.
    const noteDialog = page.getByRole("dialog", { name: "Note for Wednesday" });
    await expect(async () => {
      await page.getByRole("button", { name: "Edit note for Wednesday" }).click();
      await expect(noteDialog).toBeVisible({ timeout: 1000 });
    }).toPass();
    await noteDialog.getByRole("textbox").fill("Easy day");
    const saved = page.waitForResponse(
      (r) => r.request().method() === "POST" && !!r.request().headers()["next-action"] && r.ok(),
    );
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await saved;

    await page.context().clearCookies();
    await page.goto(`${link.path}?day=3`);
    await expect(page.getByText("Easy day")).toBeVisible();
  });

  test("a patient sees a day note seeded in the database", async ({ page, physio }) => {
    const customerId = await insertCustomer(physio.id, { firstName: "Ana" });
    const routineId = await insertRoutine(physio.id, customerId, "Gym", { standalone: false });
    const planId = await insertPlan(physio.id, customerId, "Week 1", [{ weekday: 3, routineId }]);
    await insertDayNote(physio.id, planId, 3, "Rest your knee");
    const link = await insertCustomerLink(physio, customerId, { weeklyPlanId: planId });

    await page.goto(`${link.path}?day=3`);
    await expect(page.getByText("Rest your knee")).toBeVisible();
  });

  test("an aerobic exercise reads as sets of distance at a pace", async ({
    physioPage: page,
    physio,
    isMobile,
  }) => {
    await page.goto("/library/new");
    await page.getByLabel("Name").fill("Rowing");
    await page.getByRole("radio", { name: "Aerobic" }).click();
    await page.getByRole("button", { name: "Create exercise" }).click();
    await expect(page).toHaveURL(/\/library\/[0-9a-f-]{36}$/);

    const customerId = await insertCustomer(physio.id, { firstName: "Ana" });
    await page.goto(`/customers/${customerId}?tab=routines`);
    await page.getByRole("button", { name: "New routine" }).click();
    await page.getByRole("dialog").getByLabel("Name").fill("Cardio");
    await page.getByRole("button", { name: "Create routine" }).click();
    await expect(page).toHaveURL(/\/routines\/[0-9a-f-]{36}$/);
    await addExercises(page, isMobile, ["Rowing"]);
    const row = page.getByTestId("item-row").filter({ hasText: "Rowing" });
    await row.getByRole("button", { name: "Edit prescription" }).click();
    await row.getByLabel("Set 1: Distance (km)", { exact: true }).fill("0,5");
    await row.getByLabel("Set 1: Intensity", { exact: true }).fill("2:00/500m");
    for (let i = 0; i < 3; i++) await row.getByRole("button", { name: "Add set" }).click();
    await expect(row).toContainText("4 × 500 m · 2:00/500m");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByTestId("save-status")).toHaveText("Saved");

    // Routines created through the UI start as drafts, which the patient page does not show.
    await activateRoutines(customerId);
    const link = await insertCustomerLink(physio, customerId);
    await page.context().clearCookies();
    await page.goto(link.path);
    await expect(page.getByText("4 × 500 m · 2:00/500m")).toBeVisible();
  });

  test("a thumbnail opens the exercise detail with a video frame", async ({ page, physio }) => {
    const customerId = await insertCustomer(physio.id, { firstName: "Ana" });
    await insertRoutine(physio.id, customerId, "Knee rehab", {
      exercise: "Squat",
      videoId: "dQw4w9WgXcQ",
    });
    const link = await insertCustomerLink(physio, customerId);

    await page.goto(link.path);
    await page.getByRole("button", { name: "Watch Squat" }).click();
    const detail = page.getByRole("dialog", { name: "Squat" });
    await expect(detail.locator("iframe")).toBeVisible();
  });
});
