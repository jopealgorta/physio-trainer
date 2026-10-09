import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/auth";
import { openExercise } from "./helpers/routines";
import { chooseOption } from "./helpers/select";
import { expectMenuAction, menuAction } from "./helpers/page-actions";

const SHORT = "https://youtube.com/shorts/dQw4w9WgXcQ?si=e2e";
const VIDEO_A = "https://www.youtube.com/watch?v=aaaaaaaaaaa";
const VIDEO_B = "https://youtu.be/bbbbbbbbbbb";

async function openFilters(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole("button", { name: "Filters" }).click();
}

/**
 * Drives dnd-kit with the keyboard, waiting for its live announcement between keys. Moves the
 * second of two items to the top (the retry below is only safe for a two-item list). With
 * `persists`, also waits for the reorder Server Action (a POST to the page) to finish.
 */
async function moveUp(page: Page, handleName: string, item: string, persists = false) {
  const live = page.locator("[aria-live]").filter({ hasText: item });
  await page.getByRole("button", { name: handleName }).focus();
  await page.keyboard.press("Space");
  await expect(live.first()).toContainText(`${item} moved to position 2 of 2`);
  // dnd-kit attaches its key listener a tick after Space: repeat ArrowUp until it registers.
  await expect(async () => {
    await page.keyboard.press("ArrowUp");
    await expect(live.first()).toContainText(`${item} moved to position 1 of 2`, { timeout: 500 });
  }).toPass();
  const saved = persists
    ? page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/library"))
    : Promise.resolve(null);
  await page.keyboard.press("Space");
  await expect(live.first()).toContainText(`${item} dropped at position 1 of 2`);
  await saved;
}

/** Ticks categories in the exercise form's category list, then closes it. */
async function tickCategories(page: Page, names: string[]) {
  await page.getByLabel("Categories").click();
  const list = page.getByRole("dialog", { name: "Choose categories" });
  for (const name of names) await list.getByRole("checkbox", { name, exact: true }).check();
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
}

/** Picks a category in the library's tree (inside the filters sheet on phones). */
async function filterByCategory(page: Page, isMobile: boolean, name: RegExp) {
  await openFilters(page, isMobile);
  const tree = page.getByRole("navigation", { name: "Categories" }).filter({ visible: true });
  await tree.getByRole("link", { name }).click();
}

async function addCategory(page: Page, name: string) {
  const dialog = page.getByRole("dialog", { name: "Categories" });
  await dialog.getByLabel("Category name").first().fill(name);
  await dialog.getByRole("button", { name: "Add category" }).click();
  await expect(dialog.getByText(name, { exact: true })).toBeVisible();
}

