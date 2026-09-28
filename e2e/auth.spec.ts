import { createPhysio, deletePhysio, deletePhysioRow, expect, signIn, test } from "./helpers/auth";

test("signed-out visits return to the requested page after sign-in", async ({ page, physio }) => {
  await page.goto("/customers");
  await expect(page).toHaveURL(/\/login\?next=%2Fcustomers$/);
  const next = new URL(page.url()).searchParams.get("next") ?? "";
  await signIn(page, physio, next);
  await expect(page).toHaveURL(/\/customers$/);
});

test("a new physio is sent to onboarding, keeping next", async ({ page }) => {
  const physio = await createPhysio();
  try {
    await signIn(page, physio, "/customers");
    await expect(page).toHaveURL(/\/onboarding\?next=%2Fcustomers$/);
  } finally {
    await deletePhysio(physio);
  }
});

test("an unsafe next param falls back to the dashboard", async ({ page, physio }) => {
  await signIn(page, physio, "//evil.example");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("signed-in physios skip the login page", async ({ physioPage: page }) => {
  await page.goto("/login");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("an invalid sign-in link goes back to login with an error", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=not-a-token&type=email");
  await expect(page).toHaveURL(/\/login\?error=linkInvalid$/);
});

test("a signed-in physio whose account was deleted is sent to login without a redirect loop", async ({
  physioPage: page,
  physio,
}) => {
  await deletePhysio(physio);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("sign-in for a user without a profile row goes to login with an error", async ({ page }) => {
  const physio = await createPhysio();
  try {
    await deletePhysioRow(physio.id);
    await signIn(page, physio);
    await expect(page).toHaveURL(/\/login\?error=unknown$/);
  } finally {
    await deletePhysio(physio);
  }
});
