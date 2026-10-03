import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { runAsPhysio, type Tx } from "@/db/rls";
import {
  customers,
  exerciseCategories,
  exerciseMedia,
  exercises,
  routineItems,
  routines,
} from "@/db/schema";
import { DEFAULT_LIBRARY_FILTERS, type LibraryFilters } from "@/lib/library-params";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

import {
  createCategory,
  createExercise,
  deleteCategory,
  deleteExercise,
  renameCategory,
  reorderCategories,
  setExerciseArchived,
  updateExercise,
} from "./mutations";
import { getExercise, hasAnyExercises, listCategoryTree, listExercises, listTags } from "./queries";
import {
  createCategorySchema,
  exerciseSchema,
  type CreateCategoryInput,
  type ExerciseInput,
} from "./schemas";

const V1 = "dQw4w9WgXcQ";
const V2 = "aaaaaaaaaaa";
const V3 = "bbbbbbbbbbb";
const SHORT = `https://www.youtube.com/shorts/${V1}`;
const WATCH = (id: string) => `https://www.youtube.com/watch?v=${id}`;
const RANDOM_ID = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";

const exerciseInput = (overrides: Record<string, unknown> = {}): ExerciseInput =>
  exerciseSchema.parse({
    name: "Bridge",
    categoryId: null,
    instructions: null,
    bodyAreas: [],
    tags: [],
    media: [],
    ...overrides,
  });
const filters = (overrides: Partial<LibraryFilters> = {}): LibraryFilters => ({
  ...DEFAULT_LIBRARY_FILTERS,
  ...overrides,
});
const names = (rows: { name: string }[]) => rows.map((row) => row.name);

