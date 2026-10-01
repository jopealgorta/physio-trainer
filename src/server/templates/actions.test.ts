import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  assignTemplateAction,
  createTemplateAction,
  duplicateTemplateAction,
  listCasesAction,
  saveAsTemplateAction,
  searchTemplatesAction,
} from "./actions";

const m = vi.hoisted(() => ({
  createTemplate: vi.fn(),
  saveAsTemplate: vi.fn(),
  assignTemplate: vi.fn(),
  duplicateTemplate: vi.fn(),
  getTemplateName: vi.fn(),
  listTemplates: vi.fn(),
  listCustomerCases: vi.fn(),
  withPhysio: vi.fn((fn: (tx: unknown, physioId: string) => unknown) => fn({}, "physio-1")),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));

vi.mock("@/server/auth/session", () => ({ withPhysio: m.withPhysio }));
vi.mock("./mutations", () => ({
  createTemplate: m.createTemplate,
  saveAsTemplate: m.saveAsTemplate,
  assignTemplate: m.assignTemplate,
  duplicateTemplate: m.duplicateTemplate,
}));
vi.mock("./queries", () => ({
  getTemplateName: m.getTemplateName,
  listTemplates: m.listTemplates,
  listCustomerCases: m.listCustomerCases,
}));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => (key === "copySuffix" ? " (copy)" : key),
}));

const ID = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";
const CUSTOMER = "1b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a11";
const CASE = "2b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a12";
const idle = { status: "idle" } as const;
const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
};

beforeEach(() => vi.clearAllMocks());

describe("createTemplateAction", () => {
  it("returns the name error without touching the database", async () => {
    await expect(
      createTemplateAction(idle, form({ kind: "routine", name: "  " })),
    ).resolves.toEqual({ status: "error", fieldErrors: { name: "nameRequired" } });
    expect(m.withPhysio).not.toHaveBeenCalled();
  });

  it("returns nameTooLong past the limit", async () => {
    await expect(
      createTemplateAction(idle, form({ kind: "plan", name: "x".repeat(81) })),
    ).resolves.toEqual({ status: "error", fieldErrors: { name: "nameTooLong" } });
  });

  it("rejects an unknown kind as invalid", async () => {
    await expect(
      createTemplateAction(idle, form({ kind: "workout", name: "Week" })),
    ).resolves.toEqual({ status: "error", fieldErrors: {}, formError: "invalid" });
    expect(m.createTemplate).not.toHaveBeenCalled();
  });

  it.each([
    ["routine", `/routines/${ID}`],
    ["plan", `/plans/${ID}`],
  ])("creates a %s template, revalidates and redirects to %s", async (kind, path) => {
    m.createTemplate.mockResolvedValue({ ok: true, data: { id: ID } });
    await expect(createTemplateAction(idle, form({ kind, name: "ACL" }))).rejects.toThrow(
      `REDIRECT ${path}`,
    );
    expect(m.createTemplate).toHaveBeenCalledWith({}, "physio-1", { kind, name: "ACL" });
    expect(m.revalidatePath).toHaveBeenCalledWith("/routines", "layout");
    expect(m.revalidatePath).toHaveBeenCalledWith("/plans", "layout");
    expect(m.revalidatePath).toHaveBeenCalledWith("/customers", "layout");
  });

  it("surfaces a mutation error as formError", async () => {
    m.createTemplate.mockResolvedValue({ ok: false, error: "notFound" });
    await expect(
      createTemplateAction(idle, form({ kind: "routine", name: "ACL" })),
    ).resolves.toEqual({ status: "error", fieldErrors: {}, formError: "notFound" });
    expect(m.redirect).not.toHaveBeenCalled();
  });
});

