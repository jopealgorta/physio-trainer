import type { Page } from "@playwright/test";

import { createPhysio, deletePhysio, expect, signIn, test } from "./helpers/auth";
import { chooseOption } from "./helpers/select";

const CUSTOMER_URL = /\/customers\/[0-9a-f-]{36}$/;

/** Creates a customer through the form and lands on their page. */
async function createCustomer(page: Page, firstName: string, lastName?: string) {
  await page.goto("/customers/new");
  await page.getByLabel("First name").fill(firstName);
  if (lastName) await page.getByLabel("Last name").fill(lastName);
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page).toHaveURL(CUSTOMER_URL);
  return new URL(page.url()).pathname;
}

async function hasNoHorizontalOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
}

test("a physio creates a customer and a case, and sees the precautions first", async ({
  physioPage: page,
}) => {
  await page.goto("/customers");
  await expect(page.getByRole("heading", { name: "Add your first customer" })).toBeVisible();

  await page.getByRole("link", { name: "New customer" }).first().click();
  await expect(page).toHaveURL(/\/customers\/new$/);
  await page.getByLabel("First name").fill("José");
  await page.getByLabel("Last name").fill("García");
  await page.getByLabel("Phone").fill("+598 99 123 456");
  await page.getByText("More details").click();
  await page.getByLabel("Occupation").fill("Carpenter");
  await chooseOption(page, page.getByLabel("Sex"), /^Male$/);
  await chooseOption(page, page.getByLabel("Patient language"), "Español");
  await page.getByRole("button", { name: "Create customer" }).click();

  await expect(page).toHaveURL(CUSTOMER_URL);
  await expect(page.getByRole("heading", { level: 1, name: "José García" })).toBeVisible();
  await expect(page.getByRole("link", { name: "WhatsApp" })).toHaveAttribute(
    "href",
    "https://wa.me/59899123456",
  );
  await expect(page.getByText("Carpenter")).toBeVisible();
  await expect(page.getByText("Male", { exact: true })).toBeVisible();
  await expect(page.getByText("Español", { exact: true })).toBeVisible();
  await expect(page.getByText("No open cases")).toBeVisible();

  await page.getByRole("button", { name: "New case" }).click();
  const sheet = page.getByRole("dialog", { name: "New case" });
  await sheet.getByLabel("Title").fill("Right ACL reconstruction");
  await sheet.getByLabel("Precautions").fill("No deep flexion past 90°");
  await sheet.getByRole("radio", { name: "Knee", exact: true }).click();
  await sheet.getByRole("radio", { name: "Right" }).click();
  await sheet.getByRole("button", { name: "Create case" }).click();
  await expect(sheet).toBeHidden();

  const precautions = page.getByRole("alert").filter({ hasText: "Precautions" });
  await expect(precautions).toContainText("No deep flexion past 90°");
  await expect(precautions).toContainText("Right ACL reconstruction");
  const card = page.getByRole("article").filter({ hasText: "Right ACL reconstruction" });
  await expect(card).toBeVisible();
  await expect(card.getByText("Open", { exact: true })).toBeVisible();
  await expect(card).toContainText("Knee");

  // The case shows up in the customers list as their open case.
  await page.goto("/customers");
  await expect(
    page.getByRole("link", { name: /José García/ }).filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByText("Right ACL reconstruction").filter({ visible: true })).toBeVisible();
});

