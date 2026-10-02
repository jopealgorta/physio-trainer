import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/auth";
import { routineTitle } from "./helpers/page-actions";
import {
  addExercises,
  closePicker,
  createExercise,
  createRoutine,
  hasNoHorizontalOverflow,
  openPicker,
} from "./helpers/routines";
import { chooseOption } from "./helpers/select";

// Version conflicts and the unsaved-changes guard are covered in routine-editor.spec.ts.

const handles = (page: Page) => page.getByRole("button", { name: /^Reorder / });
const handleNames = (page: Page) =>
  handles(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")));
const row = (page: Page, name: string) =>
  page.getByTestId("item-row").filter({ hasText: name, hasNot: page.getByTestId("item-row") });
const status = (page: Page) => page.getByTestId("save-status");

/**
 * Drives dnd-kit with the keyboard: pick up with Space, move down, drop. dnd-kit attaches its
 * key listener a tick after Space, so ArrowDown is repeated until the live announcement shows
 * it registered. Only safe for a list of two (a further ArrowDown cannot overshoot).
 */
async function moveDown(page: Page, item: string) {
  const live = page.locator("[id^='DndLiveRegion']").filter({ hasText: item });
  await page.getByRole("button", { name: `Reorder ${item}` }).focus();
  await page.keyboard.press("Space");
  // The pick-up announcement is replaced at once by the item's current position.
  await expect(live.first()).toContainText(`${item} moved to position 1 of 2`);
  await expect(async () => {
    await page.keyboard.press("ArrowDown");
    await expect(live.first()).toContainText(`${item} moved to position 2 of 2`, { timeout: 500 });
  }).toPass();
  await page.keyboard.press("Space");
  await expect(live.first()).toContainText(`${item} dropped at position 2 of 2`);
}

test("a physio builds a routine with per-set reps and a superset, and it persists", async ({
  physioPage: page,
  isMobile,
}) => {
  for (const name of ["Squat", "Lunge", "Bridge"]) await createExercise(page, name);
  await createRoutine(page, "Knee rehab A");

  await addExercises(page, isMobile, ["Squat", "Lunge", "Bridge"]);
  await expect(page.getByTestId("item-row")).toHaveCount(3);
  await expect(handles(page)).toHaveCount(3);

  // Squat: three sets (copied from the first), then per-set reps 12 / 10 / 8.
  const squat = row(page, "Squat");
  await squat.getByRole("button", { name: "Edit prescription" }).click();
  await squat.getByLabel("Set 1: Reps", { exact: true }).fill("12");
  await squat.getByRole("button", { name: "Add set" }).click();
  await squat.getByRole("button", { name: "Add set" }).click();
  await expect(squat.getByLabel("Set 3: Reps", { exact: true })).toHaveValue("12");
  await squat.getByLabel("Set 2: Reps", { exact: true }).fill("10");
  await squat.getByLabel("Set 3: Reps", { exact: true }).fill("8");
  await squat.getByLabel("Hold (s)", { exact: true }).fill("5");
  await squat.getByLabel("Rest (s)", { exact: true }).fill("60");
  await chooseOption(page, squat.getByRole("combobox", { name: "Side" }), "Left");
  await expect(squat).toContainText("12 · 10 · 8 · hold 5 s · rest 60 s · Left");

  // Superset of Lunge and Bridge, with a shared rest.
  await row(page, "Lunge").getByRole("button", { name: "Exercise options" }).click();
  await page.getByRole("menuitem", { name: "Group with next" }).click();
  const superset = page.getByRole("group", { name: "Superset" });
  await expect(superset.getByTestId("item-row")).toHaveCount(2);
  await superset.getByLabel("Rest after each round (s)").fill("45");

  await page.getByLabel("Sessions per week").fill("3");

  // Reorder collapsed blocks with the keyboard: Squat goes below the superset.
  await squat.getByRole("button", { name: "Hide prescription" }).click();
  await expect(handleNames(page)).resolves.toEqual([
    "Reorder Squat",
    "Reorder Superset",
    "Reorder Lunge",
    "Reorder Bridge",
  ]);
  await moveDown(page, "Squat");
  await expect
    .poll(() => handleNames(page))
    .toEqual(["Reorder Superset", "Reorder Lunge", "Reorder Bridge", "Reorder Squat"]);

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(status(page)).toHaveText("Saved");

  const assertPersisted = async () => {
    await expect(routineTitle(page, "Knee rehab A")).toBeVisible();
    await expect(page.getByLabel("Sessions per week")).toHaveValue("3");
    await expect
      .poll(() => handleNames(page))
      .toEqual(["Reorder Superset", "Reorder Lunge", "Reorder Bridge", "Reorder Squat"]);
    const group = page.getByRole("group", { name: "Superset" });
    await expect(group.getByTestId("item-row")).toHaveCount(2);
    await expect(group.getByLabel("Rest after each round (s)")).toHaveValue("45");
    await expect(row(page, "Squat")).toContainText("12 · 10 · 8 · hold 5 s · rest 60 s · Left");
    await expect(row(page, "Lunge")).toContainText("No prescription set");
  };
  await assertPersisted();

  await page.reload();
  await assertPersisted();
  await expect(status(page)).toHaveText("");

  // Expanded again, the per-set values are what was saved.
  await row(page, "Squat").getByRole("button", { name: "Edit prescription" }).click();
  for (const [n, reps] of [
    [1, "12"],
    [2, "10"],
    [3, "8"],
  ] as const) {
    await expect(row(page, "Squat").getByLabel(`Set ${n}: Reps`, { exact: true })).toHaveValue(
      reps,
    );
  }
});

test("a routine needs an exercise to be activated, and shows in the list once active", async ({
  physioPage: page,
  isMobile,
}) => {
  await createExercise(page, "Calf raise");
  await createRoutine(page, "Ankle plan");

  await chooseOption(page, page.getByRole("combobox", { name: "Status" }), "Active");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  // Next's route announcer is also role=alert, so match on the message.
  const alert = page.getByRole("alert").filter({ hasText: "Add at least one exercise" });
  await expect(alert).toHaveText("Add at least one exercise before activating.");

  await addExercises(page, isMobile, ["Calf raise"]);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(status(page)).toHaveText("Saved");
  await expect(alert).toBeHidden();

  await page.goto("/routines");
  const link = page.getByRole("link", { name: "Ankle plan" }).filter({ visible: true });
  await expect(link).toBeVisible();
  // The row is a table row on desktop and a list item on mobile.
  const row = page.locator("tr, li").filter({ has: link });
  await expect(row.getByText("Active", { exact: true })).toBeVisible();

  await page.goto("/routines?status=draft");
  await expect(page.getByText("No routines match these filters.")).toBeVisible();
  await expect(link).toHaveCount(0);
});

test("an exercise used by a routine cannot be deleted, and archiving hides it from the picker", async ({
  physioPage: page,
  isMobile,
}) => {
  for (const name of ["Step-up", "Plank"]) await createExercise(page, name);
  await createRoutine(page, "Strength block");
  await addExercises(page, isMobile, ["Step-up", "Plank"]);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(status(page)).toHaveText("Saved");
  const routineUrl = page.url();

  await page.goto("/library");
  await page.getByRole("link", { name: /Step-up/ }).click();
  await expect(page).toHaveURL(/\/library\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete exercise" }).click();
  await expect(
    page.getByText(
      "This exercise is used in a routine, so it can't be deleted. Archive it instead.",
    ),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/library\/[0-9a-f-]{36}$/);

  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page.getByText(/This exercise is archived/)).toBeVisible();

  await page.goto(routineUrl);
  await expect(row(page, "Step-up").getByText("Archived", { exact: true })).toBeVisible();
  await expect(row(page, "Plank").getByText("Archived", { exact: true })).toHaveCount(0);

  const picker = await openPicker(page, isMobile);
  // An exercise can show under both "Recent" and the list.
  await expect(picker.getByRole("button", { name: "Plank", exact: true }).first()).toBeVisible();
  await expect(picker.getByRole("button", { name: "Step-up", exact: true })).toHaveCount(0);
  // Searching for it finds nothing either.
  await picker.getByRole("searchbox", { name: "Search exercises" }).fill("Step");
  await expect(picker.getByTestId("picker-count")).toHaveText("0 exercises");
  await expect(picker.getByText("No exercises match.")).toBeVisible();
  await closePicker(page, isMobile);
});

test("the editor fits a phone and the picker opens as a sheet", async ({
  physioPage: page,
  isMobile,
}) => {
  test.skip(!isMobile, "phone layout");
  const long =
    "Standing single-leg Romanian deadlift with contralateral reach and a slow controlled eccentric";
  await createExercise(page, long);
  await createRoutine(page, "Long names");

  // Picker: a bottom sheet from "Add exercises", closed with the localized Done button.
  await expect(page.getByRole("complementary")).toBeHidden();
  const sheet = await openPicker(page, isMobile);
  await expect(sheet.getByRole("button", { name: "Close" })).toHaveCount(0);
  expect(await hasNoHorizontalOverflow(page)).toBe(true);
  await sheet.getByRole("button", { name: long, exact: true }).click();
  await closePicker(page, isMobile);

  const item = row(page, "Standing single-leg");
  await expect(item).toBeVisible();
  await item.getByRole("button", { name: "Edit prescription" }).click();
  for (let i = 0; i < 2; i++) await item.getByRole("button", { name: "Add set" }).click();
  await item.getByLabel("Set 1: Reps", { exact: true }).fill("12");
  await item
    .getByLabel("Set 1: Load", { exact: true })
    .fill("Resistance band, heavy, doubled over");
  await item.getByLabel("Notes", { exact: true }).fill("x".repeat(200));
  await expect(item.getByLabel("Set 3: Reps", { exact: true })).toBeVisible();
  expect(await hasNoHorizontalOverflow(page)).toBe(true);
});

test("on a phone the routine page opens with one compact row: back, Save, More actions", async ({
  physioPage: page,
  isMobile,
}) => {
  test.skip(!isMobile, "phone layout");
  await createRoutine(page, "Compact header");

  const back = page.getByRole("link", { name: "Back to routines" });
  const save = page.getByRole("button", { name: "Save", exact: true });
  const more = page.getByRole("button", { name: "More actions" });
  const middle = async (locator: typeof back) => {
    const box = (await locator.boundingBox())!;
    return box.y + box.height / 2;
  };
  const row = await middle(more);
  expect(Math.abs((await middle(back)) - row)).toBeLessThan(4);
  expect(Math.abs((await middle(save)) - row)).toBeLessThan(4);
  // The title comes right under it, as a heading rather than an input.
  const title = routineTitle(page, "Compact header");
  expect((await title.boundingBox())!.y).toBeGreaterThan(row);
  await expect(page.getByRole("textbox", { name: "Routine name" })).toHaveCount(0);

  // The labelled buttons give way to the menu.
  for (const name of ["Export", "Share routine", "History", "Save as template…"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeHidden();
  }
  await more.click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem")).toHaveText([
    "Share routine",
    "Download PDF",
    "Download Excel",
    "History",
    "Save as template…",
  ]);
  await expect(
    menu.getByRole("menuitemcheckbox", { name: "Include tracking boxes" }),
  ).toBeVisible();
  await menu.getByRole("menuitem", { name: "History" }).click();
  await expect(page.getByRole("dialog", { name: "Version history" })).toBeVisible();
  await page.keyboard.press("Escape");
  // History's own button is hidden here: focus comes back to the menu's.
  await expect(more).toBeFocused();

  await more.click();
  await page.getByRole("menuitem", { name: "Share routine" }).click();
  const share = page.getByRole("dialog", { name: "Share this routine" });
  await expect(share).toBeVisible();
  await expect(share).toHaveAttribute("data-presentation", "sheet");
  await page.keyboard.press("Escape");
  await expect(share).toBeHidden();
  await expect(more).toBeFocused();
  expect(await hasNoHorizontalOverflow(page)).toBe(true);
});

