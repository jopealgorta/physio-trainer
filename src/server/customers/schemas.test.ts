import { describe, expect, it } from "vitest";

import {
  caseFieldErrors,
  caseSchema,
  closeCaseSchema,
  customerFieldErrors,
  customerSchema,
  formValues,
} from "./schemas";

const UUID = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";

const customer = (overrides: Record<string, unknown> = {}) =>
  customerSchema.safeParse({ firstName: "Ana", ...overrides });
const kase = (overrides: Record<string, unknown> = {}) =>
  caseSchema.safeParse({ title: "Knee rehab", ...overrides });
const codes = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((issue) => issue.message) ?? [];

describe("customerSchema", () => {
  it("parses a minimal submission, turning blanks into null", () => {
    expect(
      customerSchema.parse({
        firstName: "  Ana ",
        lastName: "",
        email: " ",
        phone: "",
        dateOfBirth: "",
        sex: "",
        occupation: "",
        activity: "",
        medicalHistory: "  ",
        locale: "",
      }),
    ).toEqual({
      firstName: "Ana",
      lastName: null,
      email: null,
      phone: null,
      dateOfBirth: null,
      sex: null,
      occupation: null,
      activity: null,
      medicalHistory: null,
      locale: null,
    });
  });

  it("treats absent optional fields as null", () => {
    expect(customer().data).toMatchObject({ lastName: null, sex: null, locale: null });
  });

  it("requires a first name of at most 60 characters", () => {
    expect(codes(customer({ firstName: "   " }))).toEqual(["nameRequired"]);
    expect(codes(customerSchema.safeParse({}))).toEqual(["nameRequired"]);
    expect(customer({ firstName: "a".repeat(60) }).success).toBe(true);
    expect(codes(customer({ firstName: "a".repeat(61) }))).toEqual(["nameTooLong"]);
  });

  it("validates, trims and lower-cases the email", () => {
    expect(customer({ email: "  Ana@Example.COM " }).data?.email).toBe("ana@example.com");
    expect(codes(customer({ email: "not an email" }))).toEqual(["emailInvalid"]);
    expect(codes(customer({ email: `${"a".repeat(250)}@x.co` }))).toEqual(["emailInvalid"]);
  });

  it("limits the phone to 30 characters", () => {
    expect(customer({ phone: "+598 99 123 456" }).data?.phone).toBe("+598 99 123 456");
    expect(codes(customer({ phone: "1".repeat(31) }))).toEqual(["phoneTooLong"]);
  });

  it("accepts real calendar dates only", () => {
    expect(customer({ dateOfBirth: "1990-05-17" }).data?.dateOfBirth).toBe("1990-05-17");
    expect(codes(customer({ dateOfBirth: "2001-02-29" }))).toEqual(["dateInvalid"]);
    expect(codes(customer({ dateOfBirth: "yesterday" }))).toEqual(["dateInvalid"]);
    expect(customer({ dateOfBirth: "" }).data?.dateOfBirth).toBeNull();
  });

  it("accepts the sex enum only", () => {
    expect(customer({ sex: "female" }).data?.sex).toBe("female");
    expect(codes(customer({ sex: "robot" }))).toEqual(["sexInvalid"]);
  });

  it("accepts supported locales only", () => {
    expect(customer({ locale: "es" }).data?.locale).toBe("es");
    expect(codes(customer({ locale: "fr" }))).toEqual(["localeInvalid"]);
    expect(customer({ locale: "" }).data?.locale).toBeNull();
  });

  it("limits the other text fields", () => {
    expect(codes(customer({ lastName: "a".repeat(61) }))).toEqual(["nameTooLong"]);
    expect(codes(customer({ occupation: "a".repeat(101) }))).toEqual(["tooLong"]);
    expect(codes(customer({ activity: "a".repeat(201) }))).toEqual(["tooLong"]);
    expect(customer({ medicalHistory: "a".repeat(5000) }).success).toBe(true);
    expect(codes(customer({ medicalHistory: "a".repeat(5001) }))).toEqual(["tooLong"]);
  });
});