describe("library server layer", () => {
  let a: TestPhysio;
  let b: TestPhysio;

  const asA = <T>(fn: Parameters<typeof runAsPhysio<T>>[1]) => runAsPhysio(a.claims, fn);
  const asB = <T>(fn: Parameters<typeof runAsPhysio<T>>[1]) => runAsPhysio(b.claims, fn);
  const category = async (who: TestPhysio, input: CreateCategoryInput) => {
    const result = await runAsPhysio(who.claims, (tx, id) => createCategory(tx, id, input));
    if (!result.ok) throw new Error(result.error);
    return result.data.id;
  };
  const exercise = async (who: TestPhysio, input: ExerciseInput) => {
    const result = await runAsPhysio(who.claims, (tx, id) => createExercise(tx, id, input));
    if (!result.ok) throw new Error(result.error);
    return result.data.id;
  };

  beforeAll(async () => {
    [a, b] = await Promise.all([
      createTestPhysio({ onboarded: true }),
      createTestPhysio({ onboarded: true }),
    ]);
  });
  afterAll(() => deleteTestPhysios(a, b));

  describe("createCategory", () => {
    it("assigns sibling positions and nests sub-categories", async () => {
      const first = await category(a, { name: "Cat one", parentId: null });
      await category(a, { name: "Cat two", parentId: null });
      await category(a, { name: "Cat three", parentId: null });
      const sub = await category(a, { name: "Sub", parentId: first });
      const rows = await db
        .select()
        .from(exerciseCategories)
        .where(eq(exerciseCategories.physioId, a.id));
      const top = rows
        .filter((row) => row.parentId === null)
        .sort((x, y) => x.position - y.position);
      expect(top.map((row) => [row.name, row.position])).toEqual([
        ["Cat one", 0],
        ["Cat two", 1],
        ["Cat three", 2],
      ]);
      expect(rows.find((row) => row.id === sub)).toMatchObject({ parentId: first, position: 0 });
    });

    it("refuses duplicate names at the same level, ignoring case and spaces", async () => {
      await category(a, { name: "Lower limb", parentId: null });
      const input = createCategorySchema.parse({ name: "  lower LIMB", parentId: null });
      expect(await asA((tx, id) => createCategory(tx, id, input))).toEqual({
        ok: false,
        error: "nameTaken",
      });
      // the same name under a parent is a different level
      const parent = await category(a, { name: "Dup parent", parentId: null });
      expect(
        (await asA((tx, id) => createCategory(tx, id, { name: "Lower limb", parentId: parent })))
          .ok,
      ).toBe(true);
    });

    it("refuses a third level", async () => {
      const parent = await category(a, { name: "Depth parent", parentId: null });
      const sub = await category(a, { name: "Depth sub", parentId: parent });
      expect(
        await asA((tx, id) => createCategory(tx, id, { name: "Too deep", parentId: sub })),
      ).toEqual({
        ok: false,
        error: "tooDeep",
      });
    });

    it("reports parentNotFound for unknown and other physios' parents", async () => {
      const bCategory = await category(b, { name: "B only", parentId: null });
      for (const parentId of [RANDOM_ID, bCategory]) {
        expect(await asA((tx, id) => createCategory(tx, id, { name: "Orphan", parentId }))).toEqual(
          {
            ok: false,
            error: "parentNotFound",
          },
        );
      }
    });
  });

  describe("renameCategory", () => {
    it("renames, refuses a sibling's name and other physios' ids", async () => {
      const one = await category(a, { name: "Rename one", parentId: null });
      await category(a, { name: "Rename two", parentId: null });
      expect(await asA((tx, id) => renameCategory(tx, id, { id: one, name: "Renamed" }))).toEqual({
        ok: true,
        data: null,
      });
      const [row] = await db
        .select()
        .from(exerciseCategories)
        .where(eq(exerciseCategories.id, one));
      expect(row.name).toBe("Renamed");
      expect(
        await asA((tx, id) => renameCategory(tx, id, { id: one, name: "rename TWO" })),
      ).toEqual({
        ok: false,
        error: "nameTaken",
      });
      const bCategory = await category(b, { name: "B rename", parentId: null });
      expect(
        await asA((tx, id) => renameCategory(tx, id, { id: bCategory, name: "Hijack" })),
      ).toEqual({
        ok: false,
        error: "notFound",
      });
      const [bRow] = await db
        .select()
        .from(exerciseCategories)
        .where(eq(exerciseCategories.id, bCategory));
      expect(bRow.name).toBe("B rename");
    });
  });

  describe("reorderCategories", () => {
    it("rewrites positions and rejects mismatched id sets", async () => {
      const parent = await category(a, { name: "Reorder parent", parentId: null });
      const x = await category(a, { name: "X", parentId: parent });
      const y = await category(a, { name: "Y", parentId: parent });
      const z = await category(a, { name: "Z", parentId: parent });
      const other = await category(a, { name: "Reorder other", parentId: null });
      expect(
        await asA((tx, id) =>
          reorderCategories(tx, id, { parentId: parent, orderedIds: [z, x, y] }),
        ),
      ).toEqual({ ok: true, data: null });
      const tree = await asA((tx, id) => listCategoryTree(tx, id));
      expect(tree.find((node) => node.id === parent)?.children.map((child) => child.id)).toEqual([
        z,
        x,
        y,
      ]);

      const mismatched = [
        [z, x], // missing
        [z, x, y, other], // extra (another parent's)
        [z, x, RANDOM_ID], // unknown
      ];
      for (const orderedIds of mismatched) {
        expect(
          await asA((tx, id) => reorderCategories(tx, id, { parentId: parent, orderedIds })),
        ).toEqual({
          ok: false,
          error: "mismatch",
        });
      }
      // ids belonging to another parent (top level) under this parent
      expect(
        await asA((tx, id) => reorderCategories(tx, id, { parentId: null, orderedIds: [x, y, z] })),
      ).toEqual({ ok: false, error: "mismatch" });
    });
  });

  describe("deleteCategory", () => {
    it("is notFound for other physios' ids and leaves their row", async () => {
      const bCategory = await category(b, { name: "B delete", parentId: null });
      expect(await asA((tx, id) => deleteCategory(tx, id, bCategory))).toEqual({
        ok: false,
        error: "notFound",
      });
      expect(await asA((tx, id) => deleteCategory(tx, id, RANDOM_ID))).toEqual({
        ok: false,
        error: "notFound",
      });
      const rows = await db
        .select()
        .from(exerciseCategories)
        .where(eq(exerciseCategories.id, bCategory));
      expect(rows).toHaveLength(1);
    });

    it("cascades to sub-categories and uncategorises their exercises", async () => {
      const parent = await category(a, { name: "Del parent", parentId: null });
      const sub = await category(a, { name: "Del sub", parentId: parent });
      const inParent = await exercise(a, exerciseInput({ name: "In parent", categoryId: parent }));
      const inSub = await exercise(a, exerciseInput({ name: "In sub", categoryId: sub }));
      const archivedInSub = await exercise(
        a,
        exerciseInput({ name: "Archived in sub", categoryId: sub }),
      );
      await asA((tx, id) => setExerciseArchived(tx, id, archivedInSub, true));

      expect(await asA((tx, id) => deleteCategory(tx, id, parent))).toEqual({
        ok: true,
        data: null,
      });
      const cats = await db
        .select()
        .from(exerciseCategories)
        .where(eq(exerciseCategories.physioId, a.id));
      expect(cats.some((row) => row.id === parent || row.id === sub)).toBe(false);
      for (const id of [inParent, inSub, archivedInSub]) {
        const [row] = await db.select().from(exercises).where(eq(exercises.id, id));
        expect(row.categoryId).toBeNull();
      }
    });
  });

  describe("listCategoryTree", () => {
    it("nests, sorts and sums counts into parents", async () => {
      const c = await createTestPhysio({ onboarded: true });
      try {
        const asC = <T>(fn: Parameters<typeof runAsPhysio<T>>[1]) => runAsPhysio(c.claims, fn);
        const second = await category(c, { name: "Bravo", parentId: null });
        const first = await category(c, { name: "Alpha", parentId: null });
        const subB = await category(c, { name: "Sub B", parentId: first });
        const subA = await category(c, { name: "Sub A", parentId: first });
        await exercise(c, exerciseInput({ name: "e1", categoryId: first }));
        await exercise(c, exerciseInput({ name: "e2", categoryId: subA }));
        const archived = await exercise(c, exerciseInput({ name: "e3", categoryId: subA }));
        await asC((tx, id) => setExerciseArchived(tx, id, archived, true));
        await exercise(c, exerciseInput({ name: "e4" }));

        const tree = await asC((tx, id) => listCategoryTree(tx, id));
        expect(tree.map((node) => node.id)).toEqual([second, first]); // by position
        const alpha = tree[1];
        expect(alpha).toMatchObject({ activeCount: 2, totalCount: 3 });
        expect(alpha.children.map((child) => child.id)).toEqual([subB, subA]);
        expect(alpha.children[1]).toMatchObject({ activeCount: 1, totalCount: 2 });
        expect(alpha.children[0]).toMatchObject({ activeCount: 0, totalCount: 0 });
        expect(tree[0]).toMatchObject({ activeCount: 0, totalCount: 0 });
      } finally {
        await deleteTestPhysios(c);
      }
    });
  });

  describe("exercises", () => {
    it("round-trips every field with media in order", async () => {
      const cat = await category(a, { name: "RT cat", parentId: null });
      const id = await exercise(
        a,
        exerciseInput({
          name: "Round trip",
          categoryId: cat,
          instructions: "Do it slowly.",
          bodyAreas: ["knee", "glute"],
          tags: ["Band", "rubber"],
          media: [SHORT, WATCH(V2), WATCH(V3)],
        }),
      );
      const detail = await asA((tx, physioId) => getExercise(tx, physioId, id));
      expect(detail).toMatchObject({
        id,
        physioId: a.id,
        name: "Round trip",
        categoryId: cat,
        instructions: "Do it slowly.",
        bodyAreas: ["glute", "knee"],
        tags: ["band", "rubber"],
        archivedAt: null,
      });
      expect(detail?.media.map(({ url, videoId, isShort }) => ({ url, videoId, isShort }))).toEqual(
        [
          { url: SHORT, videoId: V1, isShort: true },
          { url: WATCH(V2), videoId: V2, isShort: false },
          { url: WATCH(V3), videoId: V3, isShort: false },
        ],
      );
      const stored = await db.select().from(exerciseMedia).where(eq(exerciseMedia.exerciseId, id));
      expect(stored.map((row) => row.position).sort()).toEqual([0, 1, 2]);
    });

    it("stores the exercise kind and defaults to strength", async () => {
      const run = await exercise(a, exerciseInput({ name: "Run", kind: "aerobic" }));
      const bridge = await exercise(a, exerciseInput({ name: "Bridge kind" }));
      expect((await asA((tx, id) => getExercise(tx, id, run)))?.kind).toBe("aerobic");
      expect((await asA((tx, id) => getExercise(tx, id, bridge)))?.kind).toBe("strength");
    });

    it("refuses other physios' categories and hides other physios' exercises", async () => {
      const bCategory = await category(b, { name: "B exercise cat", parentId: null });
      expect(
        await asA((tx, id) => createExercise(tx, id, exerciseInput({ categoryId: bCategory }))),
      ).toEqual({ ok: false, error: "categoryNotFound" });
      const bExercise = await exercise(b, exerciseInput({ name: "B secret" }));
      expect(await asA((tx, id) => getExercise(tx, id, bExercise))).toBeNull();
      expect(await asA((tx, id) => getExercise(tx, id, RANDOM_ID))).toBeNull();
    });

    it("updates fields and replaces media", async () => {
      const id = await exercise(
        a,
        exerciseInput({ name: "Before", media: [WATCH(V1), WATCH(V2)], tags: ["old"] }),
      );
      const cat = await category(a, { name: "Update cat", parentId: null });
      const result = await asA((tx, physioId) =>
        updateExercise(
          tx,
          physioId,
          id,
          exerciseInput({
            name: "After",
            categoryId: cat,
            media: [WATCH(V3), WATCH(V2)],
            tags: ["new"],
          }),
        ),
      );
      expect(result).toEqual({ ok: true, data: { id } });
      const detail = await asA((tx, physioId) => getExercise(tx, physioId, id));
      expect(detail).toMatchObject({ name: "After", categoryId: cat, tags: ["new"] });
      expect(detail?.media.map((media) => media.videoId)).toEqual([V3, V2]);
    });

    it("update is notFound / categoryNotFound across tenants and leaves B untouched", async () => {
      const bExercise = await exercise(
        b,
        exerciseInput({ name: "B untouched", media: [WATCH(V1)] }),
      );
      expect(
        await asA((tx, id) =>
          updateExercise(tx, id, bExercise, exerciseInput({ name: "Hijacked" })),
        ),
      ).toEqual({ ok: false, error: "notFound" });
      const bDetail = await asB((tx, id) => getExercise(tx, id, bExercise));
      expect(bDetail).toMatchObject({ name: "B untouched" });
      expect(bDetail?.media).toHaveLength(1);

      const own = await exercise(a, exerciseInput({ name: "Own" }));
      const bCategory = await category(b, { name: "B update cat", parentId: null });
      expect(
        await asA((tx, id) =>
          updateExercise(tx, id, own, exerciseInput({ name: "Own", categoryId: bCategory })),
        ),
      ).toEqual({ ok: false, error: "categoryNotFound" });
    });

    it("archives, restores and deletes (with media)", async () => {
      const id = await exercise(a, exerciseInput({ name: "Archivable zzz", media: [WATCH(V1)] }));
      const only = (name: string) => filters({ q: name });
      const active = () =>
        asA((tx, p) => listExercises(tx, p, only("archivable zzz")).then((r) => r.exercises));
      const archived = () =>
        asA((tx, p) =>
          listExercises(
            tx,
            p,
            filters({ q: "archivable zzz", category: { kind: "archived" } }),
          ).then((r) => r.exercises),
        );

      expect(names(await active())).toEqual(["Archivable zzz"]);
      expect(await asA((tx, p) => setExerciseArchived(tx, p, id, true))).toEqual({
        ok: true,
        data: null,
      });
      expect(await active()).toEqual([]);
      expect(names(await archived())).toEqual(["Archivable zzz"]);
      expect(await asA((tx, p) => setExerciseArchived(tx, p, id, false))).toEqual({
        ok: true,
        data: null,
      });
      expect(names(await active())).toEqual(["Archivable zzz"]);

      expect(await asA((tx, p) => deleteExercise(tx, p, id))).toEqual({ ok: true, data: null });
      expect(await asA((tx, p) => getExercise(tx, p, id))).toBeNull();
      expect(await db.select().from(exerciseMedia).where(eq(exerciseMedia.exerciseId, id))).toEqual(
        [],
      );
    });

    it("archive and delete are notFound for other physios' ids", async () => {
      const bExercise = await exercise(b, exerciseInput({ name: "B keep" }));
      expect(await asA((tx, p) => setExerciseArchived(tx, p, bExercise, true))).toEqual({
        ok: false,
        error: "notFound",
      });
      expect(await asA((tx, p) => deleteExercise(tx, p, bExercise))).toEqual({
        ok: false,
        error: "notFound",
      });
      const [row] = await db.select().from(exercises).where(eq(exercises.id, bExercise));
      expect(row.archivedAt).toBeNull();
    });
  });

  describe("deleteExercise with routines", () => {
    it("is inUse for an exercise a routine uses, and the transaction stays usable", async () => {
      const used = await exercise(a, exerciseInput({ name: "Used in routine" }));
      const [customer] = await db
        .insert(customers)
        .values({ physioId: a.id, firstName: "Ana", locale: "en" })
        .returning({ id: customers.id });
      const [routine] = await db
        .insert(routines)
        .values({ physioId: a.id, customerId: customer.id, name: "R" })
        .returning({ id: routines.id });
      await db
        .insert(routineItems)
        .values({ physioId: a.id, routineId: routine.id, exerciseId: used, position: 0 });

      const outcome = await asA(async (tx, p) => ({
        result: await deleteExercise(tx, p, used),
        after: await getExercise(tx, p, used),
      }));
      expect(outcome.result).toEqual({ ok: false, error: "inUse" });
      expect(outcome.after).toMatchObject({ id: used });
      expect(await asA((tx, p) => deleteExercise(tx, p, RANDOM_ID))).toEqual({
        ok: false,
        error: "notFound",
      });
    });
  });

  describe("listExercises", () => {
    let d: TestPhysio;
    let e: TestPhysio;
    let top: string;
    let sub: string;
    const list = (overrides: Partial<LibraryFilters> = {}) =>
      runAsPhysio(d.claims, (tx, id) =>
        listExercises(tx, id, filters(overrides)).then((r) => r.exercises),
      );

    beforeAll(async () => {
      [d, e] = await Promise.all([
        createTestPhysio({ onboarded: true }),
        createTestPhysio({ onboarded: true }),
      ]);
      top = await category(d, { name: "Top", parentId: null });
      sub = await category(d, { name: "Sub", parentId: top });
      await category(d, { name: "Other", parentId: null });
      await exercise(
        d,
        exerciseInput({
          name: "Single-leg Bridge",
          categoryId: top,
          bodyAreas: ["knee", "glute"],
          tags: ["band"],
          media: [WATCH(V2), WATCH(V1)],
        }),
      );
      await exercise(
        d,
        exerciseInput({
          name: "Elevación de talones",
          categoryId: sub,
          bodyAreas: ["ankle_foot"],
          media: [SHORT],
        }),
      );
      await exercise(d, exerciseInput({ name: "100% effort sprint", bodyAreas: ["thigh"] }));
      await exercise(d, exerciseInput({ name: "1000 m row" }));
      await exercise(d, exerciseInput({ name: "axb", tags: ["x"] }));
      await exercise(d, exerciseInput({ name: "O'Brien press" }));
      await exercise(d, exerciseInput({ name: "Wall slide", tags: ["band", "rubber"] }));
      await exercise(d, exerciseInput({ name: "aaa Lowercase first" }));
      const archived = await exercise(
        d,
        exerciseInput({ name: "Old drill", categoryId: sub, bodyAreas: ["knee"] }),
      );
      await runAsPhysio(d.claims, (tx, id) => setExerciseArchived(tx, id, archived, true));
      await exercise(
        e,
        exerciseInput({ name: "Single-leg Bridge", tags: ["band"], bodyAreas: ["knee"] }),
      );
    });
    afterAll(() => deleteTestPhysios(d, e));

    it("filters by category, including sub-categories, none and archived", async () => {
      expect(names(await list({ category: { kind: "category", id: top } }))).toEqual([
        "Elevación de talones",
        "Single-leg Bridge",
      ]);
      expect(names(await list({ category: { kind: "category", id: sub } }))).toEqual([
        "Elevación de talones",
      ]);
      const none = await list({ category: { kind: "none" } });
      expect(none.every((row) => row.categoryId === null && row.archivedAt === null)).toBe(true);
      expect(none).toHaveLength(6);
      expect(names(await list({ category: { kind: "archived" } }))).toEqual(["Old drill"]);
    });

    it("filters by area and tag", async () => {
      expect(names(await list({ area: "knee" }))).toEqual(["Single-leg Bridge"]);
      expect(names(await list({ tag: "band" }))).toEqual(["Single-leg Bridge", "Wall slide"]);
    });

    it("searches names, accent-insensitively", async () => {
      expect(names(await list({ q: "bridge" }))).toEqual(["Single-leg Bridge"]);
      expect(names(await list({ q: "elevacion" }))).toEqual(["Elevación de talones"]);
      expect(names(await list({ q: "Elevación" }))).toEqual(["Elevación de talones"]);
      expect(names(await list({ q: "ÉLÉV" }))).toEqual(["Elevación de talones"]);
      expect(names(await list({ q: "élévation" }))).toEqual([]);
    });

    it("searches tags by prefix", async () => {
      expect(names(await list({ q: "band" }))).toEqual(["Single-leg Bridge", "Wall slide"]);
    });

    it("treats LIKE wildcards and quotes literally", async () => {
      expect(names(await list({ q: "100%" }))).toEqual(["100% effort sprint"]);
      expect(names(await list({ q: "a_b" }))).toEqual([]);
      expect(names(await list({ q: "o'brien" }))).toEqual(["O'Brien press"]);
      expect(names(await list({ q: "50\\" }))).toEqual([]);
    });

    it("sorts by name case-insensitively and never leaks other physios' rows", async () => {
      const all = await list();
      const sorted = [...all].sort((x, y) => {
        const l = x.name.toLowerCase();
        const r = y.name.toLowerCase();
        return l < r ? -1 : l > r ? 1 : 0;
      });
      expect(names(all)).toEqual(names(sorted));
      expect(all).toHaveLength(8);
      expect(names(all).filter((name) => name === "Single-leg Bridge")).toHaveLength(1);
      // explicit physio filter holds even without RLS-relevant claims of the owner
      const asE = await runAsPhysio(e.claims, (tx, id) =>
        listExercises(tx, id, filters()).then((r) => r.exercises),
      );
      expect(asE).toHaveLength(1);
    });

    it("uses the position-0 video as the cover", async () => {
      const [bridge] = await list({ q: "bridge" });
      expect(bridge.cover).toEqual({ videoId: V2, isShort: false });
      const [elev] = await list({ q: "elevacion" });
      expect(elev.cover).toEqual({ videoId: V1, isShort: true });
      const [row] = await list({ q: "1000" });
      expect(row.cover).toBeNull();
    });
  });

  describe("listTags", () => {
    it("returns distinct sorted tags of the physio's own active exercises", async () => {
      const f = await createTestPhysio({ onboarded: true });
      const g = await createTestPhysio({ onboarded: true });
      try {
        await exercise(f, exerciseInput({ name: "t1", tags: ["zeta", "band"] }));
        await exercise(f, exerciseInput({ name: "t2", tags: ["band", "alpha"] }));
        await exercise(g, exerciseInput({ name: "t3", tags: ["secret"] }));
        const hidden = await exercise(f, exerciseInput({ name: "t4", tags: ["archived-only"] }));
        await runAsPhysio(f.claims, (tx, id) => setExerciseArchived(tx, id, hidden, true));
        expect(await runAsPhysio(f.claims, (tx, id) => listTags(tx, id))).toEqual([
          "alpha",
          "band",
          "zeta",
        ]);
      } finally {
        await deleteTestPhysios(f, g);
      }
    });
  });

  describe("hasAnyExercises and the result cap", () => {
    it("counts archived exercises and only the physio's own", async () => {
      const f = await createTestPhysio({ onboarded: true });
      const g = await createTestPhysio({ onboarded: true });
      try {
        const asF = <T>(fn: (tx: Tx, id: string) => Promise<T>) => runAsPhysio(f.claims, fn);
        expect(await asF((tx, id) => hasAnyExercises(tx, id))).toBe(false);
        await exercise(g, exerciseInput({ name: "other" }));
        expect(await asF((tx, id) => hasAnyExercises(tx, id))).toBe(false);
        const only = await exercise(f, exerciseInput({ name: "mine" }));
        await asF((tx, id) => setExerciseArchived(tx, id, only, true));
        expect(await asF((tx, id) => hasAnyExercises(tx, id))).toBe(true);
      } finally {
        await deleteTestPhysios(f, g);
      }
    });

    it("flags truncation when more rows match than the limit", async () => {
      const f = await createTestPhysio({ onboarded: true });
      try {
        for (const name of ["cap a", "cap b", "cap c"]) await exercise(f, exerciseInput({ name }));
        const run = (limit: number) =>
          runAsPhysio(f.claims, (tx, id) => listExercises(tx, id, filters(), limit));
        expect(await run(2)).toMatchObject({ truncated: true });
        expect((await run(2)).exercises).toHaveLength(2);
        expect(await run(3)).toMatchObject({ truncated: false });
      } finally {
        await deleteTestPhysios(f);
      }
    });
  });
});