test("a physio builds, finds, archives and restores an exercise", async ({
  physioPage: page,
  isMobile,
}) => {
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Build your exercise library" })).toBeVisible();

  // Categories: two top-level categories and a sub-category.
  await page.getByRole("button", { name: "Manage categories" }).click();
  const dialog = page.getByRole("dialog", { name: "Categories" });
  await addCategory(page, "Lower limb");
  await addCategory(page, "Mobility");
  await addCategory(page, "Upper limb");
  await dialog.getByRole("button", { name: "Add sub-category to Lower limb" }).click();
  await dialog.getByLabel("Category name").last().fill("Glutes");
  await dialog.getByLabel("Category name").last().press("Enter");
  await expect(dialog.getByText("Glutes")).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();

  // Exercise in a sub-category and another category, with an area and a YouTube Short.
  await page.getByRole("link", { name: "New exercise" }).first().click();
  await page.getByLabel("Name").fill("Single-leg bridge");
  await tickCategories(page, ["Lower limb › Glutes", "Mobility"]);
  await page.getByLabel("Instructions").fill("Push through the heel.\nHold at the top.");
  await page.getByRole("button", { name: "Body areas Choose body areas" }).click();
  const areas = page.getByRole("dialog", { name: "Body areas" });
  await areas.getByRole("radio", { name: "Back" }).click();
  await areas.getByRole("checkbox", { name: "Glute · Left" }).click();
  await expect(areas.getByRole("button", { name: "Glute", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await areas.getByRole("button", { name: "Done" }).click();
  await page.getByLabel("YouTube link").fill(SHORT);
  await page.getByRole("button", { name: "Add video" }).click();
  await expect(page.getByText("Cover", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create exercise" }).click();

  await openExercise(page, "Single-leg bridge");
  await expect(page.getByLabel("Name")).toHaveValue("Single-leg bridge");
  await expect(page.getByLabel("Categories")).toHaveText("Lower limb › Glutes, Mobility");
  await expect(page.getByRole("button", { name: "Body areas Glute" })).toBeVisible();

  // Saving an edit returns to the library; the exercise kept the change.
  await page.getByLabel("Instructions").fill("Push through the heel.\nSqueeze at the top.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await openExercise(page, "Single-leg bridge");
  await expect(page.getByLabel("Instructions")).toHaveValue(
    "Push through the heel.\nSqueeze at the top.",
  );

  // The card names its categories; each category it contains (or a parent of one) finds it.
  await page.goto("/library");
  const card = page.getByRole("link", { name: /Single-leg bridge/ });
  await expect(card).toContainText("Lower limb › Glutes");
  await expect(card).toContainText("Mobility");
  for (const name of [/^Mobility/, /^Lower limb/]) {
    await filterByCategory(page, isMobile, name);
    await expect(page).toHaveURL(/category=[0-9a-f-]{36}/);
    await expect(card).toBeVisible();
  }
  await filterByCategory(page, isMobile, /^Upper limb/);
  await expect(page.getByRole("heading", { name: "No exercises match" })).toBeVisible();
  await filterByCategory(page, isMobile, /^Uncategorised/);
  await expect(page).toHaveURL(/category=none/);
  await expect(page.getByRole("heading", { name: "No exercises match" })).toBeVisible();

  // Filters in the URL.
  await page.goto("/library");
  await expect(page.getByRole("link", { name: /Single-leg bridge/ })).toBeVisible();
  await openFilters(page, isMobile);
  await chooseOption(page, page.getByLabel("Body area").filter({ visible: true }), "Knee");
  await expect(page).toHaveURL(/area=knee/);
  if (isMobile) {
    // Escape would go to the still-closing Select popover, not the sheet.
    await expect(page.getByRole("listbox")).toBeHidden();
    await page.keyboard.press("Escape"); // close the filters sheet
  }
  await expect(page.getByRole("heading", { name: "No exercises match" })).toBeVisible();
  await page.goto("/library?area=glute");
  await expect(page.getByRole("link", { name: /Single-leg bridge/ })).toBeVisible();
  await page.goto("/library?q=BRIDGE");
  await expect(page.getByRole("link", { name: /Single-leg bridge/ })).toBeVisible();

  // Archive and restore.
  await page.getByRole("link", { name: /Single-leg bridge/ }).click();
  await menuAction(page, "Archive");
  await expect(page.getByText(/This exercise is archived/)).toBeVisible();
  await page.goto("/library?category=archived");
  await expect(page.getByRole("link", { name: /Single-leg bridge/ })).toBeVisible();
  await page.goto("/library");
  await expect(page.getByRole("link", { name: /Single-leg bridge/ })).toHaveCount(0);
  await page.goto("/library?category=archived");
  await page.getByRole("link", { name: /Single-leg bridge/ }).click();
  await menuAction(page, "Restore");
  await expect(page.getByText(/This exercise is archived/)).toHaveCount(0);
  await expectMenuAction(page, "Archive");
  await page.goto("/library");
  await expect(page.getByRole("link", { name: /Single-leg bridge/ })).toBeVisible();
});

test("reordering categories with the keyboard persists", async ({ physioPage: page, isMobile }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Manage categories" }).click();
  const dialog = page.getByRole("dialog", { name: "Categories" });
  await addCategory(page, "Alpha");
  await addCategory(page, "Beta");

  await moveUp(page, "Reorder Beta", "Beta", true);
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await openFilters(page, isMobile);
  const tree = page.getByRole("navigation", { name: "Categories" }).filter({ visible: true });
  await expect(tree.getByRole("link", { name: /^(Alpha|Beta)/ })).toHaveText([/^Beta/, /^Alpha/]);
});

test("reordering videos changes the cover", async ({ physioPage: page }) => {
  await page.goto("/library/new");
  await page.getByLabel("Name").fill("Two videos");
  await page.getByLabel("YouTube link").fill(VIDEO_A);
  await page.getByRole("button", { name: "Add video" }).click();
  // The second link is pasted but never added: leaving the box (blur) must keep it.
  await page.getByLabel("YouTube link").fill(VIDEO_B);
  await page.getByLabel("Name").focus();
  // Long video URLs must not widen the page (mobile).
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const covers = page.locator("img[src*='ytimg.com']");
  await expect(covers.first()).toHaveAttribute("src", /aaaaaaaaaaa/);
  await moveUp(page, "Reorder Video 2", "Video 2");
  await expect(covers.first()).toHaveAttribute("src", /bbbbbbbbbbb/);
  await page.getByRole("button", { name: "Create exercise" }).click();
  await openExercise(page, "Two videos");
  await expect(covers.first()).toHaveAttribute("src", /bbbbbbbbbbb/);
  await expect(covers.nth(1)).toHaveAttribute("src", /aaaaaaaaaaa/);
});

test("an unknown or malformed exercise id is not found", async ({ physioPage: page }) => {
  for (const id of ["not-a-uuid", crypto.randomUUID()]) {
    // Streamed behind loading.tsx: the not-found page (noindex), not a 404 status.
    await page.goto(`/library/${id}`);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.locator('meta[name="robots"][content="noindex"]').first()).toBeAttached();
  }
});

test("deleting an exercise returns to the library", async ({ physioPage: page }) => {
  await page.goto("/library/new");
  await page.getByLabel("Name").fill("Throwaway plank");
  await page.getByRole("button", { name: "Create exercise" }).click();
  await openExercise(page, "Throwaway plank");
  await menuAction(page, "Delete");
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete exercise" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole("link", { name: /Throwaway plank/ })).toHaveCount(0);
});

test("an exercise gets a brand new category without leaving the form", async ({
  physioPage: page,
}) => {
  await page.goto("/library/new");
  await page.getByLabel("Name").fill("Dead bug");
  await page.getByLabel("Instructions").fill("Keep the lower back down.");

  // A top-level category, then a sub-category inside it; each is ticked as it is created.
  await page.getByRole("button", { name: "New category" }).click();
  let dialog = page.getByRole("dialog", { name: "New category" });
  await dialog.getByLabel("Category name").fill("Core");
  await dialog.getByRole("button", { name: "Create category" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel("Categories")).toHaveText("Core");

  await page.getByRole("button", { name: "New category" }).click();
  dialog = page.getByRole("dialog", { name: "New category" });
  await dialog.getByLabel("Category name").fill("Anti-extension");
  await chooseOption(page, dialog.getByLabel("Inside"), "Core");
  await dialog.getByRole("button", { name: "Create category" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel("Categories")).toHaveText("Core, Core › Anti-extension");

  // A duplicate name is refused inside the dialog.
  await page.getByRole("button", { name: "New category" }).click();
  dialog = page.getByRole("dialog", { name: "New category" });
  await dialog.getByLabel("Category name").fill("Core");
  await dialog.getByLabel("Category name").press("Enter");
  await expect(dialog.getByRole("alert")).toHaveText(
    "There's already a category with this name here.",
  );
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  // The rest of the form survived, and the exercise saves with both new categories.
  await expect(page.getByLabel("Name")).toHaveValue("Dead bug");
  await expect(page.getByLabel("Instructions")).toHaveValue("Keep the lower back down.");
  await page.getByRole("button", { name: "Create exercise" }).click();
  await openExercise(page, "Dead bug");
  await expect(page.getByLabel("Categories")).toHaveText("Core, Core › Anti-extension");
});

test("saving or cancelling an exercise returns to the list it was opened from", async ({
  physioPage: page,
}) => {
  for (const name of ["Wall sit", "Wall angel"]) {
    await page.goto("/library/new");
    await page.getByLabel("Name").fill(name);
    await page.getByRole("button", { name: "Create exercise" }).click();
    await expect(page).toHaveURL(/\/library$/);
  }

  await page.goto("/library?q=angel");
  await page.getByRole("link", { name: /Wall angel/ }).click();
  await expect(page).toHaveURL(/\/library\/[0-9a-f-]{36}\?from=/);
  await page.getByLabel("Instructions").fill("Arms along the wall.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/library\?q=angel$/);
  await expect(page.getByRole("link", { name: /Wall sit/ })).toHaveCount(0);

  await page.getByRole("link", { name: /Wall angel/ }).click();
  await page.getByRole("link", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/library\?q=angel$/);
});
