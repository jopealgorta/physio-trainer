import { describe, expect, it } from "vitest";

import { brandingFieldErrors, brandingSchema, checkLogo } from "./schemas";

const form = (overrides: Record<string, string> = {}) => ({
  clinicName: "",
  accentColor: "",
  contactEmail: "",
  contactPhone: "",
  website: "",
  ...overrides,
});

describe("brandingSchema", () => {
  it("turns blank fields into null and a missing checkbox into false", () => {
    expect(brandingSchema.parse(form())).toEqual({
      clinicName: null,
      accentColor: null,
      contactEmail: null,
      contactPhone: null,
      website: null,
      showContactToPatients: false,
      removeLogo: false,
    });
  });

  it("normalises values", () => {
    expect(
      brandingSchema.parse(
        form({
          clinicName: "  Kine Sur ",
          accentColor: "#0F766E",
          contactEmail: " Hola@Kine.com ",
          contactPhone: "+54 9 11 1234-5678",
          website: "kine.com",
          showContactToPatients: "on",
          removeLogo: "1",
        }),
      ),
    ).toEqual({
      clinicName: "Kine Sur",
      accentColor: "#0f766e",
      contactEmail: "hola@kine.com",
      contactPhone: "+5491112345678",
      website: "https://kine.com/",
      showContactToPatients: true,
      removeLogo: true,
    });
  });

  it("maps problems to i18n keys", () => {
    const result = brandingSchema.safeParse(
      form({
        clinicName: "x".repeat(81),
        accentColor: "teal",
        contactEmail: "nope",
        contactPhone: "11 1234 5678",
        website: "http://kine.com",
      }),
    );
    expect(result.success).toBe(false);
    expect(brandingFieldErrors(result.error!)).toEqual({
      clinicName: "clinicNameTooLong",
      accentColor: "accentInvalid",
      contactEmail: "emailInvalid",
      contactPhone: "phoneInvalid",
      website: "websiteNotHttps",
    });
  });

  it("tolerates missing fields (a tampered post)", () => {
    expect(brandingSchema.safeParse({}).success).toBe(true);
  });
});

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe("checkLogo", () => {
  it("accepts a PNG by content, whatever it is called", async () => {
    const file = new File([new Uint8Array([...PNG_HEADER, 1, 2, 3])], "logo.txt", {
      type: "text/plain",
    });
    await expect(checkLogo(file)).resolves.toMatchObject({ ok: true, logo: { type: "png" } });
  });
  it("rejects a text file renamed .png", async () => {
    const file = new File(["hello"], "logo.png", { type: "image/png" });
    await expect(checkLogo(file)).resolves.toEqual({ ok: false, error: "logoInvalidType" });
  });
  it("rejects files over 2 MB before reading them", async () => {
    const file = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.png");
    await expect(checkLogo(file)).resolves.toEqual({ ok: false, error: "logoTooLarge" });
  });
});
