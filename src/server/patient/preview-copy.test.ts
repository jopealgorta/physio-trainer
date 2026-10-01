import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import es from "../../../messages/es.json";

import { previewCopy } from "./preview-copy";

const translator = (locale: "en" | "es") =>
  createTranslator({
    locale,
    messages: locale === "en" ? en : es,
    namespace: "Patient.meta",
  }) as unknown as Parameters<typeof previewCopy>[0];

describe("previewCopy", () => {
  it("titles a routine or plan link with its name, and never names the clinic in the text", () => {
    const routine = previewCopy(translator("en"), {
      target: "routine",
      itemTitle: "Shoulder mobility",
      clinicName: "Kine Sur",
    });
    expect(routine).toEqual({
      title: "Shoulder mobility",
      description: "Open your routine.",
      imageAlt: "Shoulder mobility · Kine Sur",
    });

    const plan = previewCopy(translator("en"), {
      target: "weekly_plan",
      itemTitle: "Back plan",
      clinicName: "Kine Sur",
    });
    expect(plan.title).toBe("Back plan");
    expect(plan.description).toBe("Open your weekly plan.");
    expect(`${plan.title}${plan.description}`).not.toContain("Kine Sur");
  });

  it("keeps the generic text for a customer link (its item name is the patient's)", () => {
    const copy = previewCopy(translator("en"), {
      target: "customer",
      itemTitle: null,
      clinicName: "Kine Sur",
    });
    expect(copy).toEqual({
      title: "Your exercise plan",
      description: "Open your exercises.",
      imageAlt: "Kine Sur",
    });
  });

  it("speaks the customer's language", () => {
    const copy = previewCopy(translator("es"), {
      target: "routine",
      itemTitle: "Rodilla",
      clinicName: "Kine Sur",
    });
    expect(copy.description).toBe("Abrí tu rutina.");
    expect(
      previewCopy(translator("es"), { target: "customer", itemTitle: null, clinicName: "Kine Sur" })
        .title,
    ).toBe("Tu plan de ejercicios");
  });

  it("falls back to the generic text when a routine or plan has no title", () => {
    const copy = previewCopy(translator("en"), {
      target: "routine",
      itemTitle: null,
      clinicName: "Kine Sur",
    });
    expect(copy.title).toBe("Your exercise plan");
  });
});
