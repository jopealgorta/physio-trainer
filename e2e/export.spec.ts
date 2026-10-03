import { readFile } from "node:fs/promises";

import type { Download, Page } from "@playwright/test";

import { expect, test } from "./helpers/auth";
import { phoneMenu } from "./helpers/page-actions";
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

/**
 * On a phone the file goes to the system share sheet (Save to Files, WhatsApp…): this stand-in
 * records what it was handed. Desktop browsers get a plain download and never call it.
 */
async function stubShareSheet(page: Page) {
  await page.addInitScript(() => {
    const shared: { name: string; type: string; head: string }[] = [];
    Object.assign(window, { __shared: shared });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: (data?: { files?: File[] }) => Array.isArray(data?.files),
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async ({ files }: { files: File[] }) => {
        for (const file of files) {
          const bytes = new Uint8Array(await file.arrayBuffer()).subarray(0, 4);
          shared.push({ name: file.name, type: file.type, head: String.fromCharCode(...bytes) });
        }
      },
    });
  });
}

/**
 * Exports through the page's controls and checks the file: downloaded on a desktop, handed to the
 * share sheet on a phone. Routine and plan pages keep Export in "More actions" on phones.
 */
async function expectExport(
  page: Page,
  isMobile: boolean,
  item: "Export PDF" | "Export Excel",
  ext: string,
  magic: string,
) {
  const open = async () => {
    const exportButton = page.getByRole("button", { name: "Export", exact: true });
    await ((await phoneMenu(page, exportButton)) ?? exportButton).click();
    await page.getByRole("menuitem", { name: item }).click();
  };
  if (!isMobile) {
    const download = page.waitForEvent("download");
    await open();
    await expectFile(await download, ext, magic);
    return;
  }
  const shared = () =>
    page.evaluate(
      () => (window as unknown as { __shared: { name: string; head: string }[] }).__shared,
    );
  const before = (await shared()).length;
  await open();
  await expect.poll(async () => (await shared()).length).toBe(before + 1);
  const file = (await shared()).at(-1)!;
  expect(file.name).toMatch(new RegExp(`\\.${ext}$`));
  expect(file.head.startsWith(magic)).toBe(true);
}

test.describe("export", () => {
  test("a routine downloads as PDF and Excel", async ({ physioPage: page, physio, isMobile }) => {
    const customerId = await insertCustomer(physio.id);
    const routineId = await insertRoutine(physio.id, customerId, "Export routine");

    await stubShareSheet(page);
    await page.goto(`/routines/${routineId}`);
    await expectExport(page, isMobile, "Export PDF", "pdf", "%PDF");
    await expectExport(page, isMobile, "Export Excel", "xlsx", "PK");
  });

  test("a plan downloads as PDF", async ({ physioPage: page, physio, isMobile }) => {
    const customerId = await insertCustomer(physio.id);
    const routineId = await insertRoutine(physio.id, customerId, "Plan routine", {
      standalone: false,
    });
    const planId = await insertPlan(physio.id, customerId, "Export plan", [
      { weekday: isoWeekdayIn(0), routineId },
    ]);

    await stubShareSheet(page);
    await page.goto(`/plans/${planId}`);
    await expectExport(page, isMobile, "Export PDF", "pdf", "%PDF");
  });

  test("a customer downloads as Excel", async ({ physioPage: page, physio, isMobile }) => {
    const customerId = await insertCustomer(physio.id);
    await insertRoutine(physio.id, customerId, "Customer routine");

    await stubShareSheet(page);
    await page.goto(`/customers/${customerId}`);
    await expectExport(page, isMobile, "Export Excel", "xlsx", "PK");
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
