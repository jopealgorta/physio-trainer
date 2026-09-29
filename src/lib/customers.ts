/** Customer and case constants shared by the schema, zod and UI (spec 04). */
export const CUSTOMER_SEXES = ["female", "male", "other", "undisclosed"] as const;
export type CustomerSex = (typeof CUSTOMER_SEXES)[number];

export const CASE_STATUSES = ["open", "closed"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

/** Customer hub tabs, addressed as `?tab=`. */
export const CUSTOMER_TABS = ["overview", "routines", "plans", "activity", "notes"] as const;
export type CustomerTab = (typeof CUSTOMER_TABS)[number];

export function parseCustomerTab(value: string | undefined): CustomerTab {
  return (CUSTOMER_TABS as readonly string[]).includes(value ?? "")
    ? (value as CustomerTab)
    : "overview";
}

export const FIRST_NAME_MAX = 60;
export const LAST_NAME_MAX = 60;
export const EMAIL_MAX = 254;
export const PHONE_MAX = 30;
export const OCCUPATION_MAX = 100;
export const ACTIVITY_MAX = 200;
export const MEDICAL_HISTORY_MAX = 5000;
export const CASE_TITLE_MAX = 120;
export const DIAGNOSIS_MAX = 500;
export const PRECAUTIONS_MAX = 2000;
export const GOALS_MAX = 2000;
export const CASE_NOTES_MAX = 5000;
