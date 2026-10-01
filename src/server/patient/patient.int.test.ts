import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { runAsPhysio } from "@/db/rls";
import { customers, physios, shareLinks } from "@/db/schema";
import { env } from "@/env";
import { insertCustomer, insertExercise, insertPlan, insertRoutine } from "@/test/int/content";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";
import {
  ensureShareLink,
  renewShareLink,
  revokeShareLink,
  setSharePin,
  updateShareLink,
} from "@/server/sharing/mutations";
import { setCustomerArchived } from "@/server/customers/mutations";

import { pinCookieName, pinToken } from "./pin-cookie";
import { hasLinkAccess, resolveLink } from "./resolve-link";
import { TOUCH_INTERVAL_MINUTES, touchLink } from "./touch";
import { getPatientView, getReachableRoutine } from "./view";

// Wednesday 7 Oct 2026, in the test physio's time zone (UTC, the column default).
const NOW = new Date("2026-10-07T10:00:00Z");
const WEDNESDAY = 3;

describe("patient data layer", () => {
  const created: TestPhysio[] = [];
  let physio: TestPhysio;
  let other: TestPhysio;

  const as = <T>(who: TestPhysio, fn: Parameters<typeof runAsPhysio<T>>[1]) =>
    runAsPhysio(who.claims, fn);
  const linkFor = async (who: TestPhysio, ref: Parameters<typeof ensureShareLink>[2]) => {
    const result = await as(who, (tx, id) => ensureShareLink(tx, id, ref));
    if (!result.ok) throw new Error(result.error);
    return result.data.link;
  };
  const customerLink = (who: TestPhysio, customerId: string) =>
    linkFor(who, { target: "customer", customerId });
  const resolved = async (code: string) => {
    const result = await resolveLink(code, NOW);
    if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`);
    return result;
  };
  const viewOf = async (code: string, weekday: number | null = null) => {
    const { shell, link } = await resolved(code);
    return getPatientView(shell, link, weekday, NOW);
  };

  beforeAll(async () => {
    physio = await createTestPhysio({ onboarded: true });
    other = await createTestPhysio({ onboarded: true });
    created.push(physio, other);
    await db
      .update(physios)
      .set({ displayName: "Dra. Maria", clinicName: "Maria Physio", locale: "en" })
      .where(eq(physios.id, physio.id));
  });
  afterAll(() => deleteTestPhysios(...created));

  describe("resolveLink", () => {
    it("returns not_found for malformed and unknown codes without touching the database", async () => {
      expect(await resolveLink("nope")).toEqual({ status: "not_found" });
      expect(await resolveLink("ABCDEFGH")).toEqual({ status: "not_found" });
      expect(await resolveLink("abcdefgh")).toEqual({ status: "not_found" });
    });

    it("resolves a live link with the customer's first name, locale and the physio's branding", async () => {
      const customerId = await insertCustomer(physio.id, {
        firstName: "Ana",
        lastName: "Secret",
        locale: "es",
        email: "ana@example.com",
        phone: "+59899123456",
        medicalHistory: "private",
      });
      const link = await customerLink(physio, customerId);
      const result = await resolved(link.code);
      expect(result.link).toMatchObject({
        id: link.id,
        target: "customer",
        customerId,
        customerFirstName: "Ana",
      });
      expect(result.shell).toMatchObject({
        physioId: physio.id,
        slug: "ana",
        code: link.code,
        locale: "es",
        timeZone: "UTC",
      });
      expect(result.shell.branding.clinicName).toBe("Maria Physio");
      // Nothing about the customer beyond the first name reaches the patient layer.
      const serialised = JSON.stringify(result);
      for (const secret of ["Secret", "ana@example.com", "59899123456", "private"]) {
        expect(serialised).not.toContain(secret);
      }
    });

    it("reports revoked links as unavailable, with the shell for the friendly page", async () => {
      const customerId = await insertCustomer(physio.id);
      const link = await customerLink(physio, customerId);
      await as(physio, (tx, id) => revokeShareLink(tx, id, link.id));
      const result = await resolveLink(link.code, NOW);
      expect(result).toMatchObject({ status: "unavailable", reason: "revoked" });
      if (result.status === "unavailable")
        expect(result.shell.branding.clinicName).toBe("Maria Physio");
    });

    it("reports regenerated links: the old code is unavailable, the new one works", async () => {
      const customerId = await insertCustomer(physio.id);
      const old = await customerLink(physio, customerId);
      const renewed = await as(physio, (tx, id) =>
        renewShareLink(tx, id, { target: "customer", customerId }),
      );
      if (!renewed.ok) throw new Error(renewed.error);
      expect((await resolveLink(old.code, NOW)).status).toBe("unavailable");
      expect((await resolveLink(renewed.data.link.code, NOW)).status).toBe("ok");
    });

    it("reports expired links (the whole expiry day still works)", async () => {
      const customerId = await insertCustomer(physio.id);
      const link = await customerLink(physio, customerId);
      await as(physio, (tx, id) =>
        updateShareLink(tx, id, { id: link.id, expiresOn: "2026-10-07" }, NOW),
      );
      expect((await resolveLink(link.code, new Date("2026-10-07T23:59:00Z"))).status).toBe("ok");
      expect(await resolveLink(link.code, new Date("2026-10-08T00:00:00Z"))).toMatchObject({
        status: "unavailable",
        reason: "expired",
      });
    });

    it("reports links of an archived customer as unavailable", async () => {
      const customerId = await insertCustomer(physio.id);
      const link = await customerLink(physio, customerId);
      // Archiving through the mutation also revokes; clear that to prove the archive check itself.
      await db
        .update(customers)
        .set({ archivedAt: new Date() })
        .where(eq(customers.id, customerId));
      expect(await resolveLink(link.code, NOW)).toMatchObject({
        status: "unavailable",
        reason: "customer_archived",
      });
    });

    it("archiving a customer through the app revokes the link", async () => {
      const customerId = await insertCustomer(physio.id);
      const link = await customerLink(physio, customerId);
      await as(physio, (tx, id) => setCustomerArchived(tx, id, customerId, true));
      expect(await resolveLink(link.code, NOW)).toMatchObject({ status: "unavailable" });
    });

    it("follows renames: the link still resolves and exposes the current handle and slug", async () => {
      const customerId = await insertCustomer(physio.id, { firstName: "Renamed" });
      const link = await customerLink(physio, customerId);
      await as(physio, (tx, id) => updateShareLink(tx, id, { id: link.id, slug: "new-slug" }));
      const result = await resolved(link.code);
      expect(result.shell.slug).toBe("new-slug");
      expect(result.shell.handle).toMatch(/^int-/);
    });
  });

  describe("hasLinkAccess", () => {
    const shell = { code: "7k2m9qpx", physioId: "owner-id" };

    it("is open without a PIN", () => {
      expect(
        hasLinkAccess(shell, { pinHash: null }, { pinToken: undefined, sessionPhysioId: null }),
      ).toBe(true);
    });

    it("needs a valid token with a PIN, and accepts the owner's session", () => {
      const link = { pinHash: "hash" };
      expect(hasLinkAccess(shell, link, { pinToken: undefined, sessionPhysioId: null })).toBe(
        false,
      );
      expect(hasLinkAccess(shell, link, { pinToken: "junk", sessionPhysioId: null })).toBe(false);
      expect(
        hasLinkAccess(shell, link, { pinToken: undefined, sessionPhysioId: "someone-else" }),
      ).toBe(false);
      expect(hasLinkAccess(shell, link, { pinToken: undefined, sessionPhysioId: "owner-id" })).toBe(
        true,
      );
      const token = pinToken(env.SUPABASE_SECRET_KEY, shell.code, "hash");
      expect(hasLinkAccess(shell, link, { pinToken: token, sessionPhysioId: null })).toBe(true);
    });

    it("a token stops working after the PIN is regenerated", async () => {
      const customerId = await insertCustomer(physio.id);
      const link = await customerLink(physio, customerId);
      const first = await as(physio, (tx, id) => setSharePin(tx, id, link.id, true));
      if (!first.ok) throw new Error(first.error);
      const before = await resolved(link.code);
      const token = pinToken(env.SUPABASE_SECRET_KEY, link.code, before.link.pinHash!);
      const request = { pinToken: token, sessionPhysioId: null };
      expect(hasLinkAccess(before.shell, before.link, request)).toBe(true);

      await as(physio, (tx, id) => setSharePin(tx, id, link.id, true));
      const after = await resolved(link.code);
      expect(hasLinkAccess(after.shell, after.link, request)).toBe(false);
      expect(pinCookieName(link.code)).toBe(`pin_${link.code}`);
    });
  });

  describe("getPatientView", () => {
    it("shows today's plan entries, other days on request, and active single routines", async () => {
      const customerId = await insertCustomer(physio.id);
      const squat = await insertExercise(physio.id, {
        name: "Squat",
        instructions: "Keep your back straight",
        youtubeId: "dQw4w9WgXcQ",
      });
      const bridge = await insertExercise(physio.id, { name: "Bridge" });
      const gym = await insertRoutine(physio.id, customerId, {
        name: "Gym",
        status: "active",
        isStandalone: false,
        notes: "Warm up first",
        items: [{ exerciseId: squat, reps: 8, sets: 4, notes: "Slow" }],
      });
      const rehab = await insertRoutine(physio.id, customerId, {
        name: "Rehab",
        status: "active",
        isStandalone: false,
        items: [{ exerciseId: bridge }],
      });
      const standalone = await insertRoutine(physio.id, customerId, {
        name: "Daily stretch",
        status: "active",
        sessionsPerWeek: 3,
        items: [{ exerciseId: bridge, reps: 15 }],
      });
      await insertPlan(physio.id, customerId, {
        name: "Week",
        status: "active",
        entries: [
          { weekday: WEDNESDAY, routineId: gym, label: "Morning" },
          { weekday: WEDNESDAY, routineId: rehab, label: "Evening" },
          { weekday: 5, routineId: rehab },
        ],
      });
      const link = await customerLink(physio, customerId);

      const view = await viewOf(link.code);
      expect(view).toMatchObject({
        today: "2026-10-07",
        todayWeekday: WEDNESDAY,
        weekday: WEDNESDAY,
        weekdaysWithContent: [3, 5],
        nextStart: null,
      });
      expect(view.plans).toHaveLength(1);
      const [morning, evening] = view.plans[0]!.entries;
      expect(morning).toMatchObject({
        label: "Morning",
        routine: { name: "Gym", notes: "Warm up first" },
      });
      expect(evening).toMatchObject({ label: "Evening", routine: { name: "Rehab" } });
      const item = (
        morning!.routine.blocks[0] as {
          kind: "single";
          item: {
            name: string;
            instructions: string | null;
            notes: string | null;
            sets: unknown[];
            media: unknown[];
          };
        }
      ).item;
      expect(item).toMatchObject({
        name: "Squat",
        instructions: "Keep your back straight",
        notes: "Slow",
        media: [{ videoId: "dQw4w9WgXcQ", isShort: false }],
      });
      expect(item.sets).toHaveLength(4);
      expect(view.routines.map((routine) => routine.id)).toEqual([standalone]);
      expect(view.routines[0]).toMatchObject({ name: "Daily stretch", sessionsPerWeek: 3 });

      const friday = await viewOf(link.code, 5);
      expect(friday.weekday).toBe(5);
      expect(friday.plans[0]!.entries.map((entry) => entry.routine.name)).toEqual(["Rehab"]);
      const monday = await viewOf(link.code, 1);
      expect(monday.plans[0]!.entries).toEqual([]);
      // A nonsense weekday falls back to today.
      expect((await viewOf(link.code, 99)).weekday).toBe(WEDNESDAY);
    });

    it("groups supersets into one block with the shared rest", async () => {
      const customerId = await insertCustomer(physio.id);
      const a = await insertExercise(physio.id, { name: "A" });
      const b = await insertExercise(physio.id, { name: "B" });
      const c = await insertExercise(physio.id, { name: "C" });
      await insertRoutine(physio.id, customerId, {
        name: "Mix",
        status: "active",
        items: [
          { exerciseId: a, group: "g1", sets: 2 },
          { exerciseId: b, group: "g1", sets: 2 },
          { exerciseId: c },
        ],
      });
      const link = await customerLink(physio, customerId);
      const [routine] = (await viewOf(link.code)).routines;
      expect(routine!.blocks.map((block) => block.kind)).toEqual(["group", "single"]);
      const group = routine!.blocks[0]!;
      if (group.kind !== "group") throw new Error("expected a group");
      expect(group.items.map((item) => item.name)).toEqual(["A", "B"]);
    });

    it("hides drafts, archived items, ended and not-yet-started phases", async () => {
      const customerId = await insertCustomer(physio.id);
      const ex = await insertExercise(physio.id);
      const base = { items: [{ exerciseId: ex }] };
      await insertRoutine(physio.id, customerId, { ...base, name: "draft", status: "draft" });
      await insertRoutine(physio.id, customerId, { ...base, name: "archived", status: "archived" });
      await insertRoutine(physio.id, customerId, {
        ...base,
        name: "ended",
        status: "active",
        endsOn: "2026-10-06",
      });
      await insertRoutine(physio.id, customerId, {
        ...base,
        name: "future",
        status: "active",
        startsOn: "2026-10-08",
      });
      await insertRoutine(physio.id, customerId, {
        ...base,
        name: "current",
        status: "active",
        startsOn: "2026-10-07",
        endsOn: "2026-10-07",
      });
      await insertPlan(physio.id, customerId, { name: "draft plan", status: "draft" });
      await insertPlan(physio.id, customerId, {
        name: "future plan",
        status: "active",
        startsOn: "2026-11-01",
      });
      const link = await customerLink(physio, customerId);
      const view = await viewOf(link.code);
      expect(view.routines.map((routine) => routine.name)).toEqual(["current"]);
      expect(view.plans).toEqual([]);
      expect(view.nextStart).toBeNull(); // something is active, so no empty state
    });

    it("reports the next start date when nothing is active today", async () => {
      const customerId = await insertCustomer(physio.id);
      const ex = await insertExercise(physio.id);
      await insertRoutine(physio.id, customerId, {
        name: "later",
        status: "active",
        startsOn: "2026-10-20",
        items: [{ exerciseId: ex }],
      });
      await insertPlan(physio.id, customerId, {
        name: "soon",
        status: "active",
        startsOn: "2026-10-12",
      });
      const link = await customerLink(physio, customerId);
      const view = await viewOf(link.code);
      expect(view).toMatchObject({ plans: [], routines: [], nextStart: "2026-10-12" });
    });

    it("never shows draft or archived routines inside a plan, nor another customer's routine", async () => {
      const customerId = await insertCustomer(physio.id);
      const otherCustomer = await insertCustomer(physio.id, { firstName: "Other" });
      const ex = await insertExercise(physio.id);
      const mine = await insertRoutine(physio.id, customerId, {
        name: "mine",
        status: "active",
        isStandalone: false,
        items: [{ exerciseId: ex }],
      });
      const archived = await insertRoutine(physio.id, customerId, {
        name: "archived",
        status: "archived",
        isStandalone: false,
        items: [{ exerciseId: ex }],
      });
      const draft = await insertRoutine(physio.id, customerId, {
        name: "draft",
        status: "draft",
        isStandalone: false,
        items: [{ exerciseId: ex }],
      });
      const foreign = await insertRoutine(physio.id, otherCustomer, {
        name: "foreign",
        status: "active",
        isStandalone: false,
        items: [{ exerciseId: ex }],
      });
      await insertPlan(physio.id, customerId, {
        name: "Week",
        status: "active",
        entries: [
          { weekday: WEDNESDAY, routineId: mine },
          { weekday: WEDNESDAY, routineId: archived },
          { weekday: WEDNESDAY, routineId: draft },
          { weekday: 5, routineId: draft },
          // Cannot happen through the app (addEntry checks), but the patient layer must not trust it.
          { weekday: WEDNESDAY, routineId: foreign },
        ],
      });
      const link = await customerLink(physio, customerId);
      const view = await viewOf(link.code);
      expect(view.plans[0]!.entries.map((entry) => entry.routine.name)).toEqual(["mine"]);
      // A day that only has a draft routine shows no dot in the strip.
      expect(view.weekdaysWithContent).toEqual([WEDNESDAY]);
    });

    it("a customer link never shows another customer's content (same physio)", async () => {
      const a = await insertCustomer(physio.id, { firstName: "A" });
      const b = await insertCustomer(physio.id, { firstName: "B" });
      const ex = await insertExercise(physio.id);
      await insertRoutine(physio.id, a, {
        name: "A routine",
        status: "active",
        items: [{ exerciseId: ex }],
      });
      await insertRoutine(physio.id, b, {
        name: "B routine",
        status: "active",
        items: [{ exerciseId: ex }],
      });
      await insertPlan(physio.id, b, { name: "B plan", status: "active" });
      const view = await viewOf((await customerLink(physio, a)).code);
      expect(view.routines.map((routine) => routine.name)).toEqual(["A routine"]);
      expect(view.plans).toEqual([]);
    });

    it("a routine link shows only that routine, a plan link only that plan", async () => {
      const customerId = await insertCustomer(physio.id);
      const ex = await insertExercise(physio.id);
      const one = await insertRoutine(physio.id, customerId, {
        name: "One",
        status: "active",
        items: [{ exerciseId: ex }],
      });
      await insertRoutine(physio.id, customerId, {
        name: "Two",
        status: "active",
        items: [{ exerciseId: ex }],
      });
      const inPlan = await insertRoutine(physio.id, customerId, {
        name: "In plan",
        status: "active",
        isStandalone: false,
        items: [{ exerciseId: ex }],
      });
      const plan = await insertPlan(physio.id, customerId, {
        name: "Plan A",
        status: "active",
        entries: [{ weekday: WEDNESDAY, routineId: inPlan }],
      });
      await insertPlan(physio.id, customerId, { name: "Plan B", status: "active" });

      const routineView = await viewOf(
        (await linkFor(physio, { target: "routine", routineId: one })).code,
      );
      expect(routineView.routines.map((routine) => routine.name)).toEqual(["One"]);
      expect(routineView.plans).toEqual([]);

      const planView = await viewOf(
        (await linkFor(physio, { target: "weekly_plan", weeklyPlanId: plan })).code,
      );
      expect(planView.plans.map((p) => p.name)).toEqual(["Plan A"]);
      expect(planView.routines).toEqual([]);

      // A routine that only lives inside a plan can still be shared on its own.
      const inPlanView = await viewOf(
        (await linkFor(physio, { target: "routine", routineId: inPlan })).code,
      );
      expect(inPlanView.routines.map((routine) => routine.name)).toEqual(["In plan"]);
    });

    it("a link of one physio never reaches another physio's data", async () => {
      const mine = await insertCustomer(physio.id);
      const theirs = await insertCustomer(other.id);
      const ex = await insertExercise(other.id);
      await insertRoutine(other.id, theirs, {
        name: "Theirs",
        status: "active",
        items: [{ exerciseId: ex }],
      });
      const view = await viewOf((await customerLink(physio, mine)).code);
      expect(view.routines).toEqual([]);
      // Even a hand-built link pointing a physio's customer id at someone else's customer finds nothing.
      const { shell, link } = await resolved((await customerLink(physio, mine)).code);
      const crafted = await getPatientView(shell, { ...link, customerId: theirs }, null, NOW);
      expect(crafted.routines).toEqual([]);
    });

    it("uses the physio's time zone for today", async () => {
      const zoned = await createTestPhysio({ onboarded: true });
      created.push(zoned);
      await db
        .update(physios)
        .set({ timezone: "Pacific/Auckland" })
        .where(eq(physios.id, zoned.id));
      const customerId = await insertCustomer(zoned.id);
      const link = await customerLink(zoned, customerId);
      // 07 Oct 22:00 UTC is already 08 Oct in Auckland (UTC+13).
      const result = await resolveLink(link.code, new Date("2026-10-07T22:00:00Z"));
      if (result.status !== "ok") throw new Error("expected ok");
      const view = await getPatientView(
        result.shell,
        result.link,
        null,
        new Date("2026-10-07T22:00:00Z"),
      );
      expect(view.today).toBe("2026-10-08");
      expect(view.todayWeekday).toBe(4);
    });
  });

  describe("touchLink", () => {
    it("counts the first open and then at most once per 30 minutes", async () => {
      const customerId = await insertCustomer(physio.id);
      const link = await customerLink(physio, customerId);
      const row = async () =>
        (await db.select().from(shareLinks).where(eq(shareLinks.id, link.id)))[0]!;

      const t0 = new Date("2026-10-07T10:00:00Z");
      expect(await touchLink(link.id, t0)).toBe(true);
      expect(await touchLink(link.id, new Date(t0.getTime() + 5 * 60_000))).toBe(false);
      expect(
        await touchLink(link.id, new Date(t0.getTime() + (TOUCH_INTERVAL_MINUTES - 1) * 60_000)),
      ).toBe(false);
      expect(await row()).toMatchObject({ openCount: 1, lastOpenedAt: t0 });

      const later = new Date(t0.getTime() + (TOUCH_INTERVAL_MINUTES + 1) * 60_000);
      expect(await touchLink(link.id, later)).toBe(true);
      expect(await row()).toMatchObject({ openCount: 2, lastOpenedAt: later });
    });

    it("counts only once when opened concurrently", async () => {
      const customerId = await insertCustomer(physio.id);
      const link = await customerLink(physio, customerId);
      const results = await Promise.all(Array.from({ length: 5 }, () => touchLink(link.id)));
      expect(results.filter(Boolean)).toHaveLength(1);
      const [row] = await db.select().from(shareLinks).where(eq(shareLinks.id, link.id));
      expect(row!.openCount).toBe(1);
    });
  });

  describe("getReachableRoutine", () => {
    const reach = async (code: string, routineId: string) => {
      const { shell, link } = await resolved(code);
      return getReachableRoutine(shell, link, routineId, NOW);
    };

    it("opens the customer's standalone routines and routines of their active plans", async () => {
      const customerId = await insertCustomer(physio.id);
      const ex = await insertExercise(physio.id, { name: "Squat", youtubeId: "dQw4w9WgXcQ" });
      const standalone = await insertRoutine(physio.id, customerId, {
        name: "Daily",
        status: "active",
        items: [{ exerciseId: ex, reps: 12, sets: 3 }],
      });
      const inPlan = await insertRoutine(physio.id, customerId, {
        name: "Gym",
        status: "active",
        isStandalone: false,
        items: [{ exerciseId: ex }],
      });
      await insertPlan(physio.id, customerId, {
        name: "Week",
        status: "active",
        entries: [{ weekday: 5, routineId: inPlan }],
      });
      const { code } = await customerLink(physio, customerId);

      const daily = await reach(code, standalone);
      expect(daily).toMatchObject({ id: standalone, name: "Daily" });
      expect(daily!.blocks).toHaveLength(1);
      // Any weekday of the plan: the patient may do Friday's routine on Wednesday.
      expect(await reach(code, inPlan)).toMatchObject({ id: inPlan, name: "Gym" });
    });

    it("returns null for anything the link cannot reach", async () => {
      const customerId = await insertCustomer(physio.id);
      const otherCustomer = await insertCustomer(physio.id, { firstName: "Other" });
      const theirs = await insertCustomer(other.id);
      const ex = await insertExercise(physio.id);
      const otherEx = await insertExercise(other.id);
      const base = { status: "active" as const, items: [{ exerciseId: ex }] };
      const draft = await insertRoutine(physio.id, customerId, { ...base, status: "draft" });
      const archived = await insertRoutine(physio.id, customerId, {
        ...base,
        status: "archived",
      });
      const ended = await insertRoutine(physio.id, customerId, { ...base, endsOn: "2026-10-06" });
      const unplanned = await insertRoutine(physio.id, customerId, {
        ...base,
        isStandalone: false,
      });
      const foreign = await insertRoutine(physio.id, otherCustomer, base);
      const foreignInPlan = await insertRoutine(physio.id, otherCustomer, {
        ...base,
        isStandalone: false,
      });
      const otherPhysio = await insertRoutine(other.id, theirs, {
        status: "active",
        items: [{ exerciseId: otherEx }],
      });
      const inDraftPlan = await insertRoutine(physio.id, customerId, {
        ...base,
        isStandalone: false,
      });
      await insertPlan(physio.id, customerId, {
        name: "Draft plan",
        status: "draft",
        entries: [{ weekday: 1, routineId: inDraftPlan }],
      });
      // Cannot happen through the app, but this layer must not trust it.
      await insertPlan(physio.id, customerId, {
        name: "Week",
        status: "active",
        entries: [
          { weekday: 1, routineId: foreignInPlan },
          { weekday: 2, routineId: draft },
        ],
      });
      const { code } = await customerLink(physio, customerId);

      for (const id of [
        draft,
        archived,
        ended,
        unplanned,
        foreign,
        foreignInPlan,
        otherPhysio,
        inDraftPlan,
        "00000000-0000-4000-8000-000000000000",
      ]) {
        expect(await reach(code, id), id).toBeNull();
      }
    });

    it("a routine link reaches only its routine, a plan link only that plan's routines", async () => {
      const customerId = await insertCustomer(physio.id);
      const ex = await insertExercise(physio.id);
      const one = await insertRoutine(physio.id, customerId, {
        name: "One",
        status: "active",
        items: [{ exerciseId: ex }],
      });
      const two = await insertRoutine(physio.id, customerId, {
        name: "Two",
        status: "active",
        items: [{ exerciseId: ex }],
      });
      const inPlanA = await insertRoutine(physio.id, customerId, {
        name: "In A",
        status: "active",
        isStandalone: false,
        items: [{ exerciseId: ex }],
      });
      const inPlanB = await insertRoutine(physio.id, customerId, {
        name: "In B",
        status: "active",
        isStandalone: false,
        items: [{ exerciseId: ex }],
      });
      const planA = await insertPlan(physio.id, customerId, {
        name: "A",
        status: "active",
        entries: [{ weekday: 1, routineId: inPlanA }],
      });
      await insertPlan(physio.id, customerId, {
        name: "B",
        status: "active",
        entries: [{ weekday: 1, routineId: inPlanB }],
      });

      const routineLink = (await linkFor(physio, { target: "routine", routineId: one })).code;
      expect(await reach(routineLink, one)).toMatchObject({ name: "One" });
      expect(await reach(routineLink, two)).toBeNull();
      expect(await reach(routineLink, inPlanA)).toBeNull();

      const planLink = (await linkFor(physio, { target: "weekly_plan", weeklyPlanId: planA })).code;
      expect(await reach(planLink, inPlanA)).toMatchObject({ name: "In A" });
      expect(await reach(planLink, inPlanB)).toBeNull();
      expect(await reach(planLink, one)).toBeNull();

      // A routine that only lives in a plan can be shared on its own and then opens.
      const inPlanLink = (await linkFor(physio, { target: "routine", routineId: inPlanB })).code;
      expect(await reach(inPlanLink, inPlanB)).toMatchObject({ name: "In B" });
    });
  });
});
