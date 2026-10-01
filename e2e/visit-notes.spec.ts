import type { Page } from "@playwright/test";
import postgres from "postgres";

import { expect, test } from "./helpers/auth";
import { hasNoHorizontalOverflow } from "./helpers/routines";
import { chooseOption } from "./helpers/select";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 2 });
test.afterAll(() => sql.end());

/** Creates a customer through the form and returns the path of their page. */
async function createCustomer(page: Page, firstName: string, lastName: string) {
  await page.goto("/customers/new");
  await page.getByLabel("First name").fill(firstName);
  await page.getByLabel("Last name").fill(lastName);
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname;
}

async function createCase(page: Page, customerPath: string, title: string) {
  await page.goto(customerPath);
  await page.getByRole("button", { name: "New case" }).click();
  const sheet = page.getByRole("dialog", { name: "New case" });
  await sheet.getByLabel("Title").fill(title);
  await sheet.getByRole("button", { name: "Create case" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("article").filter({ hasText: title })).toBeVisible();
}

/** "2026-10-01" as the app shows it for the en locale. */
const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  });

/** Opens the "new note" sheet with the N key (retrying until the page has hydrated). */
async function openNewNoteWithKey(page: Page) {
  const sheet = page.getByRole("dialog", { name: "New visit note" });
  await expect(async () => {
    await page.keyboard.press("n");
    await expect(sheet).toBeVisible({ timeout: 500 });
  }).toPass();
  return sheet;
}

test("a physio writes, edits and deletes a visit note", async ({ physioPage: page, physio }) => {
  const path = await createCustomer(page, "Notes", "Tester");
  await page.goto(`${path}?tab=notes`);
  const notes = page.getByRole("region", { name: "Visit notes" });
  await expect(notes.getByText(/No visit notes for Notes Tester yet/)).toBeVisible();

  // N opens a new note prefilled with today's date; Ctrl/Cmd+Enter saves.
  const sheet = await openNewNoteWithKey(page);
  const visitedOn = await sheet.getByLabel("Visit date").inputValue();
  expect(visitedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const date = formatDate(visitedOn);

  await sheet.getByRole("button", { name: "Save note" }).click();
  await expect(sheet.getByText("Write something in at least one of S, O, A or P.")).toBeVisible();

  await sheet.getByLabel("S · Subjective").fill("Knee pain on stairs");
  await sheet.getByLabel("A · Assessment").fill("Improving");
  await sheet.getByLabel("Pain (0–10)").fill("4");
  await page.keyboard.press("Control+Enter");
  await expect(sheet).toBeHidden();

  const card = notes.getByRole("listitem").filter({ hasText: "Knee pain on stairs" });
  await expect(card.getByRole("heading", { name: date })).toBeVisible();
  await expect(card).toContainText("Improving");
  await expect(card).toContainText("Pain 4/10");
  await expect(card).not.toContainText("Edited");
  expect(await hasNoHorizontalOverflow(page)).toBe(true);

  // Pretend it was written an hour ago (triggers off, so updated_at stays put).
  await sql.begin(async (tx) => {
    await tx`set local session_replication_role = replica`;
    await tx`update public.visit_notes
      set created_at = created_at - interval '1 hour', updated_at = updated_at - interval '1 hour'
      where physio_id = ${physio.id}`;
  });
  await page.reload();

  await card.getByRole("button", { name: `Edit note from ${date}` }).click();
  const editor = page.getByRole("dialog", { name: "Edit visit note" });
  await expect(editor.getByLabel("S · Subjective")).toHaveValue("Knee pain on stairs");
  await editor.getByLabel("A · Assessment").fill("Much better");
  await editor.getByRole("button", { name: "Save changes" }).click();
  await expect(editor).toBeHidden();
  await expect(card).toContainText("Much better");
  await expect(card.getByText(/^Edited /)).toBeVisible();

  // The customer overview shows the latest note.
  await page.goto(path);
  const latest = page.getByRole("region", { name: "Latest visit note" });
  await expect(latest).toContainText(`Visit on ${date}`);
  await expect(latest).toContainText("Much better");
  await latest.getByRole("link", { name: "View all notes" }).click();
  await expect(page).toHaveURL(/\?tab=notes$/);

  // Delete asks first.
  await card.getByRole("button", { name: `Delete note from ${date}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: `Delete note from ${date}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete note" }).click();
  await expect(card).toBeHidden();
  await expect(notes.getByText(/No visit notes for Notes Tester yet/)).toBeVisible();
});

test("an unsaved draft survives closing the editor and a reload", async ({ physioPage: page }) => {
  const path = await createCustomer(page, "Draft", "Tester");
  await page.goto(`${path}?tab=notes`);

  await page.getByRole("button", { name: "New note" }).click();
  const sheet = page.getByRole("dialog", { name: "New visit note" });
  await sheet.getByLabel("S · Subjective").fill("Half-written thought");
  await sheet.getByLabel("Pain (0–10)").fill("6");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  await page.reload();
  await page.getByRole("button", { name: "New note" }).click();
  const reopened = page.getByRole("dialog", { name: "New visit note" });
  await expect(reopened.getByLabel("S · Subjective")).toHaveValue("Half-written thought");
  await expect(reopened.getByLabel("Pain (0–10)")).toHaveValue("6");
  await expect(reopened.getByRole("status")).toContainText("We restored your unsaved draft.");

  await reopened.getByRole("button", { name: "Discard draft" }).click();
  await expect(reopened.getByLabel("S · Subjective")).toHaveValue("");
  await page.keyboard.press("Escape");
  await expect(reopened).toBeHidden();

  // A discarded draft stays gone.
  await page.reload();
  await page.getByRole("button", { name: "New note" }).click();
  await expect(page.getByLabel("S · Subjective")).toHaveValue("");
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("notes filter by case and load 20 at a time", async ({ physioPage: page, physio }) => {
  const path = await createCustomer(page, "Many", "Notes");
  await createCase(page, path, "ACL rehab");
  await createCase(page, path, "Shoulder");
  const customerId = path.split("/").pop()!;

  await sql`
    insert into public.visit_notes (physio_id, customer_id, case_id, visited_on, subjective)
    select ${physio.id}, ${customerId},
      (select id from public.cases where customer_id = ${customerId} and title = 'ACL rehab'),
      current_date - n, 'ACL note ' || n
    from generate_series(1, 21) as n`;
  await sql`
    insert into public.visit_notes (physio_id, customer_id, case_id, visited_on, subjective)
    values (${physio.id}, ${customerId},
      (select id from public.cases where customer_id = ${customerId} and title = 'Shoulder'),
      current_date, 'Shoulder note')`;

  await page.goto(`${path}?tab=notes`);
  const notes = page.getByRole("region", { name: "Visit notes" });
  const items = notes.getByRole("listitem");
  await expect(items).toHaveCount(20);
  await expect(items.first()).toContainText("Shoulder note"); // newest visit first

  await notes.getByRole("link", { name: "Load more" }).click();
  await expect(items).toHaveCount(22);
  await expect(notes.getByRole("link", { name: "Load more" })).toHaveCount(0);

  await chooseOption(page, notes.getByRole("combobox", { name: "Filter by case" }), "Shoulder");
  await expect(page).toHaveURL(/[?&]case=[0-9a-f-]{36}/);
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("Shoulder note");
  await expect(items.first()).toContainText("Shoulder"); // case badge

  await chooseOption(page, notes.getByRole("combobox", { name: "Filter by case" }), "All cases");
  await expect(page).toHaveURL(/\?tab=notes$/);
  await expect(items).toHaveCount(20);
});
