import { deflateSync } from "node:zlib";

import { expect, test } from "./helpers/auth";
import { formStatus } from "./helpers/form";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A solid teal RGBA PNG, larger than the 512 px logo limit so the browser has to downscale it. */
function solidPng(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA, no interlace
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 4, 0)]);
  for (let x = 0; x < width; x++) row.set([15, 118, 110, 255], 1 + x * 4);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const LOGO_PNG = solidPng(1200, 600);

const saved = (page: import("@playwright/test").Page) =>
  formStatus(page).filter({ hasText: /^Saved$/ });

test("picking an accent colour updates the preview and persists", async ({ physioPage: page }) => {
  await page.goto("/settings?section=branding");
  const preview = page.getByRole("figure", { name: "Patient page" });
  const button = preview.getByRole("button", { name: "Mark as done" });
  const before = await button.evaluate((el) => getComputedStyle(el).backgroundColor);

  await page.getByRole("radio", { name: "Teal" }).click();
  await expect(button).toHaveCSS("background-color", "rgb(15, 118, 110)");
  expect(before).not.toBe("rgb(15, 118, 110)");

  await page.getByLabel("Clinic or practice name").fill("Kine Sur");
  await expect(preview.getByText("Kine Sur")).toBeVisible();
  await page.getByRole("button", { name: "Save branding" }).click();
  await expect(saved(page)).toBeVisible();

  await page.reload();
  await expect(page.getByRole("radio", { name: "Teal" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByLabel("Clinic or practice name")).toHaveValue("Kine Sur");
});

test("contact details drive the preview buttons", async ({ physioPage: page }) => {
  await page.goto("/settings?section=branding");
  await page.getByLabel("Phone").fill("+54 9 11 1234-5678");
  const preview = page.getByRole("figure", { name: "Patient page" });
  await expect(preview.getByRole("link", { name: "WhatsApp" })).toHaveAttribute(
    "href",
    "https://wa.me/5491112345678",
  );
  await page.getByRole("checkbox", { name: "Show contact details to patients" }).click();
  await expect(preview.getByRole("link", { name: "WhatsApp" })).toHaveCount(0);
});

test("a physio uploads a logo that is publicly reachable", async ({
  physioPage: page,
  physio,
  request,
}) => {
  await page.goto("/settings?section=branding");
  await page.getByLabel("Logo", { exact: true }).setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: LOGO_PNG,
  });
  // The browser resized it (canvas → PNG) before it was previewed.
  const logoBox = page.locator("form").getByRole("img", { name: /logo$/ });
  await expect(logoBox).toBeVisible();
  await expect(page.getByRole("figure", { name: "Patient page" }).getByRole("img")).toBeVisible();
  await page.getByRole("button", { name: "Save branding" }).click();
  await expect(saved(page)).toBeVisible();

  await page.reload();
  const logo = page.locator("form").getByRole("img", { name: /logo$/ });
  await expect(logo).toBeVisible();
  const src = await logo.getAttribute("src");
  expect(src).toMatch(
    new RegExp(`/storage/v1/object/public/branding/${physio.id}/logo-[0-9a-f-]+\\.png$`),
  );
  // Anonymous request: a fresh context with no cookies.
  const response = await request.get(src!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/^image\/png$/);

  // Downscaled to fit 512 px, keeping the 2:1 ratio.
  await expect
    .poll(() => logo.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]))
    .toEqual([512, 256]);

  await page.getByRole("button", { name: "Remove logo" }).click();
  await page.getByRole("button", { name: "Save branding" }).click();
  await expect(saved(page)).toBeVisible();
  await page.reload();
  await expect(page.locator("form").getByRole("img", { name: /logo$/ })).toHaveCount(0);
});

test("the branding page works in Spanish", async ({ physioPage: page }) => {
  // Sign-in set the cookie from the physio's saved locale (en); switch it like the picker does.
  await page.context().addCookies([{ name: "NEXT_LOCALE", value: "es", url: page.url() }]);
  await page.goto("/settings?section=branding");
  await expect(page.getByRole("radio", { name: "Verde azulado" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar marca" })).toBeVisible();
});