test("the customer tabs are addressable by URL", async ({ physioPage: page }) => {
  const path = await createCustomer(page, "Tabs", "Tester");
  const tabs = page.getByRole("navigation", { name: "Customer sections" });

  await tabs.getByRole("link", { name: "Routines" }).click();
  await expect(page).toHaveURL(/\?tab=routines$/);
  await expect(page.getByText("Routines for this customer will appear here.")).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\?tab=routines$/);
  await expect(page.getByText("Routines for this customer will appear here.")).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Routines" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await page.goto(`${path}?tab=bogus`);
  await expect(page.getByRole("heading", { name: "Open cases" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Overview" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("closing a case hides its precautions and reopening brings them back", async ({
  physioPage: page,
}) => {
  await createCustomer(page, "Closer");
  await page.getByRole("button", { name: "New case" }).click();
  const sheet = page.getByRole("dialog", { name: "New case" });
  await sheet.getByLabel("Title").fill("Shoulder impingement");
  await sheet.getByLabel("Precautions").fill("Avoid overhead loading");
  await sheet.getByRole("button", { name: "Create case" }).click();
  await expect(sheet).toBeHidden();

  const precautions = page.getByRole("alert").filter({ hasText: "Precautions" });
  await expect(precautions).toContainText("Avoid overhead loading");

  await page.getByRole("button", { name: "Close case Shoulder impingement" }).click();
  const dialog = page.getByRole("dialog", { name: "Close this case?" });
  await dialog.getByRole("button", { name: "Close case", exact: true }).click();
  await expect(dialog).toBeHidden();

  await expect(precautions).toHaveCount(0);
  await expect(page.getByText("No open cases")).toBeVisible();
  const closed = page.locator("details").filter({ hasText: "Closed cases" });
  await closed.getByText("Closed cases").click();
  const card = closed.getByRole("article").filter({ hasText: "Shoulder impingement" });
  await expect(card).toBeVisible();
  await expect(card.getByText("Closed", { exact: true })).toBeVisible();
  // The alert is gone, so the closed case's card is where its precautions stay readable.
  await expect(card).toContainText("Precautions");
  await expect(card).toContainText("Avoid overhead loading");

  await card.getByRole("button", { name: "Reopen case Shoulder impingement" }).click();
  await expect(precautions).toContainText("Avoid overhead loading");
  await expect(page.locator("details").filter({ hasText: "Closed cases" })).toHaveCount(0);
  await expect(
    page.getByRole("article").filter({ hasText: "Shoulder impingement" }).getByText("Open", {
      exact: true,
    }),
  ).toBeVisible();
});

test("searching customers ignores case and accents", async ({ physioPage: page }) => {
  await createCustomer(page, "José", "García");
  await createCustomer(page, "Ana");

  await page.goto("/customers");
  const search = page.getByLabel("Search customers");
  const jose = page.getByRole("link", { name: /José García/ }).filter({ visible: true });
  const ana = page.getByRole("link", { name: /Ana/ }).filter({ visible: true });
  await expect(jose).toHaveCount(1);
  await expect(ana).toHaveCount(1);

  await search.fill("jose");
  await expect(page).toHaveURL(/q=jose/);
  await expect(jose).toHaveCount(1);
  await expect(ana).toHaveCount(0);

  await search.fill("garcia");
  await expect(page).toHaveURL(/q=garcia/);
  await expect(jose).toHaveCount(1);
  await expect(ana).toHaveCount(0);

  await search.fill("zzz");
  await expect(page).toHaveURL(/q=zzz/);
  await expect(page.getByRole("heading", { name: "No customers match" })).toBeVisible();

  await page.getByRole("link", { name: "Clear filters" }).click();
  await expect(search).toHaveValue("");
  await expect(jose).toHaveCount(1);
  await expect(ana).toHaveCount(1);
});

test("archiving a customer hides them until restored", async ({ physioPage: page }) => {
  await createCustomer(page, "José", "García");
  const other = await createCustomer(page, "Ana");
  const name = /José García/;

  await page.goto("/customers");
  await page.getByRole("link", { name }).filter({ visible: true }).click();
  await expect(page).toHaveURL(CUSTOMER_URL);

  await page.getByRole("button", { name: "Archive" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Archive José García?" });
  await confirm.getByRole("button", { name: "Archive" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "This customer is archived" }),
  ).toBeVisible();
  const archivedPath = new URL(page.url()).pathname;
  expect(archivedPath).not.toBe(other);

  await page.goto("/customers");
  await expect(page.getByRole("link", { name })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Ana/ }).filter({ visible: true })).toHaveCount(1);
  await page.getByLabel("Show archived").click();
  await expect(page).toHaveURL(/archived=/);
  const archivedRow = page.getByRole("link", { name }).filter({ visible: true });
  await expect(archivedRow).toContainText("Archived");

  await archivedRow.click();
  await expect(page.getByText(/This customer is archived/)).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText(/This customer is archived/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Archive" })).toBeVisible();

  await page.goto("/customers");
  await expect(page.getByRole("link", { name }).filter({ visible: true })).toHaveCount(1);
});

test("archiving the only customer keeps a usable list", async ({ physioPage: page }) => {
  await createCustomer(page, "Solo");
  await page.getByRole("button", { name: "Archive" }).click();
  await page
    .getByRole("alertdialog", { name: "Archive Solo?" })
    .getByRole("button", { name: "Archive" })
    .click();
  await expect(page.getByText(/This customer is archived/)).toBeVisible();

  // No filter is active and nothing is listed: the message must not offer a dead "Clear
  // filters" link, and the customer stays reachable through "Show archived".
  await page.goto("/customers");
  await expect(page.getByRole("heading", { name: "No customers match" })).toBeVisible();
  await expect(page.getByText("All your customers are archived.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Clear filters" })).toHaveCount(0);
  await page.getByLabel("Show archived").click();
  await expect(page.getByRole("link", { name: /Solo/ }).filter({ visible: true })).toHaveCount(1);
});

test("customer pages do not overflow horizontally with a very long name", async ({
  physioPage: page,
}) => {
  const longName = "Wolfeschlegelsteinhausenbergerdorff".padEnd(60, "x");
  expect(longName).toHaveLength(60);
  await createCustomer(page, longName, longName);

  await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  await page.getByRole("button", { name: "New case" }).click();
  const sheet = page.getByRole("dialog", { name: "New case" });
  await sheet.getByLabel("Title").fill("T".repeat(120));
  await sheet.getByLabel("Precautions").fill("P".repeat(300));
  await sheet.getByRole("button", { name: "Create case" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("article")).toBeVisible();
  await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);

  await page.goto("/customers");
  await expect(page.getByRole("link", { name: /Wolfeschlegel/ }).first()).toBeVisible();
  await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
});

test("a physio cannot see another physio's customers", async ({ physioPage: page, browser }) => {
  const path = await createCustomer(page, "Private", "Patient");

  const other = await createPhysio({ onboarded: true });
  const context = await browser.newContext({ locale: "en-US" });
  try {
    const otherPage = await context.newPage();
    await signIn(otherPage, other);
    await expect(otherPage).toHaveURL(/\/dashboard$/);

    const response = await otherPage.goto(path);
    expect(response?.status()).toBe(404);
    await expect(otherPage.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(otherPage.getByText("Private Patient")).toHaveCount(0);

    await otherPage.goto("/customers");
    await expect(otherPage.getByRole("heading", { name: "Add your first customer" })).toBeVisible();
    await expect(otherPage.getByText("Private Patient")).toHaveCount(0);
  } finally {
    await context.close();
    await deletePhysio(other);
  }
});