describe("caseSchema", () => {
  it("parses a minimal submission, turning blanks into null", () => {
    expect(
      caseSchema.parse({
        title: " Knee rehab ",
        diagnosis: "",
        bodyArea: "",
        side: "",
        injuryOn: "",
        surgeryOn: "",
        precautions: "",
        goals: "",
        initialPain: "",
        notes: "",
        openedOn: "",
      }),
    ).toEqual({
      title: "Knee rehab",
      diagnosis: null,
      bodyArea: null,
      side: null,
      injuryOn: null,
      surgeryOn: null,
      precautions: null,
      goals: null,
      initialPain: null,
      notes: null,
      openedOn: null,
    });
  });

  it("requires a title of at most 120 characters", () => {
    expect(codes(kase({ title: " " }))).toEqual(["nameRequired"]);
    expect(codes(kase({ title: "a".repeat(121) }))).toEqual(["nameTooLong"]);
  });

  it("parses the initial pain as a whole number from 0 to 10", () => {
    expect(kase({ initialPain: "7" }).data?.initialPain).toBe(7);
    expect(kase({ initialPain: "0" }).data?.initialPain).toBe(0);
    expect(kase({ initialPain: "" }).data?.initialPain).toBeNull();
    expect(codes(kase({ initialPain: "11" }))).toEqual(["painOutOfRange"]);
    expect(codes(kase({ initialPain: "-1" }))).toEqual(["painOutOfRange"]);
    expect(codes(kase({ initialPain: "abc" }))).toEqual(["painOutOfRange"]);
    expect(codes(kase({ initialPain: "2.5" }))).toEqual(["painOutOfRange"]);
  });

  it("refuses full_body and unknown areas", () => {
    expect(kase({ bodyArea: "knee" }).data?.bodyArea).toBe("knee");
    expect(codes(kase({ bodyArea: "full_body" }))).toEqual(["bodyAreaInvalid"]);
    expect(codes(kase({ bodyArea: "toe" }))).toEqual(["bodyAreaInvalid"]);
  });

  it("needs an area for a side", () => {
    const result = kase({ side: "left" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ path: ["side"], message: "sideNeedsArea" });
    expect(kase({ bodyArea: "knee", side: "left" }).data).toMatchObject({
      bodyArea: "knee",
      side: "left",
    });
    expect(codes(kase({ bodyArea: "knee", side: "up" }))).toEqual(["invalid"]);
  });

  it("accepts real calendar dates and blank opened-on", () => {
    expect(kase({ injuryOn: "2026-01-31", openedOn: "2026-02-01" }).data).toMatchObject({
      injuryOn: "2026-01-31",
      openedOn: "2026-02-01",
    });
    expect(kase({ openedOn: "" }).data?.openedOn).toBeNull();
    expect(codes(kase({ surgeryOn: "2026-02-30" }))).toEqual(["dateInvalid"]);
  });

  it("limits the free-text fields", () => {
    expect(codes(kase({ diagnosis: "a".repeat(501) }))).toEqual(["tooLong"]);
    expect(codes(kase({ precautions: "a".repeat(2001) }))).toEqual(["tooLong"]);
    expect(codes(kase({ goals: "a".repeat(2001) }))).toEqual(["tooLong"]);
    expect(codes(kase({ notes: "a".repeat(5001) }))).toEqual(["tooLong"]);
  });
});

describe("closeCaseSchema", () => {
  it("accepts a blank closing date as null", () => {
    expect(closeCaseSchema.parse({ id: UUID, closedOn: "" })).toEqual({ id: UUID, closedOn: null });
    expect(closeCaseSchema.parse({ id: UUID, closedOn: "2026-03-01" }).closedOn).toBe("2026-03-01");
  });

  it("rejects impossible dates and bad ids", () => {
    const result = closeCaseSchema.safeParse({ id: UUID, closedOn: "2026-02-30" });
    expect(result.error?.issues[0]).toMatchObject({ path: ["closedOn"], message: "dateInvalid" });
    expect(closeCaseSchema.safeParse({ id: "nope", closedOn: "" }).success).toBe(false);
  });
});

describe("field errors", () => {
  it("keeps the first known code per field", () => {
    const result = customerSchema.safeParse({ firstName: "", email: "x", sex: "robot" });
    expect(customerFieldErrors(result.error!)).toEqual({
      firstName: "nameRequired",
      email: "emailInvalid",
      sex: "sexInvalid",
    });
  });

  it("maps unknown codes to invalid", () => {
    const result = customerSchema.safeParse({ firstName: 42 });
    expect(customerFieldErrors(result.error!)).toEqual({ firstName: "invalid" });
  });

  it("includes closedOn for cases", () => {
    const result = closeCaseSchema.safeParse({ id: UUID, closedOn: "nope" });
    expect(caseFieldErrors(result.error!)).toEqual({ closedOn: "dateInvalid" });
    const side = caseSchema.safeParse({ title: "x", side: "left" });
    expect(caseFieldErrors(side.error!)).toEqual({ side: "sideNeedsArea" });
  });
});

describe("formValues", () => {
  it("turns FormData into an object and drops id and customerId", () => {
    const data = new FormData();
    data.append("id", UUID);
    data.append("customerId", UUID);
    data.append("firstName", "Ana");
    data.append("email", "ana@example.com");
    expect(formValues(data)).toEqual({ firstName: "Ana", email: "ana@example.com" });
  });
});
