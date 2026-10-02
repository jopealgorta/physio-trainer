import { describe, expect, it } from "vitest";

import es from "../../../messages/es.json";

import { exportTranslators } from "./translate";

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
});
