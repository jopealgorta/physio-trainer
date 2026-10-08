import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./helpers/auth";
import { activateRoutines, insertCustomerLink } from "./helpers/patient";
import { addExercises, createExercise, createRoutine } from "./helpers/routines";

const section = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true }).and(page.getByTestId("section-card"));
const sectionNames = (page: Page) =>
  page.getByTestId("section-card").getByRole("heading", { level: 2 });
const row = (page: Page, name: string) =>
  page.getByTestId("item-row").filter({ hasText: name, hasNot: page.getByTestId("item-row") });
const status = (page: Page) => page.getByTestId("save-status");

/** The exercises of a section, in order, read from their drag handles ("Reorder Squat"). */
async function blocksIn(page: Page, name: string): Promise<string[]> {
  const labels = await section(page, name)
    .getByRole("button", { name: /^Reorder / })
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label") ?? ""));
  return labels.filter((label) => label !== `Reorder ${name}`).map((label) => label.slice(8));
}

/** Expects each section's exercises, in order. */
async function expectLayout(page: Page, layout: Record<string, string[]>) {
  for (const [name, blocks] of Object.entries(layout)) {
    await expect.poll(() => blocksIn(page, name)).toEqual(blocks);
  }
}

/** The live region dnd-kit announces drags in. */
const announcement = (page: Page, text: string) =>
  page.locator("[id^='DndLiveRegion']").filter({ hasText: text }).first();

/**
 * A real pointer drag: press on the handle, move in small steps (dnd-kit's PointerSensor starts a
 * drag only after 4 px), then release over `to` at `fraction` of its height.
 */
async function pointerDrag(page: Page, handle: Locator, to: Locator, fraction = 0.5) {
  await handle.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  if (!from) throw new Error("The drag handle is not visible");
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + 6, { steps: 3 });
  // The target can shift once the drag starts (rows make room), so measure it now.
  const target = await to.boundingBox();
  if (!target) throw new Error("The drop target is not visible");
  const endX = target.x + Math.min(target.width / 2, 40);
  const endY = target.y + target.height * fraction;
  await page.mouse.move(endX, endY, { steps: 20 });
  // A last nudge lets dnd-kit settle on the target after any layout change.
  await page.mouse.move(endX, endY + 1, { steps: 2 });
  await page.mouse.up();
  // dnd-kit swallows clicks for 50 ms after a drop (so the drop isn't also a click): a Save
  // clicked by the test right away would be lost. A person never clicks that fast.
  await page.waitForTimeout(100);
}

test("a physio adds a section, moves an exercise into it, reorders sections and it persists", async ({
  physioPage: page,
  physio,
  isMobile,
}) => {
  for (const name of ["Squat", "Bridge"]) await createExercise(page, name);
  await createRoutine(page, "Knee rehab");
  const customerHref = await page.getByRole("link", { name: "Edith" }).getAttribute("href");
  const customerId = customerHref!.match(/[0-9a-f-]{36}/)![0];

  // A new routine opens with one "Main" section.
  await expect(sectionNames(page)).toHaveText(["Main"]);

  await page
    .getByRole("group", { name: "Add section" })
    .getByRole("button", { name: "Warm-up", exact: true })
    .click();
  await expect(sectionNames(page)).toHaveText(["Main", "Warm-up"]);

  // The picker appends to the last section.
  await addExercises(page, isMobile, ["Squat", "Bridge"]);
  await expectLayout(page, { Main: [], "Warm-up": ["Squat", "Bridge"] });
  await expect(section(page, "Main").getByText("Drag exercises here")).toBeVisible();

  // "Move to section" in the exercise's menu.
  await row(page, "Bridge").getByRole("button", { name: "Exercise options" }).click();
  await page.getByRole("menuitem", { name: "Move to section" }).click();
  await page.getByRole("menuitem", { name: "Main", exact: true }).click();
  await expectLayout(page, { Main: ["Bridge"], "Warm-up": ["Squat"] });

  // Keyboard reorder of the sections: Warm-up goes first.
  await page.getByRole("button", { name: "Reorder Warm-up" }).focus();
  await page.keyboard.press("Space");
  await expect(announcement(page, "Warm-up moved to position 2 of 2")).toBeAttached();
  // dnd-kit attaches its key listener a tick after Space: repeat until the move registers.
  await expect(async () => {
    await page.keyboard.press("ArrowUp");
    await expect(announcement(page, "Warm-up moved to position 1 of 2")).toBeAttached({
      timeout: 500,
    });
  }).toPass();
  await page.keyboard.press("Space");
  await expect(announcement(page, "Warm-up dropped at position 1 of 2")).toBeAttached();
  await expect(sectionNames(page)).toHaveText(["Warm-up", "Main"]);

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(status(page)).toHaveText("Saved");

  await page.reload();
  await expect(sectionNames(page)).toHaveText(["Warm-up", "Main"]);
  await expectLayout(page, { "Warm-up": ["Squat"], Main: ["Bridge"] });
  await expect(status(page)).toHaveText("");

  // The patient sees both headings, in order, one level under the routine name.
  await activateRoutines(customerId);
  const link = await insertCustomerLink(physio, customerId);
  await page.goto(link.path);
  await expect(page.getByRole("heading", { level: 2, name: "Knee rehab" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: /^(Warm-up|Main)$/ })).toHaveText([
    "Warm-up",
    "Main",
  ]);
  await expect(page.getByRole("region", { name: "Warm-up", exact: true })).toContainText("Squat");
  await expect(page.getByRole("region", { name: "Main", exact: true })).toContainText("Bridge");
});

test("a physio drags exercises into other sections with the pointer, and it persists", async ({
  physioPage: page,
  isMobile,
}) => {
  for (const name of ["Squat", "Bridge"]) await createExercise(page, name);
  await createRoutine(page, "Hip rehab");
  await addExercises(page, isMobile, ["Squat", "Bridge"]);
  await page
    .getByRole("group", { name: "Add section" })
    .getByRole("button", { name: "Cool-down", exact: true })
    .click();
  await expectLayout(page, { Main: ["Squat", "Bridge"], "Cool-down": [] });

  // Into an empty section, through its drop zone.
  const dropZone = section(page, "Cool-down").getByText("Drag exercises here");
  await pointerDrag(page, page.getByRole("button", { name: "Reorder Squat" }), dropZone);
  await expectLayout(page, { Main: ["Bridge"], "Cool-down": ["Squat"] });

  // Onto an exercise of another section: dropped on its upper half, it lands before it.
  await pointerDrag(
    page,
    page.getByRole("button", { name: "Reorder Bridge" }),
    row(page, "Squat"),
    0.25,
  );
  await expectLayout(page, { Main: [], "Cool-down": ["Bridge", "Squat"] });
  await expect(section(page, "Main").getByText("Drag exercises here")).toBeVisible();

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(status(page)).toHaveText("Saved");
  await page.reload();
  await expect(sectionNames(page)).toHaveText(["Main", "Cool-down"]);
  await expectLayout(page, { Main: [], "Cool-down": ["Bridge", "Squat"] });
});
