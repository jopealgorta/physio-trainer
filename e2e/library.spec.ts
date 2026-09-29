import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/auth";

const SHORT = "https://youtube.com/shorts/dQw4w9WgXcQ?si=e2e";
const VIDEO_A = "https://www.youtube.com/watch?v=aaaaaaaaaaa";
const VIDEO_B = "https://youtu.be/bbbbbbbbbbb";

async function openFilters(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole("button", { name: "Filters" }).click();
}

/** Drives dnd-kit with the keyboard, waiting for its live announcement between keys. */
async function moveUp(page: Page, handleName: string, item: string) {
  const live = page.locator("[aria-live]").filter({ hasText: item });
  await page.getByRole("button", { name: handleName }).focus();
  await page.keyboard.press("Space");
  await expect(live.first()).toContainText(`${item} moved to position 2 of 2`);
  // dnd-kit attaches its key listener a tick after Space: repeat ArrowUp until it registers.
  await expect(async () => {
    await page.keyboard.press("ArrowUp");
    await expect(live.first()).toContainText(`${item} moved to position 1 of 2`, { timeout: 500 });
  }).toPass();
  await page.keyboard.press("Space");
  await expect(live.first()).toContainText(`${item} dropped at position 1 of 2`);
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

  // Categories: a top-level category and a sub-category.
  await page.getByRole("button", { name: "Manage categories" }).click();
  const dialog = page.getByRole("dialog", { name: "Categories" });
  await addCategory(page, "Lower limb");
  await dialog.getByRole("button", { name: "Add sub-category to Lower limb" }).click();
  await dialog.getByLabel("Category name").last().fill("Glutes");
  await dialog.getByLabel("Category name").last().press("Enter");
  await expect(dialog.getByText("Glutes")).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();

  // Exercise with category, area, tags, prescription and a YouTube Short.
  await page.getByRole("link", { name: "New exercise" }).first().click();
  await page.getByLabel("Name").fill("Single-leg bridge");
  await page.getByLabel("Category").selectOption({ label: "Lower limb › Glutes" });
  await page.getByLabel("Instructions").fill("Push through the heel.\nHold at the top.");
  await page.getByRole("checkbox", { name: "Glute" }).check();
  await page.getByLabel("Tags").fill("Bodyweight");
  await page.getByLabel("Tags").press("Enter");
  await page.getByLabel("Tags").fill("beginner,");
  await page.getByLabel("Sets").fill("3");
  await page.getByLabel("Reps", { exact: true }).fill("12");
  await page.getByLabel("YouTube link").fill(SHORT);
  await page.getByRole("button", { name: "Add video" }).click();
  await expect(page.getByText("Cover", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create exercise" }).click();

  await expect(page).toHaveURL(/\/library\/[0-9a-f-]{36}$/);
  await page.reload();
  await expect(page.getByLabel("Name")).toHaveValue("Single-leg bridge");
  await expect(page.getByLabel("Sets")).toHaveValue("3");
  await expect(page.getByText("bodyweight")).toBeVisible();

  // Edit keeps typed values after saving.
  await page.getByLabel("Reps (max)").fill("15");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await expect(page.getByLabel("Reps (max)")).toHaveValue("15");

  // Filters in the URL.
  await page.goto("/library");
  await expect(page.getByRole("link", { name: /Single-leg bridge/ })).toBeVisible();
  await openFilters(page, isMobile);
  await page.getByLabel("Body area").filter({ visible: true }).selectOption({ label: "Knee" });
  await expect(page).toHaveURL(/area=knee/);
  if (isMobile) await page.keyboard.press("Escape"); // close the filters sheet
  await expect(page.getByRole("heading", { name: "No exercises match" })).toBeVisible();
  await page.goto("/library?area=glute&tag=beginner");
  await expect(page.getByRole("link", { name: /Single-leg bridge/ })).toBeVisible();
  await page.goto("/library?q=BRIDGE");
  await expect(page.getByRole("link", { name: /Single-leg bridge/ })).toBeVisible();

  // Archive and restore.
  await page.getByRole("link", { name: /Single-leg bridge/ }).click();
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText(/This exercise is archived/)).toBeVisible();
  await page.goto("/library?category=archived");
  await expect(page.getByRole("link", { name: /Single-leg bridge/ })).toBeVisible();
  await page.goto("/library");
  await expect(page.getByRole("link", { name: /Single-leg bridge/ })).toHaveCount(0);
  await page.goto("/library?category=archived");
  await page.getByRole("link", { name: /Single-leg bridge/ }).click();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText(/This exercise is archived/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Archive" })).toBeVisible();
  await page.goto("/library");
  await expect(page.getByRole("link", { name: /Single-leg bridge/ })).toBeVisible();
});

test("reordering categories with the keyboard persists", async ({ physioPage: page, isMobile }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Manage categories" }).click();
  const dialog = page.getByRole("dialog", { name: "Categories" });
  await addCategory(page, "Alpha");
  await addCategory(page, "Beta");

  await moveUp(page, "Reorder Beta", "Beta");
  await dialog.getByRole("button", { name: "Done" }).click();

  await page.reload();
  await openFilters(page, isMobile);
  const tree = page.getByRole("navigation", { name: "Categories" }).filter({ visible: true });
  await expect(tree.getByRole("link", { name: /^(Alpha|Beta)/ })).toHaveText([/^Beta/, /^Alpha/]);
});

test("reordering videos changes the cover", async ({ physioPage: page }) => {
  await page.goto("/library/new");
  await page.getByLabel("Name").fill("Two videos");
  for (const url of [VIDEO_A, VIDEO_B]) {
    await page.getByLabel("YouTube link").fill(url);
    await page.getByRole("button", { name: "Add video" }).click();
  }
  // Long video URLs must not widen the page (mobile).
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const covers = page.locator("img[src*='ytimg.com']");
  await expect(covers.first()).toHaveAttribute("src", /aaaaaaaaaaa/);
  await moveUp(page, "Reorder Video 2", "Video 2");
  await expect(covers.first()).toHaveAttribute("src", /bbbbbbbbbbb/);
  await page.getByRole("button", { name: "Create exercise" }).click();
  await expect(page).toHaveURL(/\/library\/[0-9a-f-]{36}$/);
  await page.reload();
  await expect(covers.first()).toHaveAttribute("src", /bbbbbbbbbbb/);
  await expect(covers.nth(1)).toHaveAttribute("src", /aaaaaaaaaaa/);
});

test("an unknown or malformed exercise id is a 404", async ({ physioPage: page }) => {
  for (const id of ["not-a-uuid", crypto.randomUUID()]) {
    const response = await page.goto(`/library/${id}`);
    expect(response?.status()).toBe(404);
  }
});

test("deleting an exercise returns to the library", async ({ physioPage: page }) => {
  await page.goto("/library/new");
  await page.getByLabel("Name").fill("Throwaway plank");
  await page.getByRole("button", { name: "Create exercise" }).click();
  await expect(page).toHaveURL(/\/library\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete exercise" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole("link", { name: /Throwaway plank/ })).toHaveCount(0);
});