describe("saveAsTemplateAction", () => {
  it("never reaches the mutation with a malformed source id", async () => {
    await expect(
      saveAsTemplateAction(idle, form({ kind: "routine", sourceId: "nope", name: "ACL" })),
    ).resolves.toEqual({ status: "error", fieldErrors: {}, formError: "invalid" });
    expect(m.withPhysio).not.toHaveBeenCalled();
  });

  it("returns the name error", async () => {
    await expect(
      saveAsTemplateAction(idle, form({ kind: "plan", sourceId: ID, name: "" })),
    ).resolves.toEqual({ status: "error", fieldErrors: { name: "nameRequired" } });
  });

  it("redirects to the new template", async () => {
    m.saveAsTemplate.mockResolvedValue({ ok: true, data: { id: CUSTOMER } });
    await expect(
      saveAsTemplateAction(idle, form({ kind: "plan", sourceId: ID, name: "Week" })),
    ).rejects.toThrow(`REDIRECT /plans/${CUSTOMER}`);
    expect(m.saveAsTemplate).toHaveBeenCalledWith({}, "physio-1", {
      kind: "plan",
      sourceId: ID,
      name: "Week",
    });
  });

  it("surfaces alreadyTemplate", async () => {
    m.saveAsTemplate.mockResolvedValue({ ok: false, error: "alreadyTemplate" });
    await expect(
      saveAsTemplateAction(idle, form({ kind: "routine", sourceId: ID, name: "ACL" })),
    ).resolves.toEqual({ status: "error", fieldErrors: {}, formError: "alreadyTemplate" });
  });
});

describe("assignTemplateAction", () => {
  const fields = {
    kind: "routine",
    templateId: ID,
    customerId: CUSTOMER,
    caseId: "",
    name: "ACL for Ana",
    status: "draft",
  };

  it("treats a blank or malformed customer as customerNotFound without a query", async () => {
    await expect(assignTemplateAction(idle, form({ ...fields, customerId: "" }))).resolves.toEqual({
      status: "error",
      fieldErrors: {},
      formError: "customerNotFound",
    });
    await expect(
      assignTemplateAction(idle, form({ ...fields, customerId: "nope" })),
    ).resolves.toEqual({ status: "error", fieldErrors: {}, formError: "customerNotFound" });
    expect(m.withPhysio).not.toHaveBeenCalled();
  });

  it("treats a malformed template id as templateNotFound", async () => {
    await expect(
      assignTemplateAction(idle, form({ ...fields, templateId: "nope" })),
    ).resolves.toEqual({ status: "error", fieldErrors: {}, formError: "templateNotFound" });
    expect(m.assignTemplate).not.toHaveBeenCalled();
  });

  it("returns the name error", async () => {
    await expect(assignTemplateAction(idle, form({ ...fields, name: " " }))).resolves.toEqual({
      status: "error",
      fieldErrors: { name: "nameRequired" },
    });
  });

  it("rejects the archived status as invalid", async () => {
    await expect(
      assignTemplateAction(idle, form({ ...fields, status: "archived" })),
    ).resolves.toEqual({ status: "error", fieldErrors: {}, formError: "invalid" });
    expect(m.assignTemplate).not.toHaveBeenCalled();
  });

  it("assigns with a blank case as null and redirects to the copy", async () => {
    m.assignTemplate.mockResolvedValue({ ok: true, data: { id: CASE } });
    await expect(assignTemplateAction(idle, form(fields))).rejects.toThrow(
      `REDIRECT /routines/${CASE}`,
    );
    expect(m.assignTemplate).toHaveBeenCalledWith({}, "physio-1", {
      kind: "routine",
      templateId: ID,
      customerId: CUSTOMER,
      caseId: null,
      name: "ACL for Ana",
      status: "draft",
    });
    expect(m.revalidatePath).toHaveBeenCalledWith("/customers", "layout");
  });

  it("redirects a plan copy to the plan", async () => {
    m.assignTemplate.mockResolvedValue({ ok: true, data: { id: CASE } });
    await expect(
      assignTemplateAction(idle, form({ ...fields, kind: "plan", status: "active" })),
    ).rejects.toThrow(`REDIRECT /plans/${CASE}`);
  });

  it.each(["templateArchived", "customerArchived", "needsItems", "needsEntries", "caseNotFound"])(
    "surfaces %s",
    async (error) => {
      m.assignTemplate.mockResolvedValue({ ok: false, error });
      await expect(assignTemplateAction(idle, form(fields))).resolves.toEqual({
        status: "error",
        fieldErrors: {},
        formError: error,
      });
    },
  );
});

