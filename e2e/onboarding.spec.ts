import { createPhysio, deletePhysio, expect, signIn, test } from "./helpers/auth";

test("a new physio picks a handle and reaches the dashboard", async ({ page }) => {
  const suffix = crypto.randomUUID().slice(0, 6);
  const physio = await createPhysio({ displayName: `Nora Test ${suffix}` });
  const other = await createPhysio({ onboarded: true, handle: `taken-${suffix}` });
  try {
    await signIn(page, physio);
    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByRole("heading", { name: "Set up your profile" })).toBeVisible();

    const handle = page.getByLabel("Handle");
    await expect(handle).toHaveValue(`nora-test-${suffix}`);
    await expect(page.getByText("Available", { exact: true })).toBeVisible();

    await handle.fill("dashboard");
    await expect(page.getByText("That handle is reserved. Pick another.")).toBeVisible();
    await handle.fill("ab");
    await expect(page.getByText("Use at least 3 characters.")).toBeVisible();
    await handle.fill(`taken-${suffix}`);
    await expect(page.getByText("That handle is already taken.")).toBeVisible();

    await handle.fill(`nora-${suffix}`);
    await expect(page.getByText("Available", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByRole("button", { name: "Account menu" }).filter({ visible: true }).click();
    await expect(page.getByRole("menu")).toContainText(`Nora Test ${suffix}`);
  } finally {
    await Promise.all([deletePhysio(physio), deletePhysio(other)]);
  }
});

test("onboarded physios are sent on from the onboarding page", async ({ physioPage: page }) => {
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/dashboard$/);
});
