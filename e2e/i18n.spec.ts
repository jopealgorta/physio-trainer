import { createPhysio, deletePhysio, expect, signIn, test } from "./helpers/auth";

test.describe("with a Spanish browser", () => {
  test.use({ locale: "es-UY" });

  test("login is in Spanish and the switcher choice sticks", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByRole("button", { name: "Enviar link" })).toBeVisible();

    await page.getByRole("combobox", { name: "Idioma" }).selectOption("en");
    await expect(page.getByRole("button", { name: "Send link" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await page.reload();
    await expect(page.getByRole("button", { name: "Send link" })).toBeVisible();
  });

  test("a new physio onboards in Spanish", async ({ page }) => {
    const physio = await createPhysio();
    try {
      await signIn(page, physio);
      await expect(page).toHaveURL(/\/onboarding/);
      await expect(page.getByRole("heading", { name: "Configurá tu perfil" })).toBeVisible();
      await expect(page.getByLabel("Idioma")).toHaveValue("es");
    } finally {
      await deletePhysio(physio);
    }
  });
});

test("the landing switcher turns the page Spanish", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Language" }).selectOption("es");
  await expect(page.getByRole("link", { name: "Empezar" })).toBeVisible();
});

test("a physio switches the app to Spanish in Settings", async ({ physioPage: page }) => {
  await page.goto("/settings");
  await page.getByLabel("Language").selectOption("es");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Guardado$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Configuración", level: 1 })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Idioma")).toHaveValue("es");
});
