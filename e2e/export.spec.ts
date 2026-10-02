import { readFile } from "node:fs/promises";

import type { Download, Page } from "@playwright/test";

import { expect, test } from "./helpers/auth";
import {
  insertCustomer,
  insertCustomerLink,
  insertPlan,
  insertRoutine,
  isoWeekdayIn,
  revokeLink,
} from "./helpers/patient";

async function expectFile(download: Download, ext: string, magic: string) {
  expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${ext}$`));
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(0, magic.length).toString("latin1")).toBe(magic);
}

async function exportVia(page: Page, item: "Download PDF" | "Download Excel") {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: item }).click();
  return download;
}

test.describe("export", () => {
  test("a routine downloads as PDF and Excel", async ({ physioPage: page, physio }) => {
    const customerId = await insertCustomer(physio.id);
    const routineId = await insertRoutine(physio.id, customerId, "Export routine");

    await page.goto(`/routines/${routineId}`);
    await expectFile(await exportVia(page, "Download PDF"), "pdf", "%PDF");
    await expectFile(await exportVia(page, "Download Excel"), "xlsx", "PK");
  });

  test("a plan downloads as PDF", async ({ physioPage: page, physio }) => {
    const customerId = await insertCustomer(physio.id);
    const routineId = await insertRoutine(physio.id, customerId, "Plan routine", {
      standalone: false,
    });
    const planId = await insertPlan(physio.id, customerId, "Export plan", [
      { weekday: isoWeekdayIn(0), routineId },
    ]);

    await page.goto(`/plans/${planId}`);
    await expectFile(await exportVia(page, "Download PDF"), "pdf", "%PDF");
  });

  test("a customer downloads as Excel", async ({ physioPage: page, physio }) => {
    const customerId = await insertCustomer(physio.id);
    await insertRoutine(physio.id, customerId, "Customer routine");

    await page.goto(`/customers/${customerId}`);
    await expectFile(await exportVia(page, "Download Excel"), "xlsx", "PK");
  });

  test("a patient downloads the PDF from the shared link", async ({ page, physio }) => {
    const customerId = await insertCustomer(physio.id);
    await insertRoutine(physio.id, customerId, "Patient routine");
    const link = await insertCustomerLink(physio, customerId);

    await page.goto(link.path);
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download PDF" }).click();
    await expectFile(await download, "pdf", "%PDF");
  });

  test("a link revoked after the page loaded leads to the Unavailable page", async ({
    page,
    physio,
  }) => {
    const customerId = await insertCustomer(physio.id);
    await insertRoutine(physio.id, customerId, "Soon gone");
    const link = await insertCustomerLink(physio, customerId);

    await page.goto(link.path);
    await revokeLink(link.code);
    let downloaded = false;
    page.on("download", () => {
      downloaded = true;
    });
    await page.getByRole("link", { name: "Download PDF" }).click();
    await expect(
      page.getByRole("heading", { name: "This link is no longer available", exact: true }),
    ).toBeVisible();
    expect(downloaded).toBe(false);
  });

  test("a PIN-locked link redirects the download until the PIN is entered", async ({
    page,
    physio,
  }) => {
    const customerId = await insertCustomer(physio.id);
    await insertRoutine(physio.id, customerId, "Locked routine");
    const link = await insertCustomerLink(physio, customerId, { pin: "4821" });

    const locked = await page.request.get(`${link.path}/download`, { maxRedirects: 0 });
    expect(locked.status()).toBe(303);

    await page.goto(link.path);
    await page.getByLabel("PIN").fill("4821");
    await page.getByRole("button", { name: "Open" }).click();
    await expect(page.getByRole("heading", { name: "Locked routine", exact: true })).toBeVisible();

    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download PDF" }).click();
    await expectFile(await download, "pdf", "%PDF");
  });
});