test("the phone picker marks, counts and confirms picks, and swipes away", async ({
  physioPage: page,
  isMobile,
}) => {
  test.skip(!isMobile, "phone layout");
  await createExercise(page, "Squat");
  await createExercise(page, "Lunge");
  await createRoutine(page, "Feedback");

  const sheet = await openPicker(page, isMobile);
  const squat = sheet.getByRole("button", { name: "Squat", exact: true }).first();
  await squat.click();
  await expect(sheet.getByTestId("picker-flash")).toHaveText("Added Squat");
  await expect(sheet.getByRole("button", { name: "1 added · Done" })).toBeVisible();
  await squat.click();
  await sheet.getByRole("button", { name: "Lunge", exact: true }).first().click();
  await expect(sheet.getByTestId("picker-flash")).toHaveText("Added Lunge");
  await expect(sheet.getByRole("button", { name: "3 added · Done" })).toBeVisible();
  await expect(squat).toHaveAttribute("data-added", "true");
  await expect(squat.getByText("×2")).toBeVisible();
  // The confirmation goes after a moment; the count stays.
  await expect(sheet.getByTestId("picker-flash")).toBeHidden({ timeout: 5000 });

  // Dragged down from its top, the sheet closes, and the routine holds the three picks.
  const box = (await sheet.boundingBox())!;
  const x = box.x + box.width / 2;
  await page.mouse.move(x, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(x, box.y + box.height * 0.8, { steps: 12 });
  await page.mouse.up();
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId("item-row")).toHaveCount(3);
});
