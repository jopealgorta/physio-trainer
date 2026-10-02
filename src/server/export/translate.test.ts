import { describe, expect, it } from "vitest";

import es from "../../../messages/es.json";

import { exportTranslators, frequencyLine } from "./translate";

describe("exportTranslators", () => {
  it("translates Export keys with the requested locale", async () => {
    const en = await exportTranslators("en");
    const esT = await exportTranslators("es");
    const enPage = en.t("pdf.page", { page: 1, total: 3 });
    const esPage = esT.t("pdf.page", { page: 1, total: 3 });
    expect(esPage).toContain("1");
    expect(esPage).toContain("3");
    expect(esPage).not.toBe(enPage);
    expect(enPage).toBe("Page 1 of 3");
  });

  it("exposes Prescription strings through summary", async () => {
    const { summary } = await exportTranslators("es");
    expect(summary("sides.left")).toBe(es.Prescription.sides.left);
  });

  it.each([
    ["en", 1, "1 session a week", "1 time a day"],
    ["en", 3, "3 sessions a week", "3 times a day"],
    ["es", 1, "1 sesión por semana", "1 vez por día"],
    ["es", 3, "3 sesiones por semana", "3 veces por día"],
  ] as const)("pluralises the %s frequency strings for %i", async (locale, n, week, day) => {
    const { t } = await exportTranslators(locale);
    expect(t("pdf.sessions", { perWeek: n })).toBe(week);
    expect(t("pdf.sessionsPerDay", { perDay: n })).toBe(day);
  });

  it.each(["en", "es"] as const)("renders nothing for zero sessions in %s", async (locale) => {
    const { t } = await exportTranslators(locale);
    expect(t("pdf.sessions", { perWeek: 0 })).toBe("");
    expect(t("pdf.sessionsPerDay", { perDay: 0 })).toBe("");
  });
});

describe("frequencyLine", () => {
  it("joins per week and per day like the patient page", async () => {
    const { t } = await exportTranslators("en");
    expect(frequencyLine({ sessionsPerWeek: 3, sessionsPerDay: 2 }, t)).toBe(
      "3 sessions a week · 2 times a day",
    );
  });

  it("shows only what is set", async () => {
    const { t } = await exportTranslators("es");
    expect(frequencyLine({ sessionsPerWeek: null, sessionsPerDay: 3 }, t)).toBe("3 veces por día");
    expect(frequencyLine({ sessionsPerWeek: 4, sessionsPerDay: null }, t)).toBe(
      "4 sesiones por semana",
    );
    expect(frequencyLine({ sessionsPerWeek: 0, sessionsPerDay: 0 }, t)).toBeNull();
    expect(frequencyLine({ sessionsPerWeek: null, sessionsPerDay: null }, t)).toBeNull();
  });
});
