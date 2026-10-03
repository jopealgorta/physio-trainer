import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/auth";
import { chooseOption } from "./helpers/select";

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

  // Exercise with category, area, tags and a YouTube Short.
  await page.getByRole("link", { name: "New exercise" }).first().click();
  await page.getByLabel("Name").fill("Single-leg bridge");
  await chooseOption(page, page.getByLabel("Category"), "Lower limb › Glutes");
  await page.getByLabel("Instructions").fill("Push through the heel.\nHold at the top.");
  await page.getByRole("checkbox", { name: "Glute", exact: true }).check();
  await page.getByLabel("Tags").fill("Bodyweight");
  await page.getByLabel("Tags").press("Enter");
  await page.getByLabel("Tags").fill("beginner,");
  await page.getByLabel("YouTube link").fill(SHORT);
  await page.getByRole("button", { name: "Add video" }).click();
  await expect(page.getByText("Cover", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create exercise" }).click();

  await expect(page).toHaveURL(/\/library\/[0-9a-f-]{36}$/);
  await page.reload();
  await expect(page.getByLabel("Name")).toHaveValue("Single-leg bridge");
  await expect(page.getByText("bodyweight")).toBeVisible();

  // Edit keeps typed values after saving.
  await page.getByLabel("Instructions").fill("Push through the heel.\nSqueeze at the top.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await expect(page.getByLabel("Instructions")).toHaveValue(
    "Push through the heel.\nSqueeze at the top.",
  );

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
  await expect(page).toHaveURL(/\/library\/[0-9a-f-]{36}$/);
  await page.reload();
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
  await expect(page).toHaveURL(/\/library\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete exercise" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole("link", { name: /Throwaway plank/ })).toHaveCount(0);
});