describe("duplicateTemplateAction", () => {
  it("rejects malformed input without a query", async () => {
    await expect(duplicateTemplateAction({ kind: "routine", templateId: "nope" })).resolves.toEqual(
      { ok: false, error: "invalid" },
    );
    await expect(duplicateTemplateAction("x")).resolves.toEqual({ ok: false, error: "invalid" });
    expect(m.withPhysio).not.toHaveBeenCalled();
  });

  it("names the copy after the source with the locale's suffix", async () => {
    m.getTemplateName.mockResolvedValue("ACL phase 1");
    m.duplicateTemplate.mockResolvedValue({ ok: true, data: { id: CASE } });
    await expect(duplicateTemplateAction({ kind: "routine", templateId: ID })).resolves.toEqual({
      ok: true,
      data: { id: CASE },
    });
    expect(m.duplicateTemplate).toHaveBeenCalledWith({}, "physio-1", {
      kind: "routine",
      templateId: ID,
      name: "ACL phase 1 (copy)",
    });
    expect(m.revalidatePath).toHaveBeenCalledWith("/routines", "layout");
  });

  it("cuts an 80-character name so the copy still fits", async () => {
    m.getTemplateName.mockResolvedValue("x".repeat(80));
    m.duplicateTemplate.mockResolvedValue({ ok: true, data: { id: CASE } });
    await duplicateTemplateAction({ kind: "plan", templateId: ID });
    const { name } = m.duplicateTemplate.mock.calls[0][2];
    expect(name).toHaveLength(80);
    expect(name.endsWith(" (copy)")).toBe(true);
  });

  it("answers templateNotFound when the source is not the physio's template", async () => {
    m.getTemplateName.mockResolvedValue(null);
    await expect(duplicateTemplateAction({ kind: "routine", templateId: ID })).resolves.toEqual({
      ok: false,
      error: "templateNotFound",
    });
    expect(m.duplicateTemplate).not.toHaveBeenCalled();
  });

  it("returns a mutation error as is and does not revalidate", async () => {
    m.getTemplateName.mockResolvedValue("ACL");
    m.duplicateTemplate.mockResolvedValue({ ok: false, error: "templateNotFound" });
    await expect(duplicateTemplateAction({ kind: "routine", templateId: ID })).resolves.toEqual({
      ok: false,
      error: "templateNotFound",
    });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("searchTemplatesAction", () => {
  it("returns nothing for an unknown kind", async () => {
    await expect(searchTemplatesAction({ kind: "x" as never })).resolves.toEqual([]);
    expect(m.withPhysio).not.toHaveBeenCalled();
  });

  it("searches active templates with a trimmed query", async () => {
    m.listTemplates.mockResolvedValue([{ id: ID, name: "ACL", detail: 4 }]);
    await expect(searchTemplatesAction({ kind: "routine", q: "  acl " })).resolves.toEqual([
      { id: ID, name: "ACL", detail: 4 },
    ]);
    expect(m.listTemplates).toHaveBeenCalledWith({}, "physio-1", "routine", "acl", 50);
  });

  it("treats a missing query as empty and caps its length", async () => {
    m.listTemplates.mockResolvedValue([]);
    await searchTemplatesAction({ kind: "plan" });
    await searchTemplatesAction({ kind: "plan", q: "y".repeat(500) });
    expect(m.listTemplates.mock.calls[0][3]).toBe("");
    expect(m.listTemplates.mock.calls[1][3]).toHaveLength(100);
  });
});

describe("listCasesAction", () => {
  it("returns nothing for a malformed id without a query", async () => {
    await expect(listCasesAction("nope")).resolves.toEqual([]);
    expect(m.withPhysio).not.toHaveBeenCalled();
  });

  it("lists the customer's cases", async () => {
    m.listCustomerCases.mockResolvedValue([{ id: CASE, title: "Knee" }]);
    await expect(listCasesAction(CUSTOMER)).resolves.toEqual([{ id: CASE, title: "Knee" }]);
    expect(m.listCustomerCases).toHaveBeenCalledWith({}, "physio-1", CUSTOMER);
  });
});
