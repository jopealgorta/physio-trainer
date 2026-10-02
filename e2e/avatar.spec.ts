import type { Page } from "@playwright/test";

import { createPhysio, deletePhysio, expect, setUserMetadata, signIn, test } from "./helpers/auth";
import { insertCustomer, insertCustomerLink } from "./helpers/patient";

const OLD_PHOTO = "https://lh3.googleusercontent.com/a/e2e-old=s96-c";
const NEW_PHOTO = "https://lh3.googleusercontent.com/a/e2e-new=s96-c";
// 1×1 transparent PNG, served for Google's photo host so the tests stay offline.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

/** Serves every Google photo URL and records the Referer each request carried. */
async function fakeGooglePhotos(page: Page) {
  const referers: (string | undefined)[] = [];
  await page.route("https://lh3.googleusercontent.com/**", async (route) => {
    referers.push(route.request().headers()["referer"]);
    await route.fulfill({ status: 200, contentType: "image/png", body: PNG });
  });
  return referers;
}

test("the account menu shows the Google photo and refreshes it on sign-in", async ({ page }) => {
  const physio = await createPhysio({
    onboarded: true,
    displayName: "Paula Photo",
    userMetadata: { avatar_url: OLD_PHOTO },
  });
  try {
    const referers = await fakeGooglePhotos(page);
    await signIn(page, physio);
    await expect(page).toHaveURL(/\/dashboard$/);
    const photo = page.getByRole("img", { name: "Photo of Paula Photo" }).filter({ visible: true });
    await expect(photo).toHaveAttribute("src", OLD_PHOTO);
    expect(referers.length).toBeGreaterThan(0);
    expect(referers.every((referer) => referer === undefined)).toBe(true);

    // Google sends a new photo: the next sign-in stores it.
    await setUserMetadata(physio.id, { full_name: "Paula Photo", avatar_url: NEW_PHOTO });
    await signIn(page, physio);
    await expect(photo).toHaveAttribute("src", NEW_PHOTO);

    // A sign-in without a photo in the metadata (magic link) keeps the stored one.
    await setUserMetadata(physio.id, { full_name: "Paula Photo" });
    await signIn(page, physio);
    await expect(photo).toHaveAttribute("src", NEW_PHOTO);
  } finally {
    await deletePhysio(physio);
  }
});

test("without a photo, or when it fails to load, the menu shows the initial", async ({ page }) => {
  const physio = await createPhysio({
    onboarded: true,
    displayName: "Ines Initial",
    userMetadata: { avatar_url: OLD_PHOTO },
  });
  try {
    await page.route("https://lh3.googleusercontent.com/**", (route) =>
      route.fulfill({ status: 403 }),
    );
    await signIn(page, physio);
    const trigger = page.getByRole("button", { name: "Account menu" }).filter({ visible: true });
    await expect(trigger).toContainText("I");
    await expect(page.getByRole("img", { name: "Photo of Ines Initial" })).toHaveCount(0);
  } finally {
    await deletePhysio(physio);
  }
});

test("the patient page shows the physio's photo beside their name", async ({ page }) => {
  const physio = await createPhysio({
    onboarded: true,
    displayName: "Paula Photo",
    userMetadata: { avatar_url: OLD_PHOTO },
  });
  try {
    await fakeGooglePhotos(page);
    const customerId = await insertCustomer(physio.id, { firstName: "Ana" });
    const link = await insertCustomerLink(physio, customerId);
    await page.goto(link.path);
    const header = page.getByRole("banner");
    await expect(header).toContainText("Paula Photo");
    await expect(header.getByRole("img", { name: "Photo of Paula Photo" })).toHaveAttribute(
      "src",
      OLD_PHOTO,
    );
  } finally {
    await deletePhysio(physio);
  }
});
