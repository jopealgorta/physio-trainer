import { expect, signIn, test } from "./helpers/auth";
import {
  insertCustomer,
  insertCustomerLink,
  insertRoutine,
  insertWorkoutRoutine,
} from "./helpers/patient";

/** Picks a rating on a scale of the log sheet, found by its group name (native radios, visually hidden: click their label). */
const rate = (page: import("@playwright/test").Page, group: string, value: number) =>
  page
    .getByRole("group", { name: group })
    .locator("label")
    .filter({ hasText: new RegExp(`^${value}$`) })
    .click();

test.describe("session logging", () => {
  test("a patient logs a session and the physio's dashboard follows", async ({ page, physio }) => {
    const customerId = await insertCustomer(physio.id, { firstName: "Ana" });
    await insertRoutine(physio.id, customerId, "Knee rehab");
    const link = await insertCustomerLink(physio, customerId);

    // The patient marks the routine as done with pain 6 and a comment.
    await page.goto(link.path);
    await page.getByRole("button", { name: "Mark as done" }).click();
    const dialog = page.getByRole("dialog", { name: "How did it go?" });
    await rate(page, "Pain (optional)", 6);
    await dialog.getByLabel("Comment (optional)").fill("A bit pinchy on the stairs");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Done", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Done", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();

    // Pain 6 is recent activity, not an alarm.
    await signIn(page, physio);
    await expect(page).toHaveURL(/\/dashboard$/);
    const recent = page.getByRole("region", { name: "Recently active" });
    await expect(recent.getByRole("link", { name: /Ana/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Needs attention" })).toContainText(
      "Nobody needs attention right now.",
    );
    await expect(page.getByRole("region", { name: "New comments" })).toContainText(
      "A bit pinchy on the stairs",
    );

    // The patient edits the same log to pain 8: now Ana needs attention.
    await page.context().clearCookies();
    await page.goto(link.path);
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("dialog").getByLabel("Comment (optional)")).toHaveValue(
      "A bit pinchy on the stairs",
    );
    await rate(page, "Pain (optional)", 8);
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    await signIn(page, physio);
    const attention = page.getByRole("region", { name: "Needs attention" });
    await expect(attention.getByRole("link", { name: /Ana/ })).toBeVisible();
    await expect(attention).toContainText("Pain 8/10 in the last 7 days");

    // The row opens the customer's Activity tab: calendar, pain chart and the comment, marked
    // as new for this visit (even once marking it seen re-rendered the tab), then seen.
    const markedSeen = page.waitForResponse(
      (r) => r.request().method() === "POST" && !!r.request().headers()["next-action"],
    );
    await attention.getByRole("link", { name: /Ana/ }).click();
    await markedSeen;
    await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}\?tab=activity$/);
    await expect(page.getByRole("heading", { name: "Sessions by day" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pain over time" })).toBeVisible();
    await expect(
      page.getByRole("img", {
        name: /Pain over time \(All routines\): 1 rating, latest 8 out of 10/,
      }),
    ).toBeVisible();
    const feed = page.getByRole("region", { name: "Comments" });
    await expect(feed).toContainText("A bit pinchy on the stairs");
    await expect(feed.getByText("New", { exact: true })).toBeVisible();

    await expect
      .poll(async () => {
        await page.goto("/dashboard");
        return page.getByRole("region", { name: "New comments" }).textContent();
      })
      .toContain("No new comments.");
  });

  test("a patient logs one exercise with a decimal-comma weight, then clears it", async ({
    page,
    physio,
  }) => {
    const customerId = await insertCustomer(physio.id, { firstName: "Ana" });
    await insertRoutine(physio.id, customerId, "Knee rehab", { exercise: "Squat" });
    const link = await insertCustomerLink(physio, customerId);

    await page.goto(link.path);
    await page.getByRole("button", { name: "Log Squat" }).click();
    const region = page.getByRole("region", { name: "How did Squat go?" });
    // A single routine: today or yesterday, like the routine's own log.
    await expect(region.getByText("Yesterday")).toBeVisible();
    const set1 = region.getByLabel("Set 1 weight in kg");
    await set1.fill("12,5");
    await set1.blur();
    await expect(region.getByText("Saved", { exact: true })).toBeVisible();
    const logged = page.getByRole("list", { name: "Logged" });
    await expect(logged).toContainText("12.5 kg");

    await page.reload();
    await expect(page.getByRole("list", { name: "Logged" })).toContainText("12.5 kg");
    await page.getByRole("button", { name: "Log Squat" }).click();
    const reopened = page.getByRole("region", { name: "How did Squat go?" });
    await expect(reopened.getByLabel("Set 1 weight in kg")).toHaveValue("12.5");
    await reopened.getByLabel("Set 1 weight in kg").fill("");
    await reopened.getByLabel("Set 1 weight in kg").blur();
    await expect(reopened.getByText("Saved", { exact: true })).toBeVisible();
    await expect(page.getByRole("list", { name: "Logged" })).toHaveCount(0);
  });

  test("the physio previewing a link cannot log a session", async ({ page, physio }) => {
    const customerId = await insertCustomer(physio.id);
    await insertRoutine(physio.id, customerId, "Knee rehab");
    const link = await insertCustomerLink(physio, customerId);

    await signIn(page, physio);
    await page.goto(link.path);
    await expect(page.getByRole("heading", { name: "Knee rehab", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark as done" })).toHaveCount(0);
  });

  test("finishing a workout opens the log sheet", async ({ page, physio }) => {
    const customerId = await insertCustomer(physio.id);
    await insertWorkoutRoutine(physio.id, customerId);
    const link = await insertCustomerLink(physio, customerId);

    await page.goto(link.path);
    await page.getByRole("link", { name: "Start workout" }).click();
    // Step with "Next" until the finish screen opens the log sheet by itself.
    const dialog = page.getByRole("dialog", { name: "How did it go?" });
    for (let i = 0; i < 6 && !(await dialog.isVisible()); i++) {
      await page.getByRole("button", { name: "Next" }).click();
    }
    await expect(dialog).toBeVisible();
    await expect(page.getByText("Well done!")).toBeVisible();

    await rate(page, "Pain (optional)", 2);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { name: "Well done!" })).toBeVisible();
    await expect(page.getByText("Done", { exact: true })).toBeVisible();

    // Back on the page the routine shows as done today.
    await page.getByRole("button", { name: "Back to my plan" }).click();
    await expect(page.getByText("Done", { exact: true })).toBeVisible();
  });

  test("Start workout and Mark as done share a row of equal buttons on a phone", async ({
    page,
    physio,
    isMobile,
  }) => {
    test.skip(!isMobile, "phone layout");
    const customerId = await insertCustomer(physio.id);
    await insertWorkoutRoutine(physio.id, customerId);
    const link = await insertCustomerLink(physio, customerId);

    await page.goto(link.path);
    const start = await page.getByRole("link", { name: "Start workout" }).boundingBox();
    const done = await page.getByRole("button", { name: "Mark as done" }).boundingBox();
    expect(start && done).toBeTruthy();
    expect(Math.round(start!.y)).toBe(Math.round(done!.y));
    expect(Math.round(start!.height)).toBe(48);
    expect(Math.round(done!.height)).toBe(48);
    expect(Math.abs(start!.width - done!.width)).toBeLessThanOrEqual(1);
  });
});
