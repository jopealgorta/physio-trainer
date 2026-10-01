import type { APIRequestContext } from "@playwright/test";

import { expect, test } from "./helpers/auth";
import {
  insertCustomer,
  insertCustomerLink,
  insertRoutine,
  linkRow,
  newCode,
  setBranding,
} from "./helpers/patient";

const WHATSAPP = "WhatsApp/2.23.20.0 A";

/** The tag's content from the page HTML (`property` for Open Graph, `name` for Twitter). */
function metaContent(html: string, attribute: "property" | "name", key: string): string | null {
  const tag = html.match(new RegExp(`<meta[^>]*${attribute}="${key}"[^>]*>`))?.[0];
  return tag?.match(/content="([^"]*)"/)?.[1] ?? null;
}

/** The image path from the page, as a chat app would fetch it (the origin is not under test). */
async function ogImage(request: APIRequestContext, html: string) {
  const content = metaContent(html, "property", "og:image");
  expect(content).toBeTruthy();
  const url = new URL(content!);
  const response = await request.get(`${url.pathname}${url.search}`);
  return { url, response, bytes: await response.body() };
}

const pngSize = (bytes: Buffer) => ({
  width: bytes.readUInt32BE(16),
  height: bytes.readUInt32BE(20),
});

test.describe("link previews", () => {
  test("a patient link has Open Graph tags with no patient data and a 1200×630 PNG", async ({
    request,
    physio,
  }) => {
    await setBranding(physio.id, { clinicName: "Kine Sur", accent: "#0f766e" });
    const customerId = await insertCustomer(physio.id, { firstName: "Ana" });
    await insertRoutine(physio.id, customerId, "Knee rehab", { exercise: "Hamstring stretch" });
    const link = await insertCustomerLink(physio, customerId, { slug: "ana" });

    const page = await request.get(link.path, { headers: { "user-agent": WHATSAPP } });
    expect(page.status()).toBe(200);
    const html = await page.text();

    expect(metaContent(html, "property", "og:title")).toBe("Your exercise plan · Kine Sur");
    expect(metaContent(html, "property", "og:description")).toBe(
      "Open your routine from Kine Sur.",
    );
    expect(metaContent(html, "property", "og:site_name")).toBe("Kine Sur");
    expect(metaContent(html, "name", "twitter:card")).toBe("summary_large_image");
    expect(metaContent(html, "name", "robots")).toBe("noindex, nofollow");
    expect(html.match(/property="og:image"/g)).toHaveLength(1);

    // Everything in <head> is branding: no customer, routine or exercise names.
    const head = html.slice(0, html.indexOf("</head>"));
    for (const secret of ["Ana", "Zyxwsurname", "Knee rehab", "Hamstring"]) {
      expect(head.replace(link.path, "")).not.toContain(secret);
    }

    const { url, response, bytes } = await ogImage(request, html);
    expect(url.searchParams.get("v")).toBeTruthy();
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/png");
    expect(response.headers()["cache-control"]).toContain("public");
    expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    expect(pngSize(bytes)).toEqual({ width: 1200, height: 630 });
    expect(metaContent(html, "property", "og:image:width")).toBe("1200");
    expect(metaContent(html, "property", "og:image:height")).toBe("630");
  });

  test("the card follows the customer's language", async ({ request, physio }) => {
    await setBranding(physio.id, { clinicName: "Kine Sur" });
    const customerId = await insertCustomer(physio.id, { locale: "es" });
    const link = await insertCustomerLink(physio, customerId);
    const html = await (await request.get(link.path)).text();
    expect(metaContent(html, "property", "og:title")).toBe("Tu plan de ejercicios · Kine Sur");
    expect(metaContent(html, "property", "og:description")).toBe("Abrí tu rutina de Kine Sur.");
  });

  test("revoked, expired and PIN-protected links unfurl exactly like an active one", async ({
    request,
    physio,
  }) => {
    await setBranding(physio.id, { clinicName: "Kine Sur", accent: "#0f766e" });
    const links = [
      await insertCustomerLink(physio, await insertCustomer(physio.id), { slug: "a" }),
      await insertCustomerLink(physio, await insertCustomer(physio.id), {
        slug: "b",
        revoked: true,
      }),
      await insertCustomerLink(physio, await insertCustomer(physio.id), {
        slug: "c",
        expired: true,
      }),
      await insertCustomerLink(physio, await insertCustomer(physio.id), { slug: "d", pin: "4821" }),
    ];

    const cards = [];
    for (const link of links) {
      const html = await (await request.get(link.path)).text();
      const { response, bytes } = await ogImage(request, html);
      expect(response.status()).toBe(200);
      cards.push({
        title: metaContent(html, "property", "og:title"),
        description: metaContent(html, "property", "og:description"),
        version: new URL(metaContent(html, "property", "og:image")!).searchParams.get("v"),
        image: bytes.toString("base64"),
      });
    }
    for (const card of cards.slice(1)) expect(card).toEqual(cards[0]);
  });

  test("an unknown code gets the generic app card", async ({ request, physio }) => {
    await setBranding(physio.id, { clinicName: "Kine Sur", accent: "#0f766e" });
    const link = await insertCustomerLink(physio, await insertCustomer(physio.id));
    const branded = await request.get(`${link.path}/og`);

    const generic = await request.get(`/${physio.handle}/ana-${newCode()}/og`);
    expect(generic.status()).toBe(200);
    expect(generic.headers()["content-type"]).toBe("image/png");
    expect(pngSize(await generic.body())).toEqual({ width: 1200, height: 630 });
    expect((await generic.body()).equals(await branded.body())).toBe(false);
  });

  test("a stale handle or slug still serves the image, and crawlers are not counted as opens", async ({
    request,
    physio,
  }) => {
    const customerId = await insertCustomer(physio.id);
    const link = await insertCustomerLink(physio, customerId, { slug: "ana" });

    const stale = await request.get(`/old-handle/old-slug-${link.code}/og`, {
      maxRedirects: 0,
    });
    expect(stale.status()).toBe(200);
    expect(stale.headers()["content-type"]).toBe("image/png");

    await request.get(link.path, { headers: { "user-agent": WHATSAPP } });
    await request.get(`${link.path}/og`, { headers: { "user-agent": WHATSAPP } });
    expect((await linkRow(link.code)).open_count).toBe(0);
  });

  test("the share popover previews the card", async ({ physioPage: page, physio }) => {
    await setBranding(physio.id, { clinicName: "Kine Sur", accent: "#0f766e" });
    const customerId = await insertCustomer(physio.id, { firstName: "Ana" });
    await page.goto(`/customers/${customerId}`);
    await page.getByRole("button", { name: "Share" }).click();

    const card = page.getByRole("group", { name: "How the link looks in chats" });
    await expect(card.getByText("Your exercise plan · Kine Sur")).toBeVisible();
    await expect(card.getByText("Open your routine from Kine Sur.")).toBeVisible();
    const image = card.getByRole("img", { name: "Link preview image" });
    await expect(image).toBeVisible();
    // The real image loaded (not a broken one).
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1200);

    // Once revoked, nothing unfurls any more, so there is nothing to preview.
    await page.getByRole("button", { name: "Revoke link" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Revoke" }).click();
    await expect(page.getByRole("button", { name: "Create new link" })).toBeVisible();
    await expect(card).toHaveCount(0);
  });
});
