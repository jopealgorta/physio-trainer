import { expect, test } from "./helpers/auth";
import {
  insertCustomer,
  insertCustomerLink,
  insertPlan,
  insertRoutine,
  insertWorkoutRoutine,
  isoWeekdayIn,
} from "./helpers/patient";
import { hasNoHorizontalOverflow } from "./helpers/routines";
import type { Page } from "@playwright/test";

/** The workout's bottom bar (current set, countdown, controls). */
const bar = (page: Page) => page.getByRole("region", { name: "Current exercise" });
/** The bar names the current exercise and the list highlights its row. */
async function expectCurrent(page: Page, name: string) {
  await expect(bar(page).getByText(name, { exact: true })).toBeVisible();
  await expect(page.locator('[aria-current="step"]')).toContainText(name);
}

test.describe("workout mode", () => {
  test("steps through a routine with a hold, a rest and a timed set", async ({ page, physio }) => {
    await page.clock.install({ time: new Date() });
    const customerId = await insertCustomer(physio.id);
    await insertWorkoutRoutine(physio.id, customerId);
    const link = await insertCustomerLink(physio, customerId);

    await page.goto(link.path);
    await page.getByRole("link", { name: "Start workout" }).click();
    await expect(page).toHaveURL(/\/workout\/[0-9a-f-]{36}$/);
    await expectCurrent(page, "Bridge");
    await expect(page.getByText("Exercise 1 of 2")).toBeVisible();
    await expect(page.getByText("Set 1 of 2")).toBeVisible();
    await expect(page.getByText("8 reps")).toBeVisible();

    // The hold is a helper: it counts down and the set is still waiting for the patient.
    await page.getByRole("button", { name: "Hold 5 s" }).click();
    await expect(page.getByRole("timer")).toHaveText("5");
    await page.clock.fastForward(5_000);
    await expect(page.getByText("Hold finished.")).toBeVisible();
    await expect(page.getByText("Set 1 of 2")).toBeVisible();

    await page.getByRole("button", { name: "Set done" }).click();
    await expect(page.getByText("Up next")).toBeVisible();
    await expect(page.getByRole("timer")).toHaveText("20");
    await expect(page.getByText("Set 2 of 2")).toBeVisible();

    // A reload resumes the same place.
    await page.reload();
    await expect(page.getByText("Set 2 of 2")).toBeVisible();
    await expect(page.getByText("Up next")).toBeVisible();

    // The tab is away for a minute: the rest has ended, and nothing started by itself.
    await page.clock.fastForward(60_000);
    await expect(page.getByRole("timer")).toHaveCount(0);
    await expect(page.getByText("Rest over. Next: Bridge.")).toBeVisible();
    await expect(page.getByText("Set 2 of 2")).toBeVisible();

    await page.getByRole("button", { name: "Set done" }).click();
    await page.getByRole("button", { name: "Skip" }).click();
    await expectCurrent(page, "Plank");
    await expect(page.getByText("Exercise 2 of 2")).toBeVisible();

    await page.getByRole("button", { name: "Start timer" }).click();
    await expect(page.getByRole("timer")).toHaveText("30");
    await page.clock.fastForward(30_000);
    // Finishing opens the session log sheet (spec 13); skip it and the finish screen is behind it.
    await expect(page.getByRole("dialog", { name: "How did it go?" })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("heading", { name: "Well done!" })).toBeVisible();

    await page.getByRole("button", { name: "Back to my plan" }).click();
    await expect(page).toHaveURL(new RegExp(`${link.path}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Hi Ana" })).toBeVisible();
  });

  test("asks before leaving a workout that is under way", async ({ page, physio }) => {
    const customerId = await insertCustomer(physio.id);
    await insertWorkoutRoutine(physio.id, customerId);
    const link = await insertCustomerLink(physio, customerId);
    await page.goto(link.path);
    await page.getByRole("link", { name: "Start workout" }).click();

    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Exit workout" }).click();
    await expect(page.getByRole("alertdialog", { name: "Leave this workout?" })).toBeVisible();
    await page.getByRole("button", { name: "Keep going" }).click();
    await expectCurrent(page, "Bridge");

    await page.getByRole("button", { name: "Exit workout" }).click();
    await page.getByRole("button", { name: "Leave" }).click();
    await expect(page).toHaveURL(new RegExp(`${link.path}$`));
  });

  test("holds the screen awake during the workout and lets go on exit", async ({
    page,
    physio,
  }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __wake: { requested: number; released: number } };
      w.__wake = { requested: 0, released: 0 };
      Object.defineProperty(navigator, "wakeLock", {
        configurable: true,
        value: {
          request: async () => {
            w.__wake.requested += 1;
            return {
              released: false,
              release: async () => void (w.__wake.released += 1),
              addEventListener: () => {},
            };
          },
        },
      });
    });
    const customerId = await insertCustomer(physio.id);
    await insertWorkoutRoutine(physio.id, customerId);
    const link = await insertCustomerLink(physio, customerId);
    await page.goto(link.path);
    // Client-side navigation keeps the stub's counters.
    await page.getByRole("link", { name: "Start workout" }).click();
    await expectCurrent(page, "Bridge");
    const wake = () =>
      page.evaluate(
        () => (window as unknown as { __wake: { requested: number; released: number } }).__wake,
      );
    await expect.poll(async () => (await wake()).requested).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Exit workout" }).click();
    await expect.poll(async () => (await wake()).released).toBeGreaterThan(0);
  });

  test("fits a 360 px phone with large targets, and keeps the bar in view", async ({
    page,
    physio,
  }) => {
    const customerId = await insertCustomer(physio.id);
    await insertWorkoutRoutine(physio.id, customerId);
    const link = await insertCustomerLink(physio, customerId);

    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(link.path);
    await page.getByRole("link", { name: "Start workout" }).click();
    const done = page.getByRole("button", { name: "Set done" });
    await expect(done).toBeVisible();
    expect(await hasNoHorizontalOverflow(page)).toBe(true);
    for (const name of [
      "Set done",
      "Hold 5 s",
      "Previous",
      "Next",
      "Log exercise",
      "Exit workout",
      "Sound on",
    ]) {
      const box = await page.getByRole("button", { name, exact: true }).boundingBox();
      expect(box!.height, name).toBeGreaterThanOrEqual(48);
      expect(box!.width, name).toBeGreaterThanOrEqual(48);
    }

    // A short screen: the list scrolls under the top bar while the bottom bar stays put.
    await page.setViewportSize({ width: 360, height: 420 });
    // The list's scroll box: the nearest ancestor of the current row that scrolls.
    const scrolled = await page.locator('[aria-current="step"]').evaluate((row) => {
      let box = row.parentElement;
      while (box && getComputedStyle(box).overflowY !== "auto") box = box.parentElement;
      if (!box || box.scrollHeight <= box.clientHeight) return false;
      box.scrollTo({ top: box.scrollHeight });
      return true;
    });
    expect(scrolled).toBe(true);
    await expect(page.getByRole("heading", { name: "Plank" })).toBeInViewport();
    const box = (await bar(page).boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(420);
    await expect(done).toBeInViewport();
    expect(await hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("a swipe moves to the next set", async ({ page, physio, browserName }) => {
    test.skip(browserName !== "chromium");
    const customerId = await insertCustomer(physio.id);
    await insertWorkoutRoutine(physio.id, customerId);
    const link = await insertCustomerLink(physio, customerId);
    await page.goto(link.path);
    await page.getByRole("link", { name: "Start workout" }).click();
    await expect(page.getByText("Set 1 of 2")).toBeVisible();

    const area = bar(page);
    const box = (await area.boundingBox())!;
    const y = box.y + 10;
    await page.mouse.move(box.x + 250, y);
    // Mouse swipes are ignored on purpose (only touch/pen swipe), so use touch events.
    await area.dispatchEvent("pointerdown", {
      pointerType: "touch",
      clientX: box.x + 250,
      clientY: y,
      bubbles: true,
    });
    await area.dispatchEvent("pointerup", {
      pointerType: "touch",
      clientX: box.x + 20,
      clientY: y,
      bubbles: true,
    });
    await expect(page.getByText("Set 2 of 2")).toBeVisible();
  });

  test("a plan routine opens from the day's card and carries its entry", async ({
    page,
    physio,
  }) => {
    const customerId = await insertCustomer(physio.id);
    const routineId = await insertRoutine(physio.id, customerId, "Gym today", {
      standalone: false,
      exercise: "Squat",
    });
    await insertPlan(physio.id, customerId, "Week", [
      { weekday: isoWeekdayIn(0), routineId, label: "Morning" },
    ]);
    const link = await insertCustomerLink(physio, customerId);
    await page.goto(link.path);
    await page.getByRole("link", { name: "Start workout" }).click();
    await expect(page).toHaveURL(new RegExp(`/workout/${routineId}\\?entry=[0-9a-f-]{36}$`));
    await expectCurrent(page, "Squat");
    await expect(page.getByText("Set 1 of 3")).toBeVisible();
  });

  test("is private and only opens routines the link can reach", async ({
    page,
    request,
    physio,
  }) => {
    const customerId = await insertCustomer(physio.id);
    const other = await insertCustomer(physio.id, { firstName: "Bea" });
    const mine = await insertWorkoutRoutine(physio.id, customerId);
    const theirs = await insertWorkoutRoutine(physio.id, other, "Someone else");
    const link = await insertCustomerLink(physio, customerId);

    const ok = await request.get(`${link.path}/workout/${mine}`);
    expect(ok.status()).toBe(200);
    expect(ok.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    expect(ok.headers()["referrer-policy"]).toBe("no-referrer");
    expect(ok.headers()["cache-control"]).toContain("no-store");

    expect((await page.goto(`${link.path}/workout/${theirs}`))?.status()).toBe(404);
    expect(
      (await page.goto(`${link.path}/workout/00000000-0000-4000-8000-000000000000`))?.status(),
    ).toBe(404);
    expect((await page.goto(`${link.path}/workout/not-an-id`))?.status()).toBe(404);
  });

  test("redirects a stale slug and respects revoked links and the PIN", async ({
    page,
    request,
    physio,
  }) => {
    const customerId = await insertCustomer(physio.id);
    const routineId = await insertWorkoutRoutine(physio.id, customerId);
    const link = await insertCustomerLink(physio, customerId);
    const stale = await request.get(
      `/old-handle/whatever-${link.code}/workout/${routineId}?entry=e1`,
      {
        maxRedirects: 0,
      },
    );
    expect(stale.status()).toBe(308);
    expect(stale.headers().location).toContain(`${link.path}/workout/${routineId}?entry=e1`);

    const protectedCustomer = await insertCustomer(physio.id, { firstName: "Pin" });
    const protectedRoutine = await insertWorkoutRoutine(physio.id, protectedCustomer);
    const locked = await insertCustomerLink(physio, protectedCustomer, { pin: "4821" });
    await page.goto(`${locked.path}/workout/${protectedRoutine}`);
    await expect(page.getByRole("heading", { name: "Enter your PIN" })).toBeVisible();
    await expect(page.getByText("Bridge")).toHaveCount(0);

    const revokedCustomer = await insertCustomer(physio.id, { firstName: "Gone" });
    const revokedRoutine = await insertWorkoutRoutine(physio.id, revokedCustomer);
    const revoked = await insertCustomerLink(physio, revokedCustomer, { revoked: true });
    await page.goto(`${revoked.path}/workout/${revokedRoutine}`);
    await expect(
      page.getByRole("heading", { name: "This link is no longer available" }),
    ).toBeVisible();
  });
});
