import { z } from "zod";

import { isCalendarDate } from "@/lib/calendar-date";
import { slugify } from "@/lib/handles";
import { SLUG_MAX, type ShareTarget } from "@/lib/share-links";
import { idSchema, isUuid, type Result } from "@/server/customers/schemas";

export { idSchema, isUuid, type Result };

/** Which link a popover is about: the customer's, or one routine or plan of theirs. */
export const shareRefSchema = z.discriminatedUnion("target", [
  z.object({ target: z.literal("customer"), customerId: z.uuid() }),
  z.object({ target: z.literal("routine"), routineId: z.uuid() }),
  z.object({ target: z.literal("weekly_plan"), weeklyPlanId: z.uuid() }),
]);
export type ShareRef = z.infer<typeof shareRefSchema>;

/** The slug a physio typed, normalised the way links are built ("María L." → "maria-l"). */
export const slugInputSchema = z
  .string()
  .transform((value) => slugify(value).slice(0, SLUG_MAX).replace(/-+$/, ""))
  .pipe(z.string().min(1, "slugRequired"));

export const expiryInputSchema = z
  .union([z.null(), z.string().refine(isCalendarDate, "expiryInvalid")])
  .transform((value) => value ?? null);

export const updateLinkSchema = z.object({
  id: z.uuid(),
  slug: slugInputSchema.optional(),
  /** `YYYY-MM-DD` (the link works through that day in the physio's time zone) or null for none. */
  expiresOn: expiryInputSchema.optional(),
});
export type UpdateLinkInput = z.output<typeof updateLinkSchema>;

export const setPinSchema = z.object({ id: z.uuid(), enabled: z.boolean() });

export type ShareLinkStatus = "active" | "expired" | "revoked";

/** A link as the popover shows it. Dates are ISO strings so the object crosses to the client. */
export type ShareLinkView = {
  id: string;
  target: ShareTarget;
  slug: string;
  code: string;
  url: string;
  status: ShareLinkStatus;
  hasPin: boolean;
  /** `YYYY-MM-DD` in the physio's time zone, the last day the link works. */
  expiresOn: string | null;
  openCount: number;
  lastOpenedAt: string | null;
  qr: { size: number; path: string };
};

/** What the popover needs besides the link: ready-made share URLs in the customer's language. */
export type ShareState = {
  link: ShareLinkView | null;
  /** Draft or archived items show nothing to the patient yet; customers have no status. */
  itemStatus: "draft" | "active" | "archived" | null;
  whatsappHref: string;
  mailtoHref: string;
  /** Today in the physio's time zone, the earliest expiry the form accepts. */
  today: string;
};

export type ShareError =
  "notFound" | "customerArchived" | "slugRequired" | "expiryInPast" | "invalid";
