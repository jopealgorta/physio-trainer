import { describe, expect, it } from "vitest";

import {
  assignTemplateSchema,
  createTemplateSchema,
  duplicateTemplateSchema,
  saveAsTemplateSchema,
} from "./schemas";

const ID = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";
const C = "1b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a11";

const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? [] : (result.error?.issues.map((issue) => issue.message) ?? []);

describe("createTemplateSchema", () => {
  it("trims the name", () => {
    expect(createTemplateSchema.parse({ kind: "plan", name: " ACL phase 1 " })).toEqual({
      kind: "plan",
      name: "ACL phase 1",
    });
  });

  it("rejects a blank, missing or 81-char name", () => {
    expect(messages(createTemplateSchema.safeParse({ kind: "routine", name: "  " }))).toContain(
      "nameRequired",
    );
    expect(messages(createTemplateSchema.safeParse({ kind: "routine" }))).toContain("nameRequired");
    expect(
      messages(createTemplateSchema.safeParse({ kind: "plan", name: "x".repeat(81) })),
    ).toContain("nameTooLong");
    expect(createTemplateSchema.safeParse({ kind: "plan", name: "x".repeat(80) }).success).toBe(
      true,
    );
  });

  it("rejects an unknown kind", () => {
    expect(createTemplateSchema.safeParse({ kind: "customer", name: "X" }).success).toBe(false);
  });
});

describe("saveAsTemplateSchema and duplicateTemplateSchema", () => {
  it("need a uuid and a name", () => {
    expect(saveAsTemplateSchema.parse({ kind: "routine", sourceId: ID, name: "T" })).toEqual({
      kind: "routine",
      sourceId: ID,
      name: "T",
    });
    expect(
      saveAsTemplateSchema.safeParse({ kind: "routine", sourceId: "x", name: "T" }).success,
    ).toBe(false);
    expect(duplicateTemplateSchema.parse({ kind: "plan", templateId: ID, name: "T" })).toEqual({
      kind: "plan",
      templateId: ID,
      name: "T",
    });
    expect(
      messages(duplicateTemplateSchema.safeParse({ kind: "plan", templateId: ID, name: "" })),
    ).toContain("nameRequired");
  });
});

describe("assignTemplateSchema", () => {
  const base = { kind: "routine", templateId: ID, customerId: C, name: "Knee", status: "draft" };

  it("turns a blank case into null", () => {
    expect(assignTemplateSchema.parse({ ...base, caseId: "" })).toMatchObject({ caseId: null });
    expect(assignTemplateSchema.parse({ ...base, caseId: ID })).toMatchObject({ caseId: ID });
  });

  it("rejects archived, a long name and a bad customer", () => {
    expect(
      assignTemplateSchema.safeParse({ ...base, caseId: "", status: "archived" }).success,
    ).toBe(false);
    expect(
      messages(assignTemplateSchema.safeParse({ ...base, caseId: "", name: "x".repeat(81) })),
    ).toContain("nameTooLong");
    expect(assignTemplateSchema.safeParse({ ...base, caseId: "", customerId: "x" }).success).toBe(
      false,
    );
  });
});
