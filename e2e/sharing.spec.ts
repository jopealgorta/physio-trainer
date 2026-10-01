import { expect, test } from "./helpers/auth";
import {
  insertCustomer,
  insertCustomerLink,
  insertPlan,
  insertRoutine,
  isoWeekdayIn,
  linkRow,
  newCode,
  setBranding,
} from "./helpers/patient";
import { hasNoHorizontalOverflow } from "./helpers/routines";

test.describe("patient page", () => {
  test("shows today's routine, lets the patient switch day, and lists single routines", async ({
    page,
    physio,
  }) => {
    await setBranding(physio.id, { clinicName: "Maria Physio", accent: "#0f766e" });
    const customerId = await insertCustomer(physio.id, { firstName: "Ana" });
    const gym = await insertRoutine(physio.id, customerId, "Gym today", {
      standalone: false,
      exercise: "Squat",
    });
    const rehab = await insertRoutine(physio.id, customerId, "Rehab tomorrow", {
      standalone: false,
      exercise: "Bridge",
    });
    await insertRoutine(physio.id, customerId, "Daily stretch", {
      sessionsPerWeek: 3,
      exercise: "Hamstring stretch",
    });
    await insertPlan(physio.id, customerId, "Week plan", [
      { weekday: isoWeekdayIn(0), routineId: gym, label: "Morning" },
      { weekday: isoWeekdayIn(1), routineId: rehab },
    ]);
    const link = await insertCustomerLink(physio, customerId);

    const response = await page.goto(link.path);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle("Your exercise plan · Maria Physio");
    await expect(page.getByRole("heading", { level: 1, name: "Hi Ana" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
    await expect(page.getByText("Morning")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Gym today", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Squat/ })).toBeVisible();
    await expect(page.getByText("3 × 12").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your routines", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Daily stretch", exact: true })).toBeVisible();
    await expect(page.getByText("3× per week")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Rehab tomorrow", exact: true })).toHaveCount(0);

    // Instructions are collapsed until asked for.
    const instructions = page.getByText("Keep your back straight.").first();
    await expect(instructions).toBeHidden();
    await page.getByText("How to do it").first().click();
    await expect(instructions).toBeVisible();

    // Another day of the plan.
    await page
      .getByRole("navigation", { name: "Week" })
      .getByRole("link")
      .nth(isoWeekdayIn(1) - 1)
      .click();
    await expect(page).toHaveURL(/\?day=\d$/);
    await expect(page.getByRole("heading", { name: "Rehab tomorrow", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Gym today", exact: true })).toHaveCount(0);

    expect(await hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("never shows anything private about the customer", async ({ page, physio }) => {
    const customerId = await insertCustomer(physio.id, { firstName: "Ana" });
    await insertRoutine(physio.id, customerId, "Stretch");
    const link = await insertCustomerLink(physio, customerId);
    await page.goto(link.path);
    const html = await page.content();
    expect(html).not.toContain("Zyxwsurname"); // last name
    expect(html).not.toContain(customerId);
  });

  test("speaks the customer's language, not the physio's", async ({ page, physio }) => {
    const customerId = await insertCustomer(physio.id, { firstName: "Lucía", locale: "es" });
    await insertRoutine(physio.id, customerId, "Estiramiento");
    const link = await insertCustomerLink(physio, customerId, { slug: "lucia" });
    await page.goto(link.path);
    await expect(page.getByRole("heading", { level: 1, name: "Hola Lucía" })).toBeVisible();
    await expect(page.locator("div[lang]").first()).toHaveAttribute("lang", "es");
  });

  test("shows an empty state when nothing is scheduled today", async ({ page, physio }) => {
    const customerId = await insertCustomer(physio.id);
    const link = await insertCustomerLink(physio, customerId);
    await page.goto(link.path);
    await expect(page.getByText("Your physio hasn't scheduled anything for today.")).toBeVisible();
  });

  test("redirects stale handles and slugs to the canonical URL, and 404s unknown codes", async ({
    page,
    request,
    physio,
  }) => {
    const customerId = await insertCustomer(physio.id);
    const link = await insertCustomerLink(physio, customerId, { slug: "ana-lopez" });

    const stale = await request.get(`/old-handle/whatever-${link.code}?day=2`, { maxRedirects: 0 });
    expect(stale.status()).toBe(308);
    expect(stale.headers().location).toContain(`${link.path}?day=2`);

    await page.goto(`/old-handle/whatever-${link.code}`);
    await expect(page).toHaveURL(new RegExp(`${link.path}$`));

    const unknown = await page.goto(`/${physio.handle}/ana-${newCode()}`);
    expect(unknown?.status()).toBe(404);
  });

  test("keeps patient pages private: no-index, no referrer, no caching", async ({
    request,
    physio,
  }) => {
    const customerId = await insertCustomer(physio.id);
    const link = await insertCustomerLink(physio, customerId);
    const response = await request.get(link.path);
    const headers = response.headers();
    expect(headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["cache-control"]).toContain("no-store");
    expect(await response.text()).toContain('<meta name="robots" content="noindex, nofollow"/>');
  });

  test("serves a per-link manifest that installs this link", async ({ request, page, physio }) => {
    await setBranding(physio.id, { clinicName: "Maria Physio", accent: "#0f766e" });
    const customerId = await insertCustomer(physio.id);
    const link = await insertCustomerLink(physio, customerId);

    await page.goto(link.path);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      `${link.path}/manifest.webmanifest`,
    );

    const response = await request.get(`${link.path}/manifest.webmanifest`);
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      name: "Maria Physio",
      start_url: link.path,
      scope: `/${physio.handle}/`,
      display: "standalone",
      theme_color: "#0f766e",
    });

    const gone = await insertCustomerLink(physio, customerId, { slug: "old", revoked: true });
    expect((await request.get(`${gone.path}/manifest.webmanifest`)).status()).toBe(404);
  });

  test("a revoked or expired link shows a friendly page with the physio's contact", async ({
    page,
    physio,
  }) => {
    await setBranding(physio.id, {
      clinicName: "Maria Physio",
      contactPhone: "+59899123456",
    });
    const customerId = await insertCustomer(physio.id);
    await insertRoutine(physio.id, customerId, "Secret routine");
    const revoked = await insertCustomerLink(physio, customerId, { slug: "a", revoked: true });
    await page.goto(revoked.path);
    await expect(
      page.getByRole("heading", { name: "This link is no longer available", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Ask Maria Physio for a new link.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Call" }).first()).toHaveAttribute(
      "href",
      "tel:+59899123456",
    );
    await expect(page.getByText("Secret routine")).toHaveCount(0);

    const customer2 = await insertCustomer(physio.id);
    const expired = await insertCustomerLink(physio, customer2, { slug: "b", expired: true });
    await page.goto(expired.path);
    await expect(
      page.getByRole("heading", { name: "This link has expired", exact: true }),
    ).toBeVisible();
  });

  test("a PIN-protected link asks for the PIN and remembers it", async ({ page, physio }) => {
    const customerId = await insertCustomer(physio.id);
    await insertRoutine(physio.id, customerId, "Protected routine");
    const link = await insertCustomerLink(physio, customerId, { pin: "4821" });

    await page.goto(link.path);
    await expect(page.getByRole("heading", { name: "Enter your PIN", exact: true })).toBeVisible();
    await expect(page.getByText("Protected routine")).toHaveCount(0);

    await page.getByLabel("PIN").fill("1111");
    await page.getByRole("button", { name: "Open" }).click();
    await expect(page.getByText("That PIN is not right. Try again.")).toBeVisible();
    await expect(page.getByText("Protected routine")).toHaveCount(0);

    await page.getByLabel("PIN").fill("4821");
    await page.getByRole("button", { name: "Open" }).click();
    await expect(
      page.getByRole("heading", { name: "Protected routine", exact: true }),
    ).toBeVisible();

    // The cookie keeps this browser unlocked, but only for this link.
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Protected routine", exact: true }),
    ).toBeVisible();
    const cookie = (await page.context().cookies()).find((c) => c.name === `pin_${link.code}`);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax" });
  });

  test("counts an open once per half hour", async ({ page, physio }) => {
    const customerId = await insertCustomer(physio.id);
    const link = await insertCustomerLink(physio, customerId);
    await page.goto(link.path);
    await page.goto(link.path);
    await expect.poll(async () => (await linkRow(link.code)).open_count).toBe(1);
  });
});

test.describe("sharing from the physio's side", () => {
  test("share a customer, protect with a PIN, then revoke", async ({
    physioPage: page,
    physio,
    browser,
  }) => {
    const customerId = await insertCustomer(physio.id, { firstName: "Ana", phone: "+59899123456" });
    await insertRoutine(physio.id, customerId, "Knee routine");
    await page.goto(`/customers/${customerId}`);

    await page.getByRole("button", { name: "Share" }).click();
    const link = page.getByLabel("Link", { exact: true });
    await expect(link).toHaveValue(new RegExp(`/${physio.handle}/ana-[0-9a-hjkmnp-tv-z]{8}$`));
    const url = await link.inputValue();
    await expect(page.getByRole("dialog").getByRole("link", { name: "WhatsApp" })).toHaveAttribute(
      "href",
      /^https:\/\/wa\.me\/59899123456\?text=Hi%20Ana/,
    );
    await expect(page.getByRole("img", { name: "QR code for the link" })).toBeVisible();

    // Turn the PIN on: it is shown once.
    await page.getByRole("checkbox", { name: "Require a PIN" }).click();
    const pinText = await page.getByText(/^PIN: \d{4}$/).textContent();
    const pin = pinText!.replace("PIN: ", "");

    // A patient (no session) is asked for it.
    const patient = await browser.newContext();
    const patientPage = await patient.newPage();
    await patientPage.goto(url);
    await expect(
      patientPage.getByRole("heading", { name: "Enter your PIN", exact: true }),
    ).toBeVisible();
    await patientPage.getByLabel("PIN").fill(pin);
    await patientPage.getByRole("button", { name: "Open" }).click();
    await expect(
      patientPage.getByRole("heading", { name: "Knee routine", exact: true }),
    ).toBeVisible();

    // The physio previews without the PIN.
    const preview = await page.context().newPage();
    await preview.goto(url);
    await expect(preview.getByRole("heading", { name: "Knee routine", exact: true })).toBeVisible();

    // Change the link name: the old URL keeps working through the redirect.
    await page.getByLabel("Link name").fill("ana-lopez");
    await page.getByRole("button", { name: "Save name" }).click();
    await expect(page.getByLabel("Link", { exact: true })).toHaveValue(
      new RegExp(`/${physio.handle}/ana-lopez-`),
    );
    await patientPage.goto(url);
    await expect(patientPage).toHaveURL(/ana-lopez-/);

    // Revoke.
    await page.getByRole("button", { name: "Revoke link" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Revoke" }).click();
    await expect(page.getByText("This link was revoked and no longer works.")).toBeVisible();
    await patientPage.goto(url);
    await expect(
      patientPage.getByRole("heading", { name: "This link is no longer available", exact: true }),
    ).toBeVisible();

    // A new link works again.
    await page.getByRole("button", { name: "Create new link" }).click();
    await expect(page.getByLabel("Link", { exact: true })).toBeVisible();
    await patient.close();
  });

  test("the share popover is a bottom sheet on a phone and a popover on desktop", async ({
    physioPage: page,
    physio,
  }, testInfo) => {
    const isMobile = testInfo.project.name === "mobile";
    const customerId = await insertCustomer(physio.id, { firstName: "Ana" });
    await insertRoutine(physio.id, customerId, "Knee routine");
    await page.goto(`/customers/${customerId}`);
    await page.getByRole("button", { name: "Share" }).click();
    await expect(page.getByLabel("Link", { exact: true })).toBeVisible();

    const content = page.locator('[data-slot="popover-content"]');
    await expect(content).toHaveAttribute("data-presentation", isMobile ? "sheet" : "popover");

    // The last control is reachable (the sheet scrolls) and nothing spills off the screen.
    const revoke = page.getByRole("button", { name: "Revoke link" });
    await revoke.scrollIntoViewIfNeeded();
    const viewport = page.viewportSize()!;
    for (const box of [await content.boundingBox(), await revoke.boundingBox()]) {
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    }
    if (isMobile) expect((await content.boundingBox())!.width).toBe(viewport.width);
  });

  test("archiving the customer revokes their link", async ({
    physioPage: page,
    physio,
    browser,
  }) => {
    const customerId = await insertCustomer(physio.id, { firstName: "Ana" });
    await insertRoutine(physio.id, customerId, "Knee routine");
    await page.goto(`/customers/${customerId}`);
    await page.getByRole("button", { name: "Share" }).click();
    const url = await page.getByLabel("Link", { exact: true }).inputValue();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Archive" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Archive" }).click();
    await expect(page.getByRole("button", { name: "Restore" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Share" })).toHaveCount(0);

    const patient = await browser.newContext();
    const patientPage = await patient.newPage();
    await patientPage.goto(url);
    await expect(
      patientPage.getByRole("heading", { name: "This link is no longer available", exact: true }),
    ).toBeVisible();
    await patient.close();
  });

  test("shares a single routine and a plan from their own pages", async ({
    physioPage: page,
    physio,
    browser,
  }) => {
    const customerId = await insertCustomer(physio.id, { firstName: "Ana" });
    const routineId = await insertRoutine(physio.id, customerId, "Only this routine");
    const other = await insertRoutine(physio.id, customerId, "Another routine");
    const inPlan = await insertRoutine(physio.id, customerId, "Plan routine", {
      standalone: false,
    });
    const planId = await insertPlan(physio.id, customerId, "Only this plan", [
      { weekday: isoWeekdayIn(0), routineId: inPlan },
    ]);
    void other;

    await page.goto(`/routines/${routineId}`);
    await page.getByRole("button", { name: "Share" }).click();
    await expect(
      page.getByRole("heading", { name: "Share this routine", exact: true }),
    ).toBeVisible();
    const routineUrl = await page.getByLabel("Link", { exact: true }).inputValue();

    await page.goto(`/plans/${planId}`);
    await page.getByRole("button", { name: "Share" }).click();
    await expect(page.getByRole("heading", { name: "Share this plan", exact: true })).toBeVisible();
    const planUrl = await page.getByLabel("Link", { exact: true }).inputValue();

    const patient = await browser.newContext();
    const patientPage = await patient.newPage();
    await patientPage.goto(routineUrl);
    await expect(
      patientPage.getByRole("heading", { name: "Only this routine", exact: true }),
    ).toBeVisible();
    await expect(patientPage.getByText("Another routine")).toHaveCount(0);
    await patientPage.goto(planUrl);
    await expect(
      patientPage.getByRole("heading", { name: "Plan routine", exact: true }),
    ).toBeVisible();
    await expect(patientPage.getByText("Only this routine")).toHaveCount(0);
    await patient.close();
  });
});
