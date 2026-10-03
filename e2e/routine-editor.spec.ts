import { expect, test } from "./helpers/auth";
import { renameRoutine, routineTitle } from "./helpers/page-actions";
import { createRoutine } from "./helpers/routines";

test("a physio renames a routine and a stale tab hits the version conflict", async ({
  physioPage: page,
}) => {
  await createRoutine(page, "Week 1");
  await expect(routineTitle(page, "Week 1")).toBeVisible();
  await expect(page.getByRole("link", { name: "Edith" })).toBeVisible();

  // Nothing to save until something changes; renaming is such a change.
  const save = page.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeDisabled();
  await renameRoutine(page, "Week 1 - knee");
  await expect(page.getByTestId("save-status")).toHaveText("Unsaved changes");

  // Open the same routine in a second tab before saving in the first.
  const other = await page.context().newPage();
  await other.goto(page.url());
  await expect(routineTitle(other, "Week 1")).toBeVisible();

  await save.click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await expect(save).toBeDisabled();
  await expect(routineTitle(page, "Week 1 - knee")).toBeVisible();

  // The second tab still holds the old version: its save loses.
  await renameRoutine(other, "Week 1 - hip");
  await other.getByRole("button", { name: "Save", exact: true }).click();
  // Next's route announcer is also role=alert, so match on the message.
  const conflict = other.getByRole("alert").filter({ hasText: "changed in another tab" });
  await expect(conflict).toBeVisible();
  await other.getByRole("button", { name: "Reload" }).click();
  await expect(routineTitle(other, "Week 1 - knee")).toBeVisible();
  await expect(conflict).toBeHidden();
  await expect(other.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
});

test("Save saves a name still being typed, without Enter", async ({ physioPage: page }) => {
  await createRoutine(page, "Week 4");
  await page.getByRole("button", { name: "Rename routine" }).click();
  await page.getByRole("textbox", { name: "Routine name" }).fill("Week 4 - hip");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await expect(routineTitle(page, "Week 4 - hip")).toBeVisible();
  await page.reload();
  await expect(routineTitle(page, "Week 4 - hip")).toBeVisible();
});

test("leaving with unsaved changes asks first", async ({ physioPage: page }) => {
  await createRoutine(page, "Week 2");
  await renameRoutine(page, "Week 2!");

  const messages: string[] = [];
  page.on("dialog", async (dialog) => {
    messages.push(dialog.message());
    await dialog.dismiss();
  });
  await page.getByRole("link", { name: "Back to routines" }).click();
  await expect.poll(() => messages).toEqual(["You have unsaved changes. Leave without saving?"]);
  await expect(page).toHaveURL(/\/routines\/[0-9a-f-]{36}$/);

  page.removeAllListeners("dialog");
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("link", { name: "Back to routines" }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}\?tab=routines$/);
});

test("a blank name is refused on the title and nothing changes", async ({ physioPage: page }) => {
  await createRoutine(page, "Week 3");
  await page.getByRole("button", { name: "Rename routine" }).click();
  const name = page.getByRole("textbox", { name: "Routine name" });
  // Focused with the name selected: typing replaces it.
  await expect(name).toBeFocused();
  await name.press("Backspace");
  await name.press("Enter");
  await expect(page.getByText("Enter a name.")).toBeVisible();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await name.press("Escape");
  await expect(routineTitle(page, "Week 3")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
});
