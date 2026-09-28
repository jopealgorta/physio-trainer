# Spec 03 · Exercise library: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** A private, per-physio exercise library: two-level categories, exercises with
instructions, body areas, tags, default prescription and YouTube videos, browsable with search
and filters reflected in the URL.

**Architecture:** Pure helpers in `src/lib` (YouTube parser, tag normaliser, prescription zod
schema, library URL params, category tree builder) are shared by server and client. Three
RLS-protected tables in `src/db/schema/library.ts` use composite `(physio_id, …)` foreign keys so
rows can never reference another physio's rows. `src/server/library/` follows the
`schemas → queries/mutations → actions` layering of `src/server/physios/`. UI lives in
`src/components/library/` (plus reusable `src/components/prescription/` and
`src/components/sortable/`), rendered by three routes under `src/app/(app)/library/`.

**Tech Stack:** Next.js 16 (App Router, Server Actions, typed routes), React 19, TypeScript,
Tailwind v4, shadcn/ui (Radix), next-intl 4, Drizzle ORM 0.45, Postgres 17 (Supabase, `pg_trgm`,
`unaccent`), zod v4, `@dnd-kit/*`, Vitest + Testing Library, Playwright.

**Spec:** [`docs/specs/03-exercise-library.md`](../specs/03-exercise-library.md). Read it,
[`docs/architecture.md`](../architecture.md) and [`CLAUDE.md`](../../CLAUDE.md) first.

## Global Constraints

- Node 24. Bash shells may not load nvm: prefix commands with
  `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH" &&`.
- Branch `feat/03-exercise-library` (exists). Commit after every task; messages in Conventional
  Commits style, ending with the `Co-Authored-By` line the session gives you.
- **Local Supabase is isolated for this worktree** (another worktree shares the default stack):
  the config lives in `$SB=/private/tmp/claude-501/-Users-josealgorta-personal-workspace-physio-trainer--claude-worktrees-spec-03-be6b2e/584a9875-5114-4321-87f4-2ab3ad39d29d/scratchpad/sb`
  (its `supabase/migrations` is a symlink to this repo's). `.env.local` already points at it
  (ports 553xx). **Never** run `pnpm db:start`, `pnpm db:reset` or `supabase stop` without
  `--workdir`. Reset with: `pnpm exec supabase db reset --workdir $SB`.
- E2E: run with `PORT=3103 pnpm test:e2e` (port 3100 may be another worktree's server, which
  Playwright would silently reuse).
- Media is **YouTube only** (`youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`, also
  `www.`/`m.` hosts). No uploads, no storage bucket, no Vimeo. Embeds use
  `https://www.youtube-nocookie.com/embed/{id}`; thumbnails `https://i.ytimg.com/vi/{id}/hqdefault.jpg`.
  Shorts (a `/shorts/` URL) render 9:16, everything else 16:9. At most **10** videos per exercise.
- Limits: category name 1–60 chars; exercise name 1–120; instructions ≤ 5 000; ≤ 20 tags,
  each ≤ 30 chars, lowercase, trimmed. Prescription: sets 1–99, reps 1–999, reps_max 1–999 and
  `> reps`, duration_seconds 1–7200, hold_seconds 1–3600, rest_seconds 1–3600, load ≤ 40 chars,
  notes ≤ 500 chars, side ∈ `left | right | both | alternating`. All prescription fields
  nullable.
- Categories are at most two levels deep. Deleting a category deletes its sub-categories; their
  exercises (archived ones too) become uncategorised.
- Tenancy: every table has `physio_id` + RLS policy `physio_id = auth.uid()`; queries/mutations
  take `(tx, physioId, …)` and **also** filter by `physio_id`. Actions: validate with zod →
  `withPhysio(mutation)` → `revalidatePath("/library", "layout")`. Server action arguments are
  untrusted: parse every one (ids with `z.uuid()`).
- Every user-visible string goes in **both** `messages/en.json` and `messages/es.json` in the
  same task (same keys, same ICU arguments; `src/i18n/messages.test.ts` enforces it). Spanish is
  Rioplatense voseo. No hard-coded copy (aria-labels included). Numbers via ICU (`{max, number}`).
- Colours only via tokens; accent is `primary`. Never pass functions (icons) from Server to
  Client Components.
- Next.js 16: `params`/`searchParams` are Promises; use the global `PageProps<"/route">` type.
  Check `node_modules/next/dist/docs/` before using any other Next API.
- shadcn primitives go in `src/components/ui` via `pnpm dlx shadcn@latest add <name>`.
- Run `pnpm check` before every commit; also `pnpm test:int` for tasks touching the DB.

## Review Focus

1. **Real-world YouTube URLs** (`?si=…` share params, `&t=30s`, `m.youtube.com`, upper-case
   host, trailing slash, no scheme) must be accepted and canonicalised; lookalikes
   (`youtube.com.evil.test`, `javascript:`, 10/12-char ids) rejected. Pinned in Task 1.
2. **Search text with LIKE wildcards, accents and quotes** (`100%`, `a_b`, `Élévation`,
   `o'brien`) must match literally and accent-insensitively without SQL errors. Pinned in
   Task 4 (`listExercises` search tests).
3. **Forged or stale ids** (`/library/abc`, `?category=nope`, another physio's uuid in a URL or
   action argument) must give 404 / be ignored / return `notFound`, never a 500 or a leak.
   Pinned in Tasks 2, 3, 4, 5 and 7.
4. **Tag variants** (`Band`, `band`, `#band`, `band, rubber`) collapse to one normalised tag;
   the 21st tag is refused. Pinned in Tasks 1 and 6.
5. **Saving the form keeps what the physio typed**: React resets forms after an action; values
   must survive (profile-form pattern: dispatch from `onSubmit`). Pinned in Task 7 (component
   test) and Task 10 (e2e reload check).

---

### Task 1: YouTube URL parser and tag normaliser

**Files:**

- Create: `src/lib/youtube.ts`, `src/lib/youtube.test.ts`
- Create: `src/lib/tags.ts`, `src/lib/tags.test.ts`

**Interfaces:**

- Produces:
  - `YOUTUBE_ID_PATTERN: RegExp`
  - `type YouTubeVideo = { videoId: string; isShort: boolean; url: string }`
  - `parseYouTubeUrl(input: string): YouTubeVideo | null` (`url` is canonical:
    `https://www.youtube.com/shorts/{id}` or `https://www.youtube.com/watch?v={id}`)
  - `youtubeThumbnailUrl(videoId: string): string`
  - `youtubeEmbedUrl(videoId: string): string`
  - `MAX_TAGS = 20`, `MAX_TAG_LENGTH = 30`
  - `normalizeTag(raw: string): string`, `normalizeTags(values: readonly string[]): string[]`,
    `splitTagInput(text: string): string[]`

- [ ] **Step 1: Write the failing tests**

`src/lib/youtube.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { parseYouTubeUrl, youtubeEmbedUrl, youtubeThumbnailUrl } from "./youtube";

const ID = "dQw4w9WgXcQ";

describe("parseYouTubeUrl", () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}&t=30s`,
    `http://www.youtube.com/watch?feature=share&v=${ID}`,
    `HTTPS://WWW.YOUTUBE.COM/watch?v=${ID}`,
    `www.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=AbCdEf123`,
    `youtu.be/${ID}/`,
    `  https://youtu.be/${ID}  `,
  ])("accepts the video URL %s", (input) => {
    expect(parseYouTubeUrl(input)).toEqual({
      videoId: ID,
      isShort: false,
      url: `https://www.youtube.com/watch?v=${ID}`,
    });
  });

  it.each([
    `https://www.youtube.com/shorts/${ID}`,
    `https://youtube.com/shorts/${ID}?si=xyz`,
    `https://m.youtube.com/shorts/${ID}/`,
    `youtube.com/shorts/${ID}`,
  ])("accepts the Short %s", (input) => {
    expect(parseYouTubeUrl(input)).toEqual({
      videoId: ID,
      isShort: true,
      url: `https://www.youtube.com/shorts/${ID}`,
    });
  });

  it.each([
    "",
    "   ",
    "not a url",
    `https://www.youtube.com/watch?v=${ID.slice(0, 10)}`,
    `https://www.youtube.com/watch?v=${ID}x`,
    `https://www.youtube.com/watch?v=dQw4w9WgXc!`,
    "https://www.youtube.com/watch",
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/shorts/${ID}/extra`,
    `https://youtu.be/${ID}/extra`,
    `https://youtube.com.evil.test/watch?v=${ID}`,
    `https://evil.test/youtu.be/${ID}`,
    `https://vimeo.com/123456`,
    `javascript:alert(1)//youtu.be/${ID}`,
    `ftp://youtu.be/${ID}`,
    `https://user:pass@youtu.be/${ID}`,
    `https://youtu.be:8443/${ID}`,
  ])("rejects %j", (input) => {
    expect(parseYouTubeUrl(input)).toBeNull();
  });
});

describe("YouTube URLs", () => {
  it("builds a thumbnail URL", () => {
    expect(youtubeThumbnailUrl(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  });

  it("builds a privacy-enhanced, muted, looping embed URL", () => {
    const url = new URL(youtubeEmbedUrl(ID));
    expect(url.origin).toBe("https://www.youtube-nocookie.com");
    expect(url.pathname).toBe(`/embed/${ID}`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      autoplay: "1",
      mute: "1",
      loop: "1",
      playlist: ID,
      playsinline: "1",
      rel: "0",
    });
  });
});
```

`src/lib/tags.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { normalizeTag, normalizeTags, splitTagInput } from "./tags";

describe("normalizeTag", () => {
  it.each([
    ["Band", "band"],
    ["  band  ", "band"],
    ["#Band", "band"],
    ["resistance   BAND", "resistance band"],
    ["Élévation", "élévation"],
    ["a,b", "a b"],
    ["   ", ""],
  ])("normalises %j to %j", (raw, expected) => {
    expect(normalizeTag(raw)).toBe(expected);
  });
});

describe("normalizeTags", () => {
  it("normalises, drops empties and de-duplicates keeping first-seen order", () => {
    expect(normalizeTags(["Band", " beginner", "band", "", "#BAND", "Beginner "])).toEqual([
      "band",
      "beginner",
    ]);
  });
});

describe("splitTagInput", () => {
  it("splits pasted text on commas and normalises each part", () => {
    expect(splitTagInput("Band, rubber ,, #Home")).toEqual(["band", "rubber", "home"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/youtube.test.ts src/lib/tags.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/lib/youtube.ts`:

```ts
/** YouTube links (spec 03): the only kind of exercise media in v1. */
export const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export type YouTubeVideo = {
  videoId: string;
  /** A /shorts/ URL: rendered portrait (9:16). */
  isShort: boolean;
  /** Canonical URL, stored in exercise_media.external_url. */
  url: string;
};

const WATCH_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const SHORT_LINK_HOSTS = new Set(["youtu.be", "www.youtu.be"]);
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Parses a pasted YouTube video or Shorts URL; null for anything else. */
export function parseYouTubeUrl(input: string): YouTubeVideo | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.port) return null;

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);
  let videoId: string | null = null;
  let isShort = false;

  if (SHORT_LINK_HOSTS.has(host)) {
    if (segments.length === 1) videoId = segments[0];
  } else if (WATCH_HOSTS.has(host)) {
    if (segments.length === 1 && segments[0] === "watch") {
      videoId = url.searchParams.get("v");
    } else if (segments.length === 2 && segments[0] === "shorts") {
      videoId = segments[1];
      isShort = true;
    }
  }

  if (!videoId || !YOUTUBE_ID_PATTERN.test(videoId)) return null;
  return {
    videoId,
    isShort,
    url: isShort
      ? `https://www.youtube.com/shorts/${videoId}`
      : `https://www.youtube.com/watch?v=${videoId}`,
  };
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/** Privacy-enhanced embed that plays inline, muted and looping (`loop` needs `playlist`). */
export function youtubeEmbedUrl(videoId: string): string {
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    loop: "1",
    playlist: videoId,
    playsinline: "1",
    rel: "0",
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params}`;
}
```

`src/lib/tags.ts`:

```ts
/** Free-form exercise tags (spec 03): lowercase, trimmed, single-spaced. */
export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 30;

export function normalizeTag(raw: string): string {
  return raw.normalize("NFC").replace(/[,#]/g, " ").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Normalised, non-empty, unique tags in first-seen order. Length limits are the schema's job. */
export function normalizeTags(values: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const tag = normalizeTag(value);
    if (tag) seen.add(tag);
  }
  return [...seen];
}

/** Text typed or pasted into the tag input: "Band, rubber" → ["band", "rubber"]. */
export function splitTagInput(text: string): string[] {
  return normalizeTags(text.split(","));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/lib/youtube.test.ts src/lib/tags.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm check
git add src/lib/youtube.ts src/lib/youtube.test.ts src/lib/tags.ts src/lib/tags.test.ts
git commit -m "feat(library): YouTube URL parser and tag normaliser"
```

---

### Task 2: Prescription schema, library URL params and category tree helpers

**Files:**

- Create: `src/lib/prescription.ts`, `src/lib/prescription.test.ts`
- Create: `src/lib/library-params.ts`, `src/lib/library-params.test.ts`
- Create: `src/lib/category-tree.ts`, `src/lib/category-tree.test.ts`
- Create: `src/lib/sql-like.ts`, `src/lib/sql-like.test.ts`

**Interfaces:**

- Consumes: `normalizeTag`, `MAX_TAG_LENGTH` (Task 1); `BODY_AREAS`, `bodyAreaSchema`,
  `type BodyArea` from `@/lib/body-areas`.
- Produces:
  - `PRESCRIPTION_SIDES = ["left","right","both","alternating"] as const`, `type PrescriptionSide`
  - `PRESCRIPTION_LIMITS` (`{ sets, reps, repsMax, durationSeconds, holdSeconds, restSeconds }`
    each `{ min, max }`), `LOAD_MAX_LENGTH = 40`, `PRESCRIPTION_NOTES_MAX_LENGTH = 500`
  - `prescriptionShape` (zod shape), `refinePrescription(value, ctx)`, `prescriptionSchema`,
    `type Prescription`, `PRESCRIPTION_FIELDS: (keyof Prescription)[]`, `EMPTY_PRESCRIPTION`
  - `type PrescriptionErrorCode = "notAWholeNumber" | "outOfRange" | "tooLong" | "invalidSide" | "repsMaxWithoutReps" | "repsMaxNotAboveReps"`
  - `type LibraryCategoryFilter = { kind: "all" } | { kind: "none" } | { kind: "archived" } | { kind: "category"; id: string }`
  - `type LibraryView = "grid" | "list"`
  - `type LibraryFilters = { q: string; area: BodyArea | null; tag: string | null; category: LibraryCategoryFilter; view: LibraryView }`
  - `DEFAULT_LIBRARY_FILTERS`, `SEARCH_MAX_LENGTH = 100`
  - `parseLibraryParams(params: Record<string, string | string[] | undefined>): LibraryFilters`
  - `libraryHref(filters: LibraryFilters, changes?: Partial<LibraryFilters>): Route`
  - `hasActiveFilters(filters: LibraryFilters): boolean` (q, area, tag or a non-"all" category)
  - `type CategoryRow = { id: string; parentId: string | null; name: string; position: number; activeCount: number; totalCount: number }`
  - `type CategoryLeaf = { id: string; name: string; position: number; activeCount: number; totalCount: number }`
  - `type CategoryNode = CategoryLeaf & { children: CategoryLeaf[] }` (a node's counts include its children's)
  - `buildCategoryTree(rows: CategoryRow[]): CategoryNode[]`
  - `escapeLike(value: string): string`

- [ ] **Step 1: Write the failing tests**

`src/lib/prescription.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { EMPTY_PRESCRIPTION, PRESCRIPTION_FIELDS, prescriptionSchema } from "./prescription";

const issues = (input: Record<string, unknown>) => {
  const result = prescriptionSchema.safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path[0], issue.message]));
};

describe("prescriptionSchema", () => {
  it("turns blank form values into nulls", () => {
    const blank = Object.fromEntries(PRESCRIPTION_FIELDS.map((field) => [field, ""]));
    expect(prescriptionSchema.parse(blank)).toEqual(EMPTY_PRESCRIPTION);
    expect(prescriptionSchema.parse({})).toEqual(EMPTY_PRESCRIPTION);
  });

  it("coerces numbers and trims text", () => {
    expect(
      prescriptionSchema.parse({
        sets: "3",
        reps: " 8 ",
        repsMax: "12",
        durationSeconds: "45",
        holdSeconds: "5",
        restSeconds: "60",
        load: "  red band ",
        side: "alternating",
        notes: " slow ",
      }),
    ).toEqual({
      sets: 3,
      reps: 8,
      repsMax: 12,
      durationSeconds: 45,
      holdSeconds: 5,
      restSeconds: 60,
      load: "red band",
      side: "alternating",
      notes: "slow",
    });
  });

  it.each([
    [{ sets: "abc" }, { sets: "notAWholeNumber" }],
    [{ sets: "2.5" }, { sets: "notAWholeNumber" }],
    [{ sets: "0" }, { sets: "outOfRange" }],
    [{ sets: "100" }, { sets: "outOfRange" }],
    [{ reps: "1000" }, { reps: "outOfRange" }],
    [{ durationSeconds: "7201" }, { durationSeconds: "outOfRange" }],
    [{ holdSeconds: "-1" }, { holdSeconds: "outOfRange" }],
    [{ restSeconds: "3601" }, { restSeconds: "outOfRange" }],
    [{ load: "x".repeat(41) }, { load: "tooLong" }],
    [{ notes: "x".repeat(501) }, { notes: "tooLong" }],
    [{ side: "up" }, { side: "invalidSide" }],
    [{ repsMax: "12" }, { repsMax: "repsMaxWithoutReps" }],
    [{ reps: "12", repsMax: "12" }, { repsMax: "repsMaxNotAboveReps" }],
    [{ reps: "12", repsMax: "8" }, { repsMax: "repsMaxNotAboveReps" }],
  ])("rejects %j", (input, expected) => {
    expect(issues(input)).toEqual(expected);
  });
});
```

`src/lib/library-params.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  DEFAULT_LIBRARY_FILTERS,
  hasActiveFilters,
  libraryHref,
  parseLibraryParams,
} from "./library-params";

const UUID = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";

describe("parseLibraryParams", () => {
  it("defaults everything", () => {
    expect(parseLibraryParams({})).toEqual(DEFAULT_LIBRARY_FILTERS);
  });

  it("reads every filter", () => {
    expect(
      parseLibraryParams({
        q: "  bridge ",
        area: "knee",
        tag: "Band",
        category: UUID,
        view: "list",
      }),
    ).toEqual({
      q: "bridge",
      area: "knee",
      tag: "band",
      category: { kind: "category", id: UUID },
      view: "list",
    });
  });

  it("takes the first of repeated values", () => {
    expect(parseLibraryParams({ area: ["knee", "neck"] }).area).toBe("knee");
  });

  it.each([
    [{ area: "elbowz" }, "area", null],
    [{ tag: "   " }, "tag", null],
    [{ tag: "x".repeat(31) }, "tag", null],
    [{ category: "not-a-uuid" }, "category", { kind: "all" }],
    [{ category: "none" }, "category", { kind: "none" }],
    [{ category: "archived" }, "category", { kind: "archived" }],
    [{ view: "table" }, "view", "grid"],
  ] as const)("sanitises %j", (params, key, expected) => {
    expect(parseLibraryParams(params)[key]).toEqual(expected);
  });

  it("caps the search length", () => {
    expect(parseLibraryParams({ q: "a".repeat(500) }).q).toHaveLength(100);
  });
});

describe("libraryHref", () => {
  it("omits defaults", () => {
    expect(libraryHref(DEFAULT_LIBRARY_FILTERS)).toBe("/library");
  });

  it("serialises filters in a stable order and applies changes", () => {
    const filters = parseLibraryParams({ q: "bridge", tag: "band", view: "list" });
    expect(libraryHref(filters, { category: { kind: "category", id: UUID }, area: "knee" })).toBe(
      `/library?q=bridge&category=${UUID}&area=knee&tag=band&view=list`,
    );
    expect(libraryHref(filters, { category: { kind: "archived" } })).toBe(
      "/library?q=bridge&category=archived&tag=band&view=list",
    );
  });

  it("round-trips through parseLibraryParams", () => {
    const filters = parseLibraryParams({ q: "élévation & co", category: "none", area: "neck" });
    const href = libraryHref(filters);
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseLibraryParams(params)).toEqual(filters);
  });
});

describe("hasActiveFilters", () => {
  it("ignores the view", () => {
    expect(hasActiveFilters({ ...DEFAULT_LIBRARY_FILTERS, view: "list" })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_LIBRARY_FILTERS, tag: "band" })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_LIBRARY_FILTERS, category: { kind: "none" } })).toBe(true);
  });
});
```

`src/lib/category-tree.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildCategoryTree, type CategoryRow } from "./category-tree";

const row = (overrides: Partial<CategoryRow> & Pick<CategoryRow, "id">): CategoryRow => ({
  parentId: null,
  name: overrides.id,
  position: 0,
  activeCount: 0,
  totalCount: 0,
  ...overrides,
});

describe("buildCategoryTree", () => {
  it("nests children, sorts by position then name, and sums counts into parents", () => {
    const tree = buildCategoryTree([
      row({ id: "upper", position: 1, activeCount: 1, totalCount: 1 }),
      row({ id: "lower", position: 0, activeCount: 2, totalCount: 3 }),
      row({ id: "knee", parentId: "lower", position: 1, activeCount: 4, totalCount: 4 }),
      row({ id: "glutes", parentId: "lower", position: 0, activeCount: 1, totalCount: 2 }),
      row({ id: "ankle", parentId: "lower", position: 0, name: "Ankle" }),
    ]);
    expect(tree.map((node) => node.id)).toEqual(["lower", "upper"]);
    expect(tree[0].children.map((child) => child.id)).toEqual(["ankle", "glutes", "knee"]);
    expect(tree[0]).toMatchObject({ activeCount: 7, totalCount: 9 });
    expect(tree[0].children[2]).toEqual({
      id: "knee",
      name: "knee",
      position: 1,
      activeCount: 4,
      totalCount: 4,
    });
  });

  it("drops orphans whose parent is missing", () => {
    expect(buildCategoryTree([row({ id: "child", parentId: "gone" })])).toEqual([]);
  });
});
```

`src/lib/sql-like.test.ts`:

```ts
import { expect, it } from "vitest";

import { escapeLike } from "./sql-like";

it("escapes LIKE wildcards and the escape character", () => {
  expect(escapeLike(String.raw`100%_a\b`)).toBe(String.raw`100\%\_a\\b`);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/prescription.test.ts src/lib/library-params.test.ts src/lib/category-tree.test.ts src/lib/sql-like.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/lib/prescription.ts`:

```ts
import { z } from "zod";

/**
 * Prescription fields shared by exercise defaults (spec 03) and routine items (spec 05).
 * All optional; the UI shows only what is set. Error messages are i18n keys (Prescription.errors.*).
 */
export const PRESCRIPTION_SIDES = ["left", "right", "both", "alternating"] as const;
export type PrescriptionSide = (typeof PRESCRIPTION_SIDES)[number];

export const PRESCRIPTION_LIMITS = {
  sets: { min: 1, max: 99 },
  reps: { min: 1, max: 999 },
  repsMax: { min: 1, max: 999 },
  durationSeconds: { min: 1, max: 7200 },
  holdSeconds: { min: 1, max: 3600 },
  restSeconds: { min: 1, max: 3600 },
} as const;
export const LOAD_MAX_LENGTH = 40;
export const PRESCRIPTION_NOTES_MAX_LENGTH = 500;

export type PrescriptionErrorCode =
  | "notAWholeNumber"
  | "outOfRange"
  | "tooLong"
  | "invalidSide"
  | "repsMaxWithoutReps"
  | "repsMaxNotAboveReps";

const blankToUndefined = (value: unknown) =>
  value === null || (typeof value === "string" && value.trim() === "") ? undefined : value;

function optionalInt({ min, max }: { min: number; max: number }) {
  return z
    .preprocess(
      blankToUndefined,
      z.coerce
        .number({ error: "notAWholeNumber" })
        .int("notAWholeNumber")
        .min(min, "outOfRange")
        .max(max, "outOfRange")
        .optional(),
    )
    .transform((value) => value ?? null);
}

function optionalText(max: number) {
  return z
    .preprocess(
      (value) => (typeof value === "string" ? value.trim() : value),
      z.string().max(max, "tooLong").optional().nullable(),
    )
    .transform((value) => value || null);
}

export const prescriptionShape = {
  sets: optionalInt(PRESCRIPTION_LIMITS.sets),
  reps: optionalInt(PRESCRIPTION_LIMITS.reps),
  repsMax: optionalInt(PRESCRIPTION_LIMITS.repsMax),
  durationSeconds: optionalInt(PRESCRIPTION_LIMITS.durationSeconds),
  holdSeconds: optionalInt(PRESCRIPTION_LIMITS.holdSeconds),
  restSeconds: optionalInt(PRESCRIPTION_LIMITS.restSeconds),
  load: optionalText(LOAD_MAX_LENGTH),
  side: z
    .preprocess(blankToUndefined, z.enum(PRESCRIPTION_SIDES, { error: "invalidSide" }).optional())
    .transform((value) => value ?? null),
  notes: optionalText(PRESCRIPTION_NOTES_MAX_LENGTH),
};

/** A rep range needs a lower bound below its upper bound ("8–12"). */
export function refinePrescription(
  value: { reps: number | null; repsMax: number | null },
  ctx: z.RefinementCtx,
) {
  if (value.repsMax === null) return;
  if (value.reps === null) {
    ctx.addIssue({ code: "custom", path: ["repsMax"], message: "repsMaxWithoutReps" });
  } else if (value.repsMax <= value.reps) {
    ctx.addIssue({ code: "custom", path: ["repsMax"], message: "repsMaxNotAboveReps" });
  }
}

export const prescriptionSchema = z.object(prescriptionShape).superRefine(refinePrescription);
export type Prescription = z.output<typeof prescriptionSchema>;

export const PRESCRIPTION_FIELDS = Object.keys(prescriptionShape) as (keyof Prescription)[];

export const EMPTY_PRESCRIPTION: Prescription = {
  sets: null,
  reps: null,
  repsMax: null,
  durationSeconds: null,
  holdSeconds: null,
  restSeconds: null,
  load: null,
  side: null,
  notes: null,
};
```

If `z.coerce.number({ error })` does not produce `notAWholeNumber` for `"abc"` in zod v4, adjust
until the test passes (the error for a NaN coercion is an `invalid_type` issue).

`src/lib/library-params.ts`:

```ts
import type { Route } from "next";
import { z } from "zod";

import { bodyAreaSchema, type BodyArea } from "./body-areas";
import { firstParam } from "./search-params";
import { MAX_TAG_LENGTH, normalizeTag } from "./tags";

/** /library filters, all reflected in the URL (`?q=&category=&area=&tag=&view=`). */
export type LibraryCategoryFilter =
  { kind: "all" } | { kind: "none" } | { kind: "archived" } | { kind: "category"; id: string };
export type LibraryView = "grid" | "list";
export type LibraryFilters = {
  q: string;
  area: BodyArea | null;
  tag: string | null;
  category: LibraryCategoryFilter;
  view: LibraryView;
};

export const SEARCH_MAX_LENGTH = 100;
export const DEFAULT_LIBRARY_FILTERS: LibraryFilters = {
  q: "",
  area: null,
  tag: null,
  category: { kind: "all" },
  view: "grid",
};

type Params = Record<string, string | string[] | undefined>;

export function parseLibraryParams(params: Params): LibraryFilters {
  const q = (firstParam(params.q) ?? "").trim().slice(0, SEARCH_MAX_LENGTH);
  const area = bodyAreaSchema.safeParse(firstParam(params.area));
  const tag = normalizeTag(firstParam(params.tag) ?? "");
  return {
    q,
    area: area.success ? area.data : null,
    tag: tag && tag.length <= MAX_TAG_LENGTH ? tag : null,
    category: parseCategory(firstParam(params.category)),
    view: firstParam(params.view) === "list" ? "list" : "grid",
  };
}

function parseCategory(value: string | undefined): LibraryCategoryFilter {
  if (value === "none" || value === "archived") return { kind: value };
  return z.uuid().safeParse(value).success ? { kind: "category", id: value! } : { kind: "all" };
}

export function libraryHref(filters: LibraryFilters, changes: Partial<LibraryFilters> = {}): Route {
  const next = { ...filters, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.category.kind === "category") params.set("category", next.category.id);
  else if (next.category.kind !== "all") params.set("category", next.category.kind);
  if (next.area) params.set("area", next.area);
  if (next.tag) params.set("tag", next.tag);
  if (next.view !== "grid") params.set("view", next.view);
  const query = params.toString();
  return (query ? `/library?${query}` : "/library") as Route;
}

export function hasActiveFilters(filters: LibraryFilters): boolean {
  return Boolean(filters.q || filters.area || filters.tag || filters.category.kind !== "all");
}
```

`src/lib/category-tree.ts`:

```ts
/** Two-level exercise category tree (spec 03), built from flat rows with direct counts. */
export type CategoryRow = {
  id: string;
  parentId: string | null;
  name: string;
  position: number;
  /** Non-archived exercises filed directly under this category. */
  activeCount: number;
  /** All exercises (archived too) filed directly under this category. */
  totalCount: number;
};
export type CategoryLeaf = Omit<CategoryRow, "parentId">;
/** A top-level category; its counts include its sub-categories'. */
export type CategoryNode = CategoryLeaf & { children: CategoryLeaf[] };

const byPositionThenName = (a: CategoryLeaf, b: CategoryLeaf) =>
  a.position - b.position || a.name.localeCompare(b.name);

export function buildCategoryTree(rows: CategoryRow[]): CategoryNode[] {
  const leaf = ({ parentId: _parentId, ...rest }: CategoryRow): CategoryLeaf => rest;
  const nodes = new Map<string, CategoryNode>(
    rows
      .filter((row) => row.parentId === null)
      .map((row) => [row.id, { ...leaf(row), children: [] }]),
  );
  for (const row of rows) {
    const parent = row.parentId === null ? undefined : nodes.get(row.parentId);
    if (!parent) continue;
    parent.children.push(leaf(row));
    parent.activeCount += row.activeCount;
    parent.totalCount += row.totalCount;
  }
  const tree = [...nodes.values()].sort(byPositionThenName);
  for (const node of tree) node.children.sort(byPositionThenName);
  return tree;
}
```

`src/lib/sql-like.ts`:

```ts
/** Escapes %, _ and \ so user text matches literally inside a LIKE pattern. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/lib/prescription.test.ts src/lib/library-params.test.ts src/lib/category-tree.test.ts src/lib/sql-like.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm check
git add src/lib/prescription* src/lib/library-params* src/lib/category-tree* src/lib/sql-like*
git commit -m "feat(library): prescription schema, library URL params and category tree"
```

---

### Task 3: Database schema, migrations, RLS and cross-tenant guards

**Files:**

- Modify: `src/db/schema/enums.ts` (add `prescriptionSideEnum`, `exerciseMediaKindEnum`)
- Create: `src/db/schema/_prescription.ts`, `src/db/schema/_prescription.test.ts`
- Create: `src/db/schema/library.ts`
- Modify: `src/db/schema/index.ts` (export `./library`)
- Modify: `src/db/errors.ts` (add `isForeignKeyViolation`, `isCheckViolation`), create
  `src/db/errors.test.ts`
- Generated: `supabase/migrations/<ts>_exercise-library.sql` (+ `meta/`)
- Create (custom): `supabase/migrations/<ts>_exercise-library-extras.sql`
- Modify: `src/db/enums.int.test.ts`
- Create: `src/db/library.int.test.ts`

**Interfaces:**

- Consumes: `PRESCRIPTION_SIDES`, `PRESCRIPTION_LIMITS`, `LOAD_MAX_LENGTH`,
  `PRESCRIPTION_NOTES_MAX_LENGTH`, `PRESCRIPTION_FIELDS` (Task 2); `bodyAreaEnum`, `physios`,
  `timestamps`.
- Produces:
  - `prescriptionSideEnum`, `EXERCISE_MEDIA_KINDS = ["youtube"] as const`, `exerciseMediaKindEnum`
  - `prescriptionColumns()`, `prescriptionChecks(table: string, columns)`
  - Tables `exerciseCategories`, `exercises`, `exerciseMedia`; types `ExerciseCategory`,
    `Exercise`, `ExerciseMedia`
  - Constraint names used by mutations: `exercise_categories_name_unique`,
    `exercise_categories_parent_fk`, `exercise_categories_max_depth`, `exercises_category_fk`,
    `exercise_media_exercise_fk`
  - SQL function `public.f_unaccent(text)` and index `exercises_name_search_idx` on
    `public.f_unaccent(lower(name))`
  - `isForeignKeyViolation(error, constraint?)`, `isCheckViolation(error, constraint?)`

- [ ] **Step 1: Failing unit tests for the helpers**

`src/db/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { isCheckViolation, isForeignKeyViolation, isUniqueViolation } from "./errors";

const wrapped = (code: string, constraint_name?: string) => ({
  message: "Failed query",
  cause: { code, constraint_name },
});

describe("postgres error helpers", () => {
  it("recognises wrapped errors by code and constraint", () => {
    expect(isForeignKeyViolation(wrapped("23503", "exercises_category_fk"))).toBe(true);
    expect(isForeignKeyViolation(wrapped("23503", "other"), "exercises_category_fk")).toBe(false);
    expect(
      isCheckViolation(
        wrapped("23514", "exercise_categories_max_depth"),
        "exercise_categories_max_depth",
      ),
    ).toBe(true);
    expect(isUniqueViolation(wrapped("23503"))).toBe(false);
    expect(isForeignKeyViolation(new Error("boom"))).toBe(false);
  });
});
```

`src/db/schema/_prescription.test.ts`:

```ts
import { expect, it } from "vitest";

import { PRESCRIPTION_FIELDS } from "@/lib/prescription";

import { prescriptionColumns } from "./_prescription";

it("has one column per prescription field (spec 05 reuses both)", () => {
  expect(Object.keys(prescriptionColumns()).sort()).toEqual([...PRESCRIPTION_FIELDS].sort());
});
```

Run: `pnpm vitest run src/db/errors.test.ts src/db/schema/_prescription.test.ts` → FAIL.

- [ ] **Step 2: Implement the helpers and schema**

`src/db/errors.ts`: generalise the existing helper and add two siblings (keep
`isUniqueViolation` behaviour identical):

```ts
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  return hasPgCode(error, "23505", constraint);
}

export function isForeignKeyViolation(error: unknown, constraint?: string): boolean {
  return hasPgCode(error, "23503", constraint);
}

export function isCheckViolation(error: unknown, constraint?: string): boolean {
  return hasPgCode(error, "23514", constraint);
}

function hasPgCode(error: unknown, code: string, constraint?: string): boolean {
  const pgError = findPgError(error);
  return (
    pgError?.code === code && (constraint === undefined || pgError.constraint_name === constraint)
  );
}
```

`src/db/schema/enums.ts` (append):

```ts
import { PRESCRIPTION_SIDES } from "../../lib/prescription";

/** Prescription side (spec 03, shared with routine items in spec 05). */
export const prescriptionSideEnum = pgEnum("prescription_side", PRESCRIPTION_SIDES);

/** Exercise media kinds. Append-only: uploads/Vimeo add values in a later spec. */
export const EXERCISE_MEDIA_KINDS = ["youtube"] as const;
export const exerciseMediaKindEnum = pgEnum("exercise_media_kind", EXERCISE_MEDIA_KINDS);
```

(Keep imports at the top of the file, relative paths: drizzle-kit loads the schema without the
`@/` alias.)

`src/db/schema/_prescription.ts`:

```ts
import { sql } from "drizzle-orm";
import { check, integer, smallint, text, type AnyPgColumn } from "drizzle-orm/pg-core";

// Relative imports: drizzle-kit loads the schema without the "@/" alias.
import {
  LOAD_MAX_LENGTH,
  PRESCRIPTION_LIMITS,
  PRESCRIPTION_NOTES_MAX_LENGTH,
} from "../../lib/prescription";
import { prescriptionSideEnum } from "./enums";

/** Prescription columns (architecture "Prescription fields"): exercise defaults and routine items. */
export function prescriptionColumns() {
  return {
    sets: smallint(),
    reps: smallint(),
    repsMax: smallint(),
    durationSeconds: integer(),
    holdSeconds: smallint(),
    restSeconds: smallint(),
    load: text(),
    side: prescriptionSideEnum(),
    notes: text(),
  };
}

type PrescriptionColumns = Record<keyof ReturnType<typeof prescriptionColumns>, AnyPgColumn>;

/** Database backstops for the zod limits in src/lib/prescription.ts. NULL passes every check. */
export function prescriptionChecks(table: string, c: PrescriptionColumns) {
  const range = (name: string, column: AnyPgColumn, { min, max }: { min: number; max: number }) =>
    check(
      `${table}_${name}_range`,
      sql`${column} between ${sql.raw(String(min))} and ${sql.raw(String(max))}`,
    );
  return [
    range("sets", c.sets, PRESCRIPTION_LIMITS.sets),
    range("reps", c.reps, PRESCRIPTION_LIMITS.reps),
    range("reps_max", c.repsMax, PRESCRIPTION_LIMITS.repsMax),
    range("duration_seconds", c.durationSeconds, PRESCRIPTION_LIMITS.durationSeconds),
    range("hold_seconds", c.holdSeconds, PRESCRIPTION_LIMITS.holdSeconds),
    range("rest_seconds", c.restSeconds, PRESCRIPTION_LIMITS.restSeconds),
    check(
      `${table}_reps_range_order`,
      sql`${c.repsMax} is null or (${c.reps} is not null and ${c.repsMax} > ${c.reps})`,
    ),
    check(
      `${table}_load_length`,
      sql`char_length(${c.load}) <= ${sql.raw(String(LOAD_MAX_LENGTH))}`,
    ),
    check(
      `${table}_notes_length`,
      sql`char_length(${c.notes}) <= ${sql.raw(String(PRESCRIPTION_NOTES_MAX_LENGTH))}`,
    ),
  ];
}
```

`src/db/schema/library.ts`:

```ts
import { sql, type SQL } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { authenticatedRole, authUid } from "drizzle-orm/supabase";

import { timestamps } from "./_columns";
import { prescriptionChecks, prescriptionColumns } from "./_prescription";
import { bodyAreaEnum, exerciseMediaKindEnum } from "./enums";
import { physios } from "./physios";

/** Tenancy rule 1: a physio reads and writes only their own rows. */
const ownRows = (name: string, physioId: AnyPgColumn) =>
  pgPolicy(name, {
    for: "all",
    to: authenticatedRole,
    using: sql`${physioId} = ${authUid}`,
    withCheck: sql`${physioId} = ${authUid}`,
  });

const physioId = () =>
  uuid()
    .notNull()
    .references(() => physios.id, { onDelete: "cascade" });

const NO_PARENT: SQL = sql`'00000000-0000-0000-0000-000000000000'::uuid`;

/**
 * Two-level category tree (spec 03). References are composite (physio_id, …) so a row can
 * never point at another physio's row (FK checks bypass RLS). Depth ≤ 2 is enforced by the
 * exercise_categories_max_depth trigger (custom migration).
 */
export const exerciseCategories = pgTable(
  "exercise_categories",
  {
    id: uuid().primaryKey().defaultRandom(),
    physioId: physioId(),
    parentId: uuid(),
    name: text().notNull(),
    position: integer().notNull(),
    ...timestamps,
  },
  (t) => [
    unique("exercise_categories_physio_id_id_unique").on(t.physioId, t.id),
    foreignKey({
      name: "exercise_categories_parent_fk",
      columns: [t.physioId, t.parentId],
      foreignColumns: [t.physioId, t.id],
    }).onDelete("cascade"),
    uniqueIndex("exercise_categories_name_unique").on(
      t.physioId,
      sql`coalesce(${t.parentId}, ${NO_PARENT})`,
      sql`lower(${t.name})`,
    ),
    index("exercise_categories_parent_id_idx").on(t.physioId, t.parentId),
    check("exercise_categories_name_length", sql`char_length(${t.name}) between 1 and 60`),
    check("exercise_categories_not_own_parent", sql`${t.parentId} <> ${t.id}`),
    check("exercise_categories_position", sql`${t.position} >= 0`),
    ownRows("exercise_categories_own", t.physioId),
  ],
);

/**
 * Library exercises with default prescription. category_id's FK
 * (physio_id, category_id) → exercise_categories ON DELETE SET NULL (category_id) lives in the
 * custom migration: Drizzle can't express the column list.
 */
export const exercises = pgTable(
  "exercises",
  {
    id: uuid().primaryKey().defaultRandom(),
    physioId: physioId(),
    categoryId: uuid(),
    name: text().notNull(),
    instructions: text(),
    bodyAreas: bodyAreaEnum()
      .array()
      .notNull()
      .default(sql`'{}'`),
    tags: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    ...prescriptionColumns(),
    archivedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("exercises_physio_id_id_unique").on(t.physioId, t.id),
    index("exercises_physio_id_archived_at_idx").on(t.physioId, t.archivedAt),
    index("exercises_category_id_idx").on(t.physioId, t.categoryId),
    index("exercises_body_areas_idx").using("gin", t.bodyAreas),
    index("exercises_tags_idx").using("gin", t.tags),
    check("exercises_name_length", sql`char_length(${t.name}) between 1 and 120`),
    check("exercises_instructions_length", sql`char_length(${t.instructions}) <= 5000`),
    check("exercises_tags_count", sql`cardinality(${t.tags}) <= 20`),
    ...prescriptionChecks("exercises", t),
    ownRows("exercises_own", t.physioId),
  ],
);

/** Ordered exercise media; position 0 is the cover. YouTube only in v1. */
export const exerciseMedia = pgTable(
  "exercise_media",
  {
    id: uuid().primaryKey().defaultRandom(),
    physioId: physioId(),
    exerciseId: uuid().notNull(),
    kind: exerciseMediaKindEnum().notNull(),
    externalUrl: text().notNull(),
    externalId: text().notNull(),
    position: integer().notNull(),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: "exercise_media_exercise_fk",
      columns: [t.physioId, t.exerciseId],
      foreignColumns: [exercises.physioId, exercises.id],
    }).onDelete("cascade"),
    unique("exercise_media_position_unique").on(t.exerciseId, t.position),
    index("exercise_media_physio_exercise_idx").on(t.physioId, t.exerciseId),
    check("exercise_media_position", sql`${t.position} between 0 and 9`),
    check(
      "exercise_media_youtube_id",
      sql`${t.kind} <> 'youtube' or ${t.externalId} ~ '^[A-Za-z0-9_-]{11}$'`,
    ),
    ownRows("exercise_media_own", t.physioId),
  ],
);

export type ExerciseCategory = typeof exerciseCategories.$inferSelect;
export type Exercise = typeof exercises.$inferSelect;
export type ExerciseMedia = typeof exerciseMedia.$inferSelect;
```

Add `export * from "./library";` to `src/db/schema/index.ts`.

Run: `pnpm vitest run src/db/errors.test.ts src/db/schema/_prescription.test.ts` → PASS. Run
`pnpm typecheck`; fix any Drizzle typing issue (e.g. if `prescriptionChecks(…, t)` rejects the
table columns type, widen `PrescriptionColumns`).

- [ ] **Step 3: Generate the migrations**

```bash
pnpm db:generate --name=exercise-library
pnpm exec drizzle-kit generate --custom --name=exercise-library-extras
```

Inspect the generated SQL: three tables, both enums, composite FKs, the expression unique
index, GIN indexes, checks, `enable row level security` and the three policies. Then fill the
custom migration:

```sql
-- Exercise library extras (spec 03): things Drizzle can't express.

-- Accent-insensitive trigram search on exercise names.
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- unaccent() is only STABLE; an IMMUTABLE wrapper with a fixed dictionary can back an index.
create or replace function public.f_unaccent(value text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, value)
$$;

create index exercises_name_search_idx on public.exercises
  using gin (public.f_unaccent(lower(name)) extensions.gin_trgm_ops);

-- Category references stay within one physio. Deleting a category clears only category_id: a
-- plain composite SET NULL would also null physio_id.
alter table public.exercises
  add constraint exercises_category_fk
  foreign key (physio_id, category_id)
  references public.exercise_categories (physio_id, id)
  on delete set null (category_id);

-- Depth ≤ 2: a parent must be top level, and a category with children can't get a parent.
create or replace function public.check_exercise_category_depth()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is null then
    return new;
  end if;
  if exists (
    select 1 from public.exercise_categories
    where id = new.parent_id and parent_id is not null
  ) or exists (
    select 1 from public.exercise_categories where parent_id = new.id
  ) then
    raise exception 'exercise categories are at most two levels deep'
      using errcode = 'check_violation', constraint = 'exercise_categories_max_depth';
  end if;
  return new;
end;
$$;

create trigger exercise_categories_max_depth
  before insert or update of parent_id on public.exercise_categories
  for each row execute function public.check_exercise_category_depth();

create trigger exercise_categories_set_updated_at
  before update on public.exercise_categories
  for each row execute function public.set_updated_at();

create trigger exercises_set_updated_at
  before update on public.exercises
  for each row execute function public.set_updated_at();

create trigger exercise_media_set_updated_at
  before update on public.exercise_media
  for each row execute function public.set_updated_at();
```

Apply: `pnpm exec supabase db reset --workdir $SB`. Expected: all migrations apply, no errors.

- [ ] **Step 4: Write the integration tests**

Extend `src/db/enums.int.test.ts` with a second `it` asserting
`enum_range(null::prescription_side)::text[]` equals `[...PRESCRIPTION_SIDES]` and
`enum_range(null::exercise_media_kind)::text[]` equals `[...EXERCISE_MEDIA_KINDS]`.

`src/db/library.int.test.ts` (use `runAsPhysio`, `createTestPhysio`, `deleteTestPhysios`; the
rejected-query assertion pattern from `src/db/rls.int.test.ts`,
`rejects.toMatchObject({ cause: expect.objectContaining({ code, constraint_name }) })`).
Cover:

```ts
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { exerciseCategories, exerciseMedia, exercises } from "@/db/schema";
import { runAsPhysio } from "@/db/rls";
import { createTestPhysio, deleteTestPhysios, type TestPhysio } from "@/test/int/physios";

const VIDEO = "dQw4w9WgXcQ";
const rejectsWith = (code: string, constraint_name?: string) => ({
  cause: expect.objectContaining(constraint_name ? { code, constraint_name } : { code }),
});

describe("exercise library tables", () => {
  let a: TestPhysio;
  let b: TestPhysio;
  let aCategory: string;
  let aExercise: string;

  beforeAll(async () => {
    [a, b] = await Promise.all([
      createTestPhysio({ onboarded: true }),
      createTestPhysio({ onboarded: true }),
    ]);
    await runAsPhysio(a.claims, async (tx, physioId) => {
      [{ id: aCategory }] = await tx
        .insert(exerciseCategories)
        .values({ physioId, name: "Lower limb", position: 0 })
        .returning({ id: exerciseCategories.id });
      [{ id: aExercise }] = await tx
        .insert(exercises)
        .values({
          physioId,
          name: "Bridge",
          categoryId: aCategory,
          bodyAreas: ["glute"],
          tags: ["band"],
        })
        .returning({ id: exercises.id });
      await tx.insert(exerciseMedia).values({
        physioId,
        exerciseId: aExercise,
        kind: "youtube",
        position: 0,
        externalId: VIDEO,
        externalUrl: `https://www.youtube.com/watch?v=${VIDEO}`,
      });
    });
  });

  afterAll(() => deleteTestPhysios(a, b));

  it.each([
    ["exercise_categories", exerciseCategories],
    ["exercises", exercises],
    ["exercise_media", exerciseMedia],
  ] as const)("RLS hides %s rows from other physios", async (_name, table) => {
    expect(await runAsPhysio(b.claims, (tx) => tx.select().from(table))).toEqual([]);
    expect((await runAsPhysio(a.claims, (tx) => tx.select().from(table))).length).toBe(1);
  });

  it("RLS blocks updates and deletes of another physio's rows", async () => {
    const updated = await runAsPhysio(b.claims, (tx) =>
      tx.update(exercises).set({ name: "Hijacked" }).where(eq(exercises.id, aExercise)).returning(),
    );
    const deleted = await runAsPhysio(b.claims, (tx) =>
      tx.delete(exerciseCategories).where(eq(exerciseCategories.id, aCategory)).returning(),
    );
    expect(updated).toEqual([]);
    expect(deleted).toEqual([]);
  });

  it("RLS blocks inserting rows owned by someone else", async () => {
    await expect(
      runAsPhysio(b.claims, (tx) =>
        tx.insert(exercises).values({ physioId: a.id, name: "Intruder" }),
      ),
    ).rejects.toMatchObject(rejectsWith("42501"));
  });

  it("rejects references to another physio's category or exercise", async () => {
    await expect(
      runAsPhysio(b.claims, (tx, physioId) =>
        tx.insert(exercises).values({ physioId, name: "Sneaky", categoryId: aCategory }),
      ),
    ).rejects.toMatchObject(rejectsWith("23503", "exercises_category_fk"));
    await expect(
      runAsPhysio(b.claims, (tx, physioId) =>
        tx
          .insert(exerciseCategories)
          .values({ physioId, name: "Sneaky", parentId: aCategory, position: 0 }),
      ),
    ).rejects.toMatchObject(rejectsWith("23503", "exercise_categories_parent_fk"));
    await expect(
      runAsPhysio(b.claims, (tx, physioId) =>
        tx.insert(exerciseMedia).values({
          physioId,
          exerciseId: aExercise,
          kind: "youtube",
          position: 0,
          externalId: VIDEO,
          externalUrl: "https://www.youtube.com/watch?v=" + VIDEO,
        }),
      ),
    ).rejects.toMatchObject(rejectsWith("23503", "exercise_media_exercise_fk"));
  });

  it("limits categories to two levels", async () => {
    await expect(
      runAsPhysio(a.claims, async (tx, physioId) => {
        const [child] = await tx
          .insert(exerciseCategories)
          .values({ physioId, name: "Glutes", parentId: aCategory, position: 0 })
          .returning();
        await tx
          .insert(exerciseCategories)
          .values({ physioId, name: "Too deep", parentId: child.id, position: 0 });
      }),
    ).rejects.toMatchObject(rejectsWith("23514", "exercise_categories_max_depth"));
  });

  it("keeps sibling names unique regardless of case, per parent", async () => {
    await expect(
      runAsPhysio(a.claims, (tx, physioId) =>
        tx.insert(exerciseCategories).values({ physioId, name: "LOWER LIMB", position: 1 }),
      ),
    ).rejects.toMatchObject(rejectsWith("23505", "exercise_categories_name_unique"));
    // The same name is fine under a different parent (and for another physio).
    await runAsPhysio(b.claims, (tx, physioId) =>
      tx.insert(exerciseCategories).values({ physioId, name: "Lower limb", position: 0 }),
    );
  });

  it("deleting a category cascades to sub-categories and uncategorises their exercises", async () => {
    const { parent, sub, inSub } = await runAsPhysio(a.claims, async (tx, physioId) => {
      const [parent] = await tx
        .insert(exerciseCategories)
        .values({ physioId, name: "Upper limb", position: 1 })
        .returning();
      const [sub] = await tx
        .insert(exerciseCategories)
        .values({ physioId, name: "Shoulder", parentId: parent.id, position: 0 })
        .returning();
      const [inSub] = await tx
        .insert(exercises)
        .values({ physioId, name: "Pendulum", categoryId: sub.id, archivedAt: new Date() })
        .returning();
      await tx.delete(exerciseCategories).where(eq(exerciseCategories.id, parent.id));
      return { parent, sub, inSub };
    });
    const remaining = await db
      .select()
      .from(exerciseCategories)
      .where(sql`${exerciseCategories.id} in (${parent.id}, ${sub.id})`);
    const [moved] = await db.select().from(exercises).where(eq(exercises.id, inSub.id));
    expect(remaining).toEqual([]);
    expect(moved).toMatchObject({ categoryId: null, physioId: a.id });
  });

  it("enforces prescription and media checks", async () => {
    await expect(
      runAsPhysio(a.claims, (tx, physioId) =>
        tx.insert(exercises).values({ physioId, name: "Bad range", reps: 12, repsMax: 8 }),
      ),
    ).rejects.toMatchObject(rejectsWith("23514", "exercises_reps_range_order"));
    await expect(
      runAsPhysio(a.claims, (tx, physioId) =>
        tx.insert(exerciseMedia).values({
          physioId,
          exerciseId: aExercise,
          kind: "youtube",
          position: 1,
          externalId: "bad",
          externalUrl: "https://youtu.be/bad",
        }),
      ),
    ).rejects.toMatchObject(rejectsWith("23514", "exercise_media_youtube_id"));
  });

  it("has an accent-insensitive search function", async () => {
    const [row] = await db.execute<{ value: string }>(
      sql`select public.f_unaccent(lower('Élévation Ñandú')) as value`,
    );
    expect(row.value).toBe("elevation nandu");
  });
});
```

(Format with Prettier; the snippet is compressed for the plan.)

- [ ] **Step 5: Run and commit**

Run: `pnpm test:int` → all pass (including `schema-conventions`: RLS on and `set_updated_at`
attached for the new tables). `pnpm check` → pass.

```bash
git add src/db supabase/migrations
git commit -m "feat(library): exercise library tables, RLS and cross-tenant foreign keys"
```

---

### Task 4: Library server layer: schemas, queries and mutations

**Files:**

- Create: `src/server/library/schemas.ts`, `src/server/library/schemas.test.ts`
- Create: `src/server/library/queries.ts`
- Create: `src/server/library/mutations.ts`
- Create: `src/server/library/library.int.test.ts`

**Interfaces:**

- Consumes: Tasks 1–3 (`parseYouTubeUrl`, `normalizeTags`, `MAX_TAGS`, `MAX_TAG_LENGTH`,
  `prescriptionShape`, `refinePrescription`, `LibraryFilters`, `buildCategoryTree`,
  `escapeLike`, tables, error helpers); `bodyAreaSchema`, `BODY_AREAS`.
- Produces (`schemas.ts`, importable from client components: no `server-only`):
  - `type Result<T, E extends string> = { ok: true; data: T } | { ok: false; error: E }`
  - Constants `EXERCISE_NAME_MAX_LENGTH = 120`, `INSTRUCTIONS_MAX_LENGTH = 5000`,
    `CATEGORY_NAME_MAX_LENGTH = 60`, `MAX_MEDIA = 10`
  - `idSchema`, `createCategorySchema` (`{ name, parentId: uuid | null }`),
    `renameCategorySchema` (`{ id, name }`), `reorderCategoriesSchema`
    (`{ parentId: uuid | null, orderedIds: uuid[] }`), and their `z.output` types
    `CreateCategoryInput`, `RenameCategoryInput`, `ReorderCategoriesInput`
  - `type CategoryError = "nameRequired" | "nameTooLong" | "nameTaken" | "notFound" | "parentNotFound" | "tooDeep" | "mismatch" | "invalid"`
  - `categoryInputError(error: z.ZodError): CategoryError`
  - `exerciseSchema`, `type ExerciseInput = z.output<typeof exerciseSchema>` (`media` is
    `YouTubeVideo[]`), `exerciseFormValues(formData: FormData): Record<string, unknown>`
  - `type ExerciseField = "name" | "categoryId" | "instructions" | "bodyAreas" | "tags" | "media" | keyof Prescription`
  - `type ExerciseFieldErrors = Partial<Record<ExerciseField, string>>` and
    `exerciseFieldErrors(error: z.ZodError): ExerciseFieldErrors`
  - `type ExerciseFormState = { status: "idle" } | { status: "saved" } | { status: "error"; fieldErrors: ExerciseFieldErrors; formError?: "notFound" | "unknown" }`
- Produces (`queries.ts`, `server-only`):
  - `listCategoryTree(tx, physioId): Promise<CategoryNode[]>`
  - `type ExerciseSummary = { id: string; name: string; categoryId: string | null; bodyAreas: BodyArea[]; tags: string[]; archivedAt: Date | null; cover: { videoId: string; isShort: boolean } | null }`
  - `LIST_LIMIT = 500`, `listExercises(tx, physioId, filters: LibraryFilters): Promise<ExerciseSummary[]>`
  - `listTags(tx, physioId): Promise<string[]>`
  - `type ExerciseDetail = Exercise & { media: { id: string; url: string; videoId: string; isShort: boolean }[] }`
  - `getExercise(tx, physioId, id: string): Promise<ExerciseDetail | null>`
- Produces (`mutations.ts`, `server-only`):
  - `createCategory(tx, physioId, input: CreateCategoryInput): Promise<Result<{ id: string }, "nameTaken" | "parentNotFound" | "tooDeep">>`
  - `renameCategory(tx, physioId, input: RenameCategoryInput): Promise<Result<null, "nameTaken" | "notFound">>`
  - `reorderCategories(tx, physioId, input: ReorderCategoriesInput): Promise<Result<null, "mismatch">>`
  - `deleteCategory(tx, physioId, id: string): Promise<Result<null, "notFound">>`
  - `createExercise(tx, physioId, input: ExerciseInput): Promise<Result<{ id: string }, "categoryNotFound">>`
  - `updateExercise(tx, physioId, id: string, input: ExerciseInput): Promise<Result<{ id: string }, "categoryNotFound" | "notFound">>`
  - `setExerciseArchived(tx, physioId, id: string, archived: boolean): Promise<Result<null, "notFound">>`
  - `deleteExercise(tx, physioId, id: string): Promise<Result<null, "notFound">>`

- [ ] **Step 1: Failing unit tests for `schemas.ts`**

`src/server/library/schemas.test.ts` must cover:

```ts
import { describe, expect, it } from "vitest";

import {
  categoryInputError,
  createCategorySchema,
  exerciseFieldErrors,
  exerciseFormValues,
  exerciseSchema,
} from "./schemas";

const SHORT = "https://youtube.com/shorts/dQw4w9WgXcQ?si=x";
const UUID = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";

function form(entries: [string, string][]) {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("exerciseSchema", () => {
  it("parses a full form submission", () => {
    const values = exerciseFormValues(
      form([
        ["name", "  Single-leg bridge "],
        ["categoryId", UUID],
        ["instructions", "Push through the heel.\nHold."],
        ["bodyAreas", "knee"],
        ["bodyAreas", "glute"],
        ["bodyAreas", "glute"],
        ["tags", "Bodyweight"],
        ["tags", "beginner"],
        ["media", SHORT],
        ["sets", "3"],
        ["reps", "12"],
        ["side", ""],
      ]),
    );
    expect(exerciseSchema.parse(values)).toMatchObject({
      name: "Single-leg bridge",
      categoryId: UUID,
      instructions: "Push through the heel.\nHold.",
      bodyAreas: ["glute", "knee"], // canonical BODY_AREAS order, de-duplicated
      tags: ["bodyweight", "beginner"],
      media: [
        {
          videoId: "dQw4w9WgXcQ",
          isShort: true,
          url: "https://www.youtube.com/shorts/dQw4w9WgXcQ",
        },
      ],
      sets: 3,
      reps: 12,
      side: null,
    });
  });

  it("treats blank optional fields as empty", () => {
    expect(
      exerciseSchema.parse(
        exerciseFormValues(
          form([
            ["name", "Plank"],
            ["categoryId", ""],
            ["instructions", "  "],
          ]),
        ),
      ),
    ).toMatchObject({
      categoryId: null,
      instructions: null,
      bodyAreas: [],
      tags: [],
      media: [],
    });
  });

  it.each([
    [[["name", " "]], { name: "nameRequired" }],
    [[["name", "x".repeat(121)]], { name: "nameTooLong" }],
    [
      [
        ["name", "a"],
        ["categoryId", "nope"],
      ],
      { categoryId: "categoryInvalid" },
    ],
    [
      [
        ["name", "a"],
        ["instructions", "x".repeat(5001)],
      ],
      { instructions: "instructionsTooLong" },
    ],
    [
      [
        ["name", "a"],
        ["bodyAreas", "wing"],
      ],
      { bodyAreas: "bodyAreasInvalid" },
    ],
    [
      [
        ["name", "a"],
        ["tags", "x".repeat(31)],
      ],
      { tags: "tagTooLong" },
    ],
    [
      [
        ["name", "a"],
        ...Array.from({ length: 21 }, (_, i) => ["tags", `t${i}`] as [string, string]),
      ],
      { tags: "tooManyTags" },
    ],
    [
      [
        ["name", "a"],
        ["media", "https://vimeo.com/1"],
      ],
      { media: "mediaInvalid" },
    ],
    [
      [["name", "a"], ...Array.from({ length: 11 }, () => ["media", SHORT] as [string, string])],
      { media: "tooManyMedia" },
    ],
    [
      [
        ["name", "a"],
        ["reps", "12"],
        ["repsMax", "10"],
      ],
      { repsMax: "repsMaxNotAboveReps" },
    ],
    [
      [
        ["name", "a"],
        ["sets", "lots"],
      ],
      { sets: "notAWholeNumber" },
    ],
  ] as [[string, string][], object][])("maps errors for %j", (entries, expected) => {
    const result = exerciseSchema.safeParse(exerciseFormValues(form(entries)));
    expect(result.success).toBe(false);
    if (!result.success) expect(exerciseFieldErrors(result.error)).toEqual(expected);
  });

  it("rejects duplicate videos", () => {
    const result = exerciseSchema.safeParse(
      exerciseFormValues(
        form([
          ["name", "a"],
          ["media", SHORT],
          ["media", SHORT.replace("?si=x", "")],
        ]),
      ),
    );
    expect(result.success).toBe(false);
    if (!result.success)
      expect(exerciseFieldErrors(result.error)).toEqual({ media: "mediaInvalid" });
  });

  it("ignores File values sent for text fields", () => {
    const data = form([["name", "a"]]);
    data.append("tags", new File(["x"], "x.txt"));
    expect(exerciseSchema.safeParse(exerciseFormValues(data)).success).toBe(false);
  });
});

describe("category schemas", () => {
  it("trims names and maps errors", () => {
    expect(createCategorySchema.parse({ name: "  Glutes ", parentId: null })).toEqual({
      name: "Glutes",
      parentId: null,
    });
    const tooLong = createCategorySchema.safeParse({ name: "x".repeat(61), parentId: null });
    const blank = createCategorySchema.safeParse({ name: " ", parentId: null });
    const badParent = createCategorySchema.safeParse({ name: "a", parentId: "x" });
    expect(!tooLong.success && categoryInputError(tooLong.error)).toBe("nameTooLong");
    expect(!blank.success && categoryInputError(blank.error)).toBe("nameRequired");
    expect(!badParent.success && categoryInputError(badParent.error)).toBe("invalid");
  });
});
```

Run: `pnpm vitest run src/server/library/schemas.test.ts` → FAIL.

- [ ] **Step 2: Implement `schemas.ts`**

```ts
import { z } from "zod";

import { BODY_AREAS, bodyAreaSchema } from "@/lib/body-areas";
import { type Prescription, prescriptionShape, refinePrescription } from "@/lib/prescription";
import { MAX_TAG_LENGTH, MAX_TAGS, normalizeTags } from "@/lib/tags";
import { parseYouTubeUrl, type YouTubeVideo } from "@/lib/youtube";

/** Mutation/action result. Errors are i18n keys. */
export type Result<T, E extends string> = { ok: true; data: T } | { ok: false; error: E };

export const EXERCISE_NAME_MAX_LENGTH = 120;
export const INSTRUCTIONS_MAX_LENGTH = 5000;
export const CATEGORY_NAME_MAX_LENGTH = 60;
export const MAX_MEDIA = 10;

export const idSchema = z.uuid();

const categoryName = z
  .string()
  .trim()
  .min(1, "nameRequired")
  .max(CATEGORY_NAME_MAX_LENGTH, "nameTooLong");

export const createCategorySchema = z.object({ name: categoryName, parentId: z.uuid().nullable() });
export const renameCategorySchema = z.object({ id: z.uuid(), name: categoryName });
export const reorderCategoriesSchema = z.object({
  parentId: z.uuid().nullable(),
  orderedIds: z
    .array(z.uuid())
    .min(1)
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length),
});
export type CreateCategoryInput = z.output<typeof createCategorySchema>;
export type RenameCategoryInput = z.output<typeof renameCategorySchema>;
export type ReorderCategoriesInput = z.output<typeof reorderCategoriesSchema>;

export type CategoryError =
  | "nameRequired"
  | "nameTooLong"
  | "nameTaken"
  | "notFound"
  | "parentNotFound"
  | "tooDeep"
  | "mismatch"
  | "invalid";

export function categoryInputError(error: z.ZodError): CategoryError {
  const message = error.issues[0]?.message;
  return message === "nameRequired" || message === "nameTooLong" ? message : "invalid";
}

const stringList = z.array(z.string());
const BODY_AREA_ORDER = new Map(BODY_AREAS.map((area, index) => [area, index]));

export const exerciseSchema = z
  .object({
    name: z.string().trim().min(1, "nameRequired").max(EXERCISE_NAME_MAX_LENGTH, "nameTooLong"),
    categoryId: z.preprocess(
      (value) => (value === "" || value === undefined ? null : value),
      z.uuid("categoryInvalid").nullable(),
    ),
    instructions: z
      .preprocess((value) => value ?? "", z.string("instructionsTooLong"))
      .transform((value) => value.trim())
      .pipe(z.string().max(INSTRUCTIONS_MAX_LENGTH, "instructionsTooLong"))
      .transform((value) => value || null),
    bodyAreas: z
      .array(bodyAreaSchema, "bodyAreasInvalid")
      .transform((areas) =>
        [...new Set(areas)].sort((a, b) => BODY_AREA_ORDER.get(a)! - BODY_AREA_ORDER.get(b)!),
      ),
    tags: stringList
      .transform(normalizeTags)
      .pipe(z.array(z.string().max(MAX_TAG_LENGTH, "tagTooLong")).max(MAX_TAGS, "tooManyTags")),
    media: stringList.max(MAX_MEDIA, "tooManyMedia").transform((urls, ctx): YouTubeVideo[] => {
      const videos = urls.map(parseYouTubeUrl);
      const ids = videos.map((video) => video?.videoId);
      if (videos.some((video) => video === null) || new Set(ids).size !== ids.length) {
        ctx.addIssue({ code: "custom", message: "mediaInvalid" });
        return z.NEVER;
      }
      return videos as YouTubeVideo[];
    }),
    ...prescriptionShape,
  })
  .superRefine(refinePrescription);

export type ExerciseInput = z.output<typeof exerciseSchema>;

const LIST_FIELDS = ["bodyAreas", "tags", "media"] as const;

/** FormData → plain object for exerciseSchema (list fields use repeated names). */
export function exerciseFormValues(formData: FormData): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, value] of formData) {
    if (!(LIST_FIELDS as readonly string[]).includes(key)) values[key] = value;
  }
  for (const key of LIST_FIELDS) values[key] = formData.getAll(key);
  return values;
}

export type ExerciseField =
  "name" | "categoryId" | "instructions" | "bodyAreas" | "tags" | "media" | keyof Prescription;
export type ExerciseFieldErrors = Partial<Record<ExerciseField, string>>;

const KNOWN_CODES = new Set([
  "nameRequired",
  "nameTooLong",
  "categoryInvalid",
  "instructionsTooLong",
  "bodyAreasInvalid",
  "tagTooLong",
  "tooManyTags",
  "tooManyMedia",
  "mediaInvalid",
  "notAWholeNumber",
  "outOfRange",
  "tooLong",
  "invalidSide",
  "repsMaxWithoutReps",
  "repsMaxNotAboveReps",
]);

/** First error per field as an i18n key ("invalid" for anything unexpected). */
export function exerciseFieldErrors(error: z.ZodError): ExerciseFieldErrors {
  const result: ExerciseFieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as ExerciseField | undefined;
    if (field === undefined || result[field] !== undefined) continue;
    result[field] = KNOWN_CODES.has(issue.message) ? issue.message : "invalid";
  }
  return result;
}

export type ExerciseFormState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "error"; fieldErrors: ExerciseFieldErrors; formError?: "notFound" | "unknown" };
```

Adjust zod details (e.g. how `z.array(bodyAreaSchema, "bodyAreasInvalid")` reports an invalid
element: the element issue's message must end up as `bodyAreasInvalid`; pass
`z.array(bodyAreaSchema.or(z.never()), …)` or map element errors via `{ error: () => "bodyAreasInvalid" }`
on the enum) until the tests pass. Keep the error codes exactly as listed.

Run: `pnpm vitest run src/server/library/schemas.test.ts` → PASS.

- [ ] **Step 3: Write failing integration tests for queries and mutations**

`src/server/library/library.int.test.ts` (`runAsPhysio` + test physios, one `describe` per
area; each `it` creates its own data through the mutations under test). Cases:

1. `createCategory`: top-level positions 0, 1, 2; a sub-category under a top-level one;
   `nameTaken` for `"  lower LIMB"` vs existing `"Lower limb"` at the same level (parse through
   `createCategorySchema` first, as the action does); `tooDeep` when the parent is a
   sub-category; `parentNotFound` for a random uuid and for physio B's category id.
2. `renameCategory`: renames; `nameTaken` for a sibling's name; `notFound` for B's id.
3. `reorderCategories`: rewrites positions to the given order (read back with
   `listCategoryTree`); `mismatch` when ids are missing, extra, or belong to another parent.
4. `deleteCategory`: returns `notFound` for B's id (and B's row survives); deleting a parent
   removes its sub-categories and leaves their exercises (archived included) with
   `categoryId: null`.
5. `listCategoryTree`: nested, sorted, with `activeCount`/`totalCount` summed into parents;
   archived exercises count only in `totalCount`.
6. `createExercise` + `getExercise`: round-trips every field including prescription and media
   (positions 0..n in the given order, `isShort` derived from the stored URL);
   `categoryNotFound` for B's category id; `getExercise` returns null for B's exercise id and
   for a random uuid.
7. `updateExercise`: replaces media (reordered, one removed, one added) and fields;
   `notFound` for B's exercise (B's row unchanged); `categoryNotFound` for B's category.
8. `setExerciseArchived` / `deleteExercise`: archive hides from the default list and shows
   under `{ kind: "archived" }`; restore brings it back; delete removes it and its media;
   both return `notFound` for B's ids.
9. `listExercises` filters (seed a handful of exercises in `beforeAll` for one physio):
   - category: a top-level id includes its sub-categories' exercises; `{ kind: "none" }`
     returns only uncategorised; `{ kind: "archived" }` only archived.
   - `area: "knee"` matches only exercises whose `bodyAreas` contains knee.
   - `tag: "band"` exact tag match.
   - search: `"bridge"` matches "Single-leg Bridge"; `"elevacion"` matches "Elevación de
     talones"; `"ÉLÉV"` matches too; `"band"` matches an exercise tagged `band` whose name has
     no "band"; `"100%"` matches only "100% effort sprint" (not "1000 m row"); `"a_b"` does not
     match "axb"; `"o'brien"` runs without error.
   - never returns another physio's exercises; results sorted by name case-insensitively;
     `cover` is the position-0 video.
10. `listTags`: distinct, sorted, own exercises only.

Run: `pnpm test:int src/server/library` → FAIL (modules not found).

- [ ] **Step 4: Implement `queries.ts`**

```ts
import "server-only";

import { and, asc, eq, isNotNull, isNull, sql, type SQL } from "drizzle-orm";

import type { Tx } from "@/db/rls";
import { exerciseCategories, exerciseMedia, exercises, type Exercise } from "@/db/schema";
import type { BodyArea } from "@/lib/body-areas";
import { buildCategoryTree, type CategoryNode } from "@/lib/category-tree";
import type { LibraryFilters } from "@/lib/library-params";
import { escapeLike } from "@/lib/sql-like";
import { parseYouTubeUrl } from "@/lib/youtube";

export const LIST_LIMIT = 500;

export async function listCategoryTree(tx: Tx, physioId: string): Promise<CategoryNode[]> {
  const rows = await tx
    .select({
      id: exerciseCategories.id,
      parentId: exerciseCategories.parentId,
      name: exerciseCategories.name,
      position: exerciseCategories.position,
      activeCount: sql<number>`(count(${exercises.id}) filter (where ${exercises.archivedAt} is null))::int`,
      totalCount: sql<number>`count(${exercises.id})::int`,
    })
    .from(exerciseCategories)
    .leftJoin(
      exercises,
      and(
        eq(exercises.physioId, exerciseCategories.physioId),
        eq(exercises.categoryId, exerciseCategories.id),
      ),
    )
    .where(eq(exerciseCategories.physioId, physioId))
    .groupBy(exerciseCategories.id);
  return buildCategoryTree(rows);
}

export type ExerciseSummary = {
  id: string;
  name: string;
  categoryId: string | null;
  bodyAreas: BodyArea[];
  tags: string[];
  archivedAt: Date | null;
  cover: { videoId: string; isShort: boolean } | null;
};

export async function listExercises(
  tx: Tx,
  physioId: string,
  filters: LibraryFilters,
): Promise<ExerciseSummary[]> {
  const conditions: SQL[] = [eq(exercises.physioId, physioId)];
  const { category } = filters;
  conditions.push(
    category.kind === "archived" ? isNotNull(exercises.archivedAt) : isNull(exercises.archivedAt),
  );
  if (category.kind === "none") conditions.push(isNull(exercises.categoryId));
  if (category.kind === "category") {
    conditions.push(sql`${exercises.categoryId} in (
      select ${exerciseCategories.id} from ${exerciseCategories}
      where ${exerciseCategories.physioId} = ${physioId}
        and (${exerciseCategories.id} = ${category.id} or ${exerciseCategories.parentId} = ${category.id}))`);
  }
  if (filters.area)
    conditions.push(sql`${exercises.bodyAreas} @> array[${filters.area}]::public.body_area[]`);
  if (filters.tag) conditions.push(sql`${exercises.tags} @> array[${filters.tag}]::text[]`);
  if (filters.q) {
    const term = escapeLike(filters.q.toLowerCase());
    conditions.push(sql`(
      public.f_unaccent(lower(${exercises.name})) like public.f_unaccent(${`%${term}%`})
      or exists (
        select 1 from unnest(${exercises.tags}) as tag
        where public.f_unaccent(tag) like public.f_unaccent(${`${term}%`})))`);
  }

  const rows = await tx
    .select({
      id: exercises.id,
      name: exercises.name,
      categoryId: exercises.categoryId,
      bodyAreas: exercises.bodyAreas,
      tags: exercises.tags,
      archivedAt: exercises.archivedAt,
      coverUrl: sql<string | null>`(
        select ${exerciseMedia.externalUrl} from ${exerciseMedia}
        where ${exerciseMedia.physioId} = ${exercises.physioId}
          and ${exerciseMedia.exerciseId} = ${exercises.id}
        order by ${exerciseMedia.position} limit 1)`,
    })
    .from(exercises)
    .where(and(...conditions))
    .orderBy(sql`lower(${exercises.name})`, asc(exercises.id))
    .limit(LIST_LIMIT);

  return rows.map(({ coverUrl, ...row }) => {
    const video = coverUrl ? parseYouTubeUrl(coverUrl) : null;
    return { ...row, cover: video ? { videoId: video.videoId, isShort: video.isShort } : null };
  });
}

export async function listTags(tx: Tx, physioId: string): Promise<string[]> {
  const rows = await tx.execute<{ tag: string }>(sql`
    select distinct unnest(${exercises.tags}) as tag from ${exercises}
    where ${exercises.physioId} = ${physioId}
    order by tag`);
  return rows.map((row) => row.tag);
}

export type ExerciseDetail = Exercise & {
  media: { id: string; url: string; videoId: string; isShort: boolean }[];
};

export async function getExercise(
  tx: Tx,
  physioId: string,
  id: string,
): Promise<ExerciseDetail | null> {
  const [exercise] = await tx
    .select()
    .from(exercises)
    .where(and(eq(exercises.physioId, physioId), eq(exercises.id, id)));
  if (!exercise) return null;
  const media = await tx
    .select({ id: exerciseMedia.id, url: exerciseMedia.externalUrl })
    .from(exerciseMedia)
    .where(and(eq(exerciseMedia.physioId, physioId), eq(exerciseMedia.exerciseId, id)))
    .orderBy(asc(exerciseMedia.position));
  return {
    ...exercise,
    media: media.flatMap(({ id: mediaId, url }) => {
      const video = parseYouTubeUrl(url);
      return video
        ? [{ id: mediaId, url: video.url, videoId: video.videoId, isShort: video.isShort }]
        : [];
    }),
  };
}
```

(`sql` interpolates JS strings as bound parameters, so `%term%` is never spliced into SQL.)

- [ ] **Step 5: Implement `mutations.ts`**

```ts
import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { isCheckViolation, isForeignKeyViolation, isUniqueViolation } from "@/db/errors";
import type { Tx } from "@/db/rls";
import { exerciseCategories, exerciseMedia, exercises } from "@/db/schema";

import type {
  CreateCategoryInput,
  ExerciseInput,
  RenameCategoryInput,
  ReorderCategoriesInput,
  Result,
} from "./schemas";

const ok = <T>(data: T) => ({ ok: true, data }) as const;
const fail = <E extends string>(error: E) => ({ ok: false, error }) as const;

const ownCategory = (physioId: string, id: string) =>
  and(eq(exerciseCategories.physioId, physioId), eq(exerciseCategories.id, id));
const siblingsOf = (physioId: string, parentId: string | null) =>
  and(
    eq(exerciseCategories.physioId, physioId),
    parentId === null
      ? isNull(exerciseCategories.parentId)
      : eq(exerciseCategories.parentId, parentId),
  );
const ownExercise = (physioId: string, id: string) =>
  and(eq(exercises.physioId, physioId), eq(exercises.id, id));

export async function createCategory(
  tx: Tx,
  physioId: string,
  input: CreateCategoryInput,
): Promise<Result<{ id: string }, "nameTaken" | "parentNotFound" | "tooDeep">> {
  if (input.parentId) {
    const [parent] = await tx
      .select({ parentId: exerciseCategories.parentId })
      .from(exerciseCategories)
      .where(ownCategory(physioId, input.parentId));
    if (!parent) return fail("parentNotFound");
    if (parent.parentId !== null) return fail("tooDeep");
  }
  const [{ next }] = await tx
    .select({ next: sql<number>`coalesce(max(${exerciseCategories.position}) + 1, 0)::int` })
    .from(exerciseCategories)
    .where(siblingsOf(physioId, input.parentId));
  try {
    // A savepoint, so a constraint violation does not abort the caller's transaction.
    const [row] = await tx.transaction((savepoint) =>
      savepoint
        .insert(exerciseCategories)
        .values({ physioId, parentId: input.parentId, name: input.name, position: next })
        .returning({ id: exerciseCategories.id }),
    );
    return ok(row);
  } catch (error) {
    if (isUniqueViolation(error, "exercise_categories_name_unique")) return fail("nameTaken");
    if (isForeignKeyViolation(error, "exercise_categories_parent_fk"))
      return fail("parentNotFound");
    if (isCheckViolation(error, "exercise_categories_max_depth")) return fail("tooDeep");
    throw error;
  }
}

export async function renameCategory(
  tx: Tx,
  physioId: string,
  input: RenameCategoryInput,
): Promise<Result<null, "nameTaken" | "notFound">> {
  try {
    const rows = await tx.transaction((savepoint) =>
      savepoint
        .update(exerciseCategories)
        .set({ name: input.name })
        .where(ownCategory(physioId, input.id))
        .returning({ id: exerciseCategories.id }),
    );
    return rows.length ? ok(null) : fail("notFound");
  } catch (error) {
    if (isUniqueViolation(error, "exercise_categories_name_unique")) return fail("nameTaken");
    throw error;
  }
}

export async function reorderCategories(
  tx: Tx,
  physioId: string,
  input: ReorderCategoriesInput,
): Promise<Result<null, "mismatch">> {
  const siblings = await tx
    .select({ id: exerciseCategories.id })
    .from(exerciseCategories)
    .where(siblingsOf(physioId, input.parentId));
  const current = new Set(siblings.map((row) => row.id));
  if (
    current.size !== input.orderedIds.length ||
    !input.orderedIds.every((id) => current.has(id))
  ) {
    return fail("mismatch");
  }
  for (const [position, id] of input.orderedIds.entries()) {
    await tx.update(exerciseCategories).set({ position }).where(ownCategory(physioId, id));
  }
  return ok(null);
}

export async function deleteCategory(
  tx: Tx,
  physioId: string,
  id: string,
): Promise<Result<null, "notFound">> {
  const rows = await tx
    .delete(exerciseCategories)
    .where(ownCategory(physioId, id))
    .returning({ id: exerciseCategories.id });
  return rows.length ? ok(null) : fail("notFound");
}

function exerciseValues(input: ExerciseInput) {
  const { media: _media, ...values } = input;
  return values;
}

async function insertMedia(tx: Tx, physioId: string, exerciseId: string, input: ExerciseInput) {
  if (input.media.length === 0) return;
  await tx.insert(exerciseMedia).values(
    input.media.map((video, position) => ({
      physioId,
      exerciseId,
      kind: "youtube" as const,
      externalUrl: video.url,
      externalId: video.videoId,
      position,
    })),
  );
}

export async function createExercise(
  tx: Tx,
  physioId: string,
  input: ExerciseInput,
): Promise<Result<{ id: string }, "categoryNotFound">> {
  try {
    const row = await tx.transaction(async (savepoint) => {
      const [created] = await savepoint
        .insert(exercises)
        .values({ physioId, ...exerciseValues(input) })
        .returning({ id: exercises.id });
      await insertMedia(savepoint, physioId, created.id, input);
      return created;
    });
    return ok(row);
  } catch (error) {
    if (isForeignKeyViolation(error, "exercises_category_fk")) return fail("categoryNotFound");
    throw error;
  }
}

export async function updateExercise(
  tx: Tx,
  physioId: string,
  id: string,
  input: ExerciseInput,
): Promise<Result<{ id: string }, "categoryNotFound" | "notFound">> {
  try {
    const found = await tx.transaction(async (savepoint) => {
      const rows = await savepoint
        .update(exercises)
        .set(exerciseValues(input))
        .where(ownExercise(physioId, id))
        .returning({ id: exercises.id });
      if (rows.length === 0) return false;
      await savepoint
        .delete(exerciseMedia)
        .where(and(eq(exerciseMedia.physioId, physioId), eq(exerciseMedia.exerciseId, id)));
      await insertMedia(savepoint, physioId, id, input);
      return true;
    });
    return found ? ok({ id }) : fail("notFound");
  } catch (error) {
    if (isForeignKeyViolation(error, "exercises_category_fk")) return fail("categoryNotFound");
    throw error;
  }
}

export async function setExerciseArchived(
  tx: Tx,
  physioId: string,
  id: string,
  archived: boolean,
): Promise<Result<null, "notFound">> {
  const rows = await tx
    .update(exercises)
    .set({ archivedAt: archived ? sql`coalesce(${exercises.archivedAt}, now())` : null })
    .where(ownExercise(physioId, id))
    .returning({ id: exercises.id });
  return rows.length ? ok(null) : fail("notFound");
}

/** Spec 05 adds a routine_items FK; then this returns "inUse" and the UI offers archive. */
export async function deleteExercise(
  tx: Tx,
  physioId: string,
  id: string,
): Promise<Result<null, "notFound">> {
  const rows = await tx
    .delete(exercises)
    .where(ownExercise(physioId, id))
    .returning({ id: exercises.id });
  return rows.length ? ok(null) : fail("notFound");
}
```

`Tx` is Drizzle's transaction type; a savepoint (`tx.transaction(fn)`'s argument) has the same
type, so `insertMedia(savepoint, …)` typechecks. If not, type the parameter as
`Pick<Tx, "insert">`.

- [ ] **Step 6: Run and commit**

Run: `pnpm test:int` → PASS. `pnpm check` → PASS.

```bash
git add src/server/library
git commit -m "feat(library): library schemas, queries and mutations"
```

---

### Task 5: Library server actions

**Files:**

- Create: `src/server/library/actions.ts`, `src/server/library/actions.test.ts`

**Interfaces:**

- Consumes: Task 4 schemas and mutations; `withPhysio` (`@/server/auth/session`).
- Produces (all `"use server"`):
  - `saveExerciseAction(state: ExerciseFormState, formData: FormData): Promise<ExerciseFormState>`
    (hidden `id` field ⇒ update, else create and `redirect("/library/{id}")`)
  - `setExerciseArchivedAction(id: string, archived: boolean): Promise<Result<null, "notFound">>`
  - `deleteExerciseAction(id: string): Promise<Result<null, "notFound">>` (redirects to
    `/library` on success)
  - `createCategoryAction(input: { name: string; parentId: string | null }): Promise<Result<{ id: string }, CategoryError>>`
  - `renameCategoryAction(input: { id: string; name: string }): Promise<Result<null, CategoryError>>`
  - `reorderCategoriesAction(input: { parentId: string | null; orderedIds: string[] }): Promise<Result<null, CategoryError>>`
  - `deleteCategoryAction(id: string): Promise<Result<null, CategoryError>>`

- [ ] **Step 1: Failing tests**

`src/server/library/actions.test.ts`, mocking like `src/server/physios/actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createCategoryAction,
  deleteCategoryAction,
  deleteExerciseAction,
  saveExerciseAction,
  setExerciseArchivedAction,
} from "./actions";

const m = vi.hoisted(() => ({
  createExercise: vi.fn(),
  updateExercise: vi.fn(),
  setExerciseArchived: vi.fn(),
  deleteExercise: vi.fn(),
  createCategory: vi.fn(),
  renameCategory: vi.fn(),
  reorderCategories: vi.fn(),
  deleteCategory: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));

vi.mock("@/server/auth/session", () => ({
  withPhysio: (fn: (tx: unknown, physioId: string) => unknown) => fn({}, "physio-1"),
}));
vi.mock("./mutations", () => m);
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));

const UUID = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";
const idle = { status: "idle" } as const;
const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
};

beforeEach(() => vi.clearAllMocks());

describe("saveExerciseAction", () => {
  it("returns field errors without touching the database", async () => {
    await expect(saveExerciseAction(idle, form({ name: "" }))).resolves.toEqual({
      status: "error",
      fieldErrors: { name: "nameRequired" },
    });
    expect(m.createExercise).not.toHaveBeenCalled();
  });

  it("creates and redirects to the new exercise", async () => {
    m.createExercise.mockResolvedValue({ ok: true, data: { id: UUID } });
    await expect(saveExerciseAction(idle, form({ name: "Plank" }))).rejects.toThrow(
      `REDIRECT /library/${UUID}`,
    );
    expect(m.createExercise).toHaveBeenCalledWith(
      {},
      "physio-1",
      expect.objectContaining({ name: "Plank" }),
    );
    expect(m.revalidatePath).toHaveBeenCalledWith("/library", "layout");
  });

  it("updates in place", async () => {
    m.updateExercise.mockResolvedValue({ ok: true, data: { id: UUID } });
    await expect(saveExerciseAction(idle, form({ id: UUID, name: "Plank" }))).resolves.toEqual({
      status: "saved",
    });
    expect(m.updateExercise).toHaveBeenCalledWith(
      {},
      "physio-1",
      UUID,
      expect.objectContaining({ name: "Plank" }),
    );
  });

  it("maps mutation errors", async () => {
    m.updateExercise.mockResolvedValueOnce({ ok: false, error: "categoryNotFound" });
    await expect(saveExerciseAction(idle, form({ id: UUID, name: "a" }))).resolves.toEqual({
      status: "error",
      fieldErrors: { categoryId: "categoryInvalid" },
    });
    m.updateExercise.mockResolvedValueOnce({ ok: false, error: "notFound" });
    await expect(saveExerciseAction(idle, form({ id: UUID, name: "a" }))).resolves.toEqual({
      status: "error",
      fieldErrors: {},
      formError: "notFound",
    });
  });

  it("treats a malformed id as not found", async () => {
    await expect(saveExerciseAction(idle, form({ id: "nope", name: "a" }))).resolves.toMatchObject({
      formError: "notFound",
    });
    expect(m.updateExercise).not.toHaveBeenCalled();
    expect(m.createExercise).not.toHaveBeenCalled();
  });
});

describe("exercise actions", () => {
  it.each([undefined, null, 42, "nope"])("reject a bad id (%j)", async (id) => {
    await expect(setExerciseArchivedAction(id as never, true)).resolves.toEqual({
      ok: false,
      error: "notFound",
    });
    await expect(deleteExerciseAction(id as never)).resolves.toEqual({
      ok: false,
      error: "notFound",
    });
    expect(m.setExerciseArchived).not.toHaveBeenCalled();
    expect(m.deleteExercise).not.toHaveBeenCalled();
  });

  it("archives with a strict boolean", async () => {
    m.setExerciseArchived.mockResolvedValue({ ok: true, data: null });
    await setExerciseArchivedAction(UUID, "yes" as never);
    expect(m.setExerciseArchived).toHaveBeenCalledWith({}, "physio-1", UUID, false);
  });

  it("redirects to the library after deleting", async () => {
    m.deleteExercise.mockResolvedValue({ ok: true, data: null });
    await expect(deleteExerciseAction(UUID)).rejects.toThrow("REDIRECT /library");
  });
});

describe("category actions", () => {
  it("validates input", async () => {
    await expect(createCategoryAction({ name: " ", parentId: null })).resolves.toEqual({
      ok: false,
      error: "nameRequired",
    });
    await expect(createCategoryAction("junk" as never)).resolves.toEqual({
      ok: false,
      error: "invalid",
    });
    await expect(deleteCategoryAction("nope")).resolves.toEqual({ ok: false, error: "invalid" });
    expect(m.createCategory).not.toHaveBeenCalled();
  });

  it("passes through results and revalidates on success", async () => {
    m.createCategory.mockResolvedValue({ ok: true, data: { id: UUID } });
    await expect(createCategoryAction({ name: " Glutes ", parentId: null })).resolves.toEqual({
      ok: true,
      data: { id: UUID },
    });
    expect(m.createCategory).toHaveBeenCalledWith({}, "physio-1", {
      name: "Glutes",
      parentId: null,
    });
    expect(m.revalidatePath).toHaveBeenCalledWith("/library", "layout");
  });
});
```

Run: `pnpm vitest run src/server/library/actions.test.ts` → FAIL.

- [ ] **Step 2: Implement `actions.ts`**

```ts
"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { withPhysio } from "@/server/auth/session";

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
import {
  categoryInputError,
  createCategorySchema,
  exerciseFieldErrors,
  exerciseFormValues,
  exerciseSchema,
  idSchema,
  renameCategorySchema,
  reorderCategoriesSchema,
  type CategoryError,
  type ExerciseFormState,
  type Result,
} from "./schemas";

const revalidateLibrary = () => revalidatePath("/library", "layout");

export async function saveExerciseAction(
  _state: ExerciseFormState,
  formData: FormData,
): Promise<ExerciseFormState> {
  const rawId = formData.get("id");
  const id = rawId === null || rawId === "" ? null : idSchema.safeParse(rawId);
  if (id && !id.success) return { status: "error", fieldErrors: {}, formError: "notFound" };

  formData.delete("id");
  const parsed = exerciseSchema.safeParse(exerciseFormValues(formData));
  if (!parsed.success) return { status: "error", fieldErrors: exerciseFieldErrors(parsed.error) };

  const result = await withPhysio((tx, physioId) =>
    id
      ? updateExercise(tx, physioId, id.data, parsed.data)
      : createExercise(tx, physioId, parsed.data),
  );
  if (!result.ok) {
    return result.error === "categoryNotFound"
      ? { status: "error", fieldErrors: { categoryId: "categoryInvalid" } }
      : { status: "error", fieldErrors: {}, formError: "notFound" };
  }
  revalidateLibrary();
  if (!id) redirect(`/library/${result.data.id}` as Route);
  return { status: "saved" };
}

export async function setExerciseArchivedAction(
  id: string,
  archived: boolean,
): Promise<Result<null, "notFound">> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "notFound" };
  const result = await withPhysio((tx, physioId) =>
    setExerciseArchived(tx, physioId, parsed.data, archived === true),
  );
  if (result.ok) revalidateLibrary();
  return result;
}

export async function deleteExerciseAction(id: string): Promise<Result<null, "notFound">> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "notFound" };
  const result = await withPhysio((tx, physioId) => deleteExercise(tx, physioId, parsed.data));
  if (!result.ok) return result;
  revalidateLibrary();
  redirect("/library");
}

export async function createCategoryAction(input: {
  name: string;
  parentId: string | null;
}): Promise<Result<{ id: string }, CategoryError>> {
  const parsed = createCategorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: categoryInputError(parsed.error) };
  return revalidated(await withPhysio((tx, physioId) => createCategory(tx, physioId, parsed.data)));
}

export async function renameCategoryAction(input: {
  id: string;
  name: string;
}): Promise<Result<null, CategoryError>> {
  const parsed = renameCategorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: categoryInputError(parsed.error) };
  return revalidated(await withPhysio((tx, physioId) => renameCategory(tx, physioId, parsed.data)));
}

export async function reorderCategoriesAction(input: {
  parentId: string | null;
  orderedIds: string[];
}): Promise<Result<null, CategoryError>> {
  const parsed = reorderCategoriesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return revalidated(
    await withPhysio((tx, physioId) => reorderCategories(tx, physioId, parsed.data)),
  );
}

export async function deleteCategoryAction(id: string): Promise<Result<null, CategoryError>> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return revalidated(await withPhysio((tx, physioId) => deleteCategory(tx, physioId, parsed.data)));
}

function revalidated<R extends { ok: boolean }>(result: R): R {
  if (result.ok) revalidateLibrary();
  return result;
}
```

Note `"use server"` files may only export async functions: keep `revalidated`/`revalidateLibrary`
unexported.

- [ ] **Step 3: Run and commit**

Run: `pnpm vitest run src/server/library` → PASS; `pnpm check` → PASS.

```bash
git add src/server/library/actions.ts src/server/library/actions.test.ts
git commit -m "feat(library): library server actions"
```

---

### Task 6: Reusable UI pieces: sortable list, YouTube preview, media editor, tag input, prescription fields

**Files:**

- Add deps: `pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
- Add shadcn: `pnpm dlx shadcn@latest add dialog alert-dialog sheet popover command textarea`
  (creates files in `src/components/ui/`; if the registry is unreachable, write them by hand in
  the existing `radix-mira` style using `radix-ui` + `cmdk`)
- Create: `src/components/sortable/sortable-list.tsx`, `src/components/sortable/sortable-list.test.tsx`
- Create: `src/components/library/youtube-thumbnail.tsx`
- Create: `src/components/library/youtube-preview.tsx`, `…/youtube-preview.test.tsx`
- Create: `src/components/library/media-list-editor.tsx`, `…/media-list-editor.test.tsx`
- Create: `src/components/library/tag-input.tsx`, `…/tag-input.test.tsx`
- Create: `src/components/prescription/prescription-fields.tsx`, `…/prescription-fields.test.tsx`
- Modify: `messages/en.json`, `messages/es.json` (namespaces `Sortable`, `Prescription`,
  `Library.media`, `Library.tags`)

**Interfaces:**

- Consumes: `parseYouTubeUrl`, `youtubeThumbnailUrl`, `youtubeEmbedUrl`, `splitTagInput`,
  `MAX_TAGS`, `PRESCRIPTION_*`, `Prescription`, `MAX_MEDIA`.
- Produces:
  - `SortableList<T extends { key: string }>(props: { items: T[]; onReorder: (items: T[]) => void; label: (item: T) => string; renderItem: (item: T, handle: SortableHandleProps) => ReactNode; className?: string })`
    where `type SortableHandleProps = { ref: (node: HTMLElement | null) => void } & Record<string, unknown>`
    (spread on a drag-handle `<button>`)
  - `YouTubeThumbnail({ videoId, className? })` (decorative `<img alt="">`, lazy)
  - `YouTubePreview({ videoId, isShort, title })` (client, click-to-load)
  - `MediaListEditor({ name?: string = "media", defaultValue: string[]; title: string })`
    (hidden inputs `name` = canonical URLs, in order)
  - `TagInput({ name?: string = "tags", id?: string, defaultValue: string[], suggestions: string[], describedBy?: string })`
    (hidden inputs `name` per tag)
  - `PrescriptionFields({ defaultValue: Prescription; errors?: Partial<Record<keyof Prescription, string>> })`
    (inputs named after `PRESCRIPTION_FIELDS`)

- [ ] **Step 1: Messages**

Add to `messages/en.json`:

```json
"Sortable": {
  "instructions": "To pick up an item, press space or enter. Use the arrow keys to move it, then press space or enter to drop it, or escape to cancel.",
  "picked": "Picked up {item}.",
  "moved": "{item} moved to position {position} of {total}.",
  "dropped": "{item} dropped at position {position} of {total}.",
  "cancelled": "Moving {item} was cancelled.",
  "handle": "Reorder {item}"
},
"Prescription": {
  "legend": "Default prescription",
  "hint": "Copied into routines when you add this exercise. Leave blank anything that doesn't apply.",
  "sets": "Sets",
  "reps": "Reps",
  "repsMax": "Reps (max)",
  "repsMaxHint": "For a range, e.g. 8–12",
  "durationSeconds": "Duration (s)",
  "holdSeconds": "Hold (s)",
  "restSeconds": "Rest (s)",
  "load": "Load",
  "loadPlaceholder": "e.g. 5 kg, red band",
  "side": "Side",
  "sideNone": "Not set",
  "sides": { "left": "Left", "right": "Right", "both": "Both sides", "alternating": "Alternating" },
  "notes": "Notes",
  "errors": {
    "notAWholeNumber": "Enter a whole number.",
    "outOfRange": "Enter a number from {min, number} to {max, number}.",
    "tooLong": "Use at most {max, number} characters.",
    "invalidSide": "Choose a side from the list.",
    "repsMaxWithoutReps": "Enter reps first.",
    "repsMaxNotAboveReps": "Must be more than reps.",
    "invalid": "Check this field."
  }
}
```

and inside a new `"Library"` object:

```json
"media": {
  "label": "YouTube link",
  "placeholder": "https://youtube.com/shorts/…",
  "add": "Add video",
  "hint": "Paste a YouTube video or Short. The first video is the cover; drag to reorder.",
  "cover": "Cover",
  "remove": "Remove video {position, number}",
  "itemLabel": "Video {position, number}",
  "play": "Play video: {title}",
  "embedTitle": "Video: {title}",
  "empty": "No videos yet.",
  "errors": {
    "notYouTube": "Paste a YouTube link (youtube.com/watch, youtu.be or youtube.com/shorts).",
    "duplicate": "This video is already in the list.",
    "limit": "You can add up to {max, number} videos."
  }
},
"tags": {
  "placeholder": "Add a tag and press Enter",
  "remove": "Remove tag {tag}",
  "suggestions": "Existing tags",
  "limit": "Up to {max, number} tags."
}
```

`messages/es.json` (same keys):

```json
"Sortable": {
  "instructions": "Para agarrar un elemento, presioná espacio o enter. Movelo con las flechas y presioná espacio o enter para soltarlo, o escape para cancelar.",
  "picked": "Agarraste {item}.",
  "moved": "{item} se movió a la posición {position} de {total}.",
  "dropped": "{item} quedó en la posición {position} de {total}.",
  "cancelled": "Se canceló el movimiento de {item}.",
  "handle": "Reordenar {item}"
},
"Prescription": {
  "legend": "Prescripción por defecto",
  "hint": "Se copia en las rutinas cuando agregás este ejercicio. Dejá en blanco lo que no aplique.",
  "sets": "Series",
  "reps": "Repeticiones",
  "repsMax": "Repeticiones (máx.)",
  "repsMaxHint": "Para un rango, p. ej. 8–12",
  "durationSeconds": "Duración (s)",
  "holdSeconds": "Sostener (s)",
  "restSeconds": "Descanso (s)",
  "load": "Carga",
  "loadPlaceholder": "p. ej. 5 kg, banda roja",
  "side": "Lado",
  "sideNone": "Sin definir",
  "sides": { "left": "Izquierdo", "right": "Derecho", "both": "Ambos lados", "alternating": "Alternado" },
  "notes": "Notas",
  "errors": {
    "notAWholeNumber": "Ingresá un número entero.",
    "outOfRange": "Ingresá un número de {min, number} a {max, number}.",
    "tooLong": "Usá como máximo {max, number} caracteres.",
    "invalidSide": "Elegí un lado de la lista.",
    "repsMaxWithoutReps": "Primero ingresá las repeticiones.",
    "repsMaxNotAboveReps": "Tiene que ser mayor que las repeticiones.",
    "invalid": "Revisá este campo."
  }
},
"Library": {
  "media": {
    "label": "Link de YouTube",
    "placeholder": "https://youtube.com/shorts/…",
    "add": "Agregar video",
    "hint": "Pegá un video o un Short de YouTube. El primer video es la portada; arrastrá para reordenar.",
    "cover": "Portada",
    "remove": "Quitar video {position, number}",
    "itemLabel": "Video {position, number}",
    "play": "Reproducir video: {title}",
    "embedTitle": "Video: {title}",
    "empty": "Todavía no hay videos.",
    "errors": {
      "notYouTube": "Pegá un link de YouTube (youtube.com/watch, youtu.be o youtube.com/shorts).",
      "duplicate": "Este video ya está en la lista.",
      "limit": "Podés agregar hasta {max, number} videos."
    }
  },
  "tags": {
    "placeholder": "Escribí una etiqueta y presioná Enter",
    "remove": "Quitar etiqueta {tag}",
    "suggestions": "Etiquetas existentes",
    "limit": "Hasta {max, number} etiquetas."
  }
}
```

- [ ] **Step 2: Failing component tests**

Render with `NextIntlClientProvider` and the real `messages/en.json` (see
`src/components/body-areas/body-area-picker.test.tsx` for the helper pattern). Tests:

- `sortable-list.test.tsx`: renders items in order with a handle labelled
  "Reorder {label}"; keyboard reorder (focus handle, `{Space}`, `{ArrowDown}`, `{Space}`)
  calls `onReorder` with the moved order. If jsdom can't drive dnd-kit's keyboard sensor
  (no layout), assert instead that handles have `aria-describedby` pointing at the translated
  instructions, and cover reordering in e2e (Task 10).
- `youtube-preview.test.tsx`: shows a button named "Play video: Bridge" and no iframe; clicking
  it renders an iframe titled "Video: Bridge" whose `src` starts with
  `https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?`; the Short variant's container has class
  `aspect-[9/16]`, the regular one `aspect-video`.
- `media-list-editor.test.tsx`: typing `youtu.be/dQw4w9WgXcQ?si=1` and pressing Enter (inside a
  `<form>` whose `onSubmit` spy must **not** fire) adds an item and a hidden input
  `media=https://www.youtube.com/watch?v=dQw4w9WgXcQ`; the first item shows "Cover"; an invalid
  URL shows the `notYouTube` error and adds nothing; the same video again shows `duplicate`;
  at 10 items the input is disabled and shows `limit`; "Remove video 1" removes it and the
  next item becomes the cover.
- `tag-input.test.tsx`: typing `Band` + Enter adds chip "band" and hidden input `tags=band`;
  typing `rubber, #Home,` adds "rubber" and "home"; adding "BAND" again does nothing;
  Backspace in the empty input removes the last tag; a suggestion `beginner` (from
  `suggestions`) appears when typing `beg` and clicking it adds it; already-chosen tags are not
  suggested; at 20 tags the input is disabled with the limit hint; Enter never submits the
  surrounding form.
- `prescription-fields.test.tsx`: renders labelled inputs for every field with the default
  values; the side select offers "Not set" + 4 sides; `errors={{ reps: "outOfRange", load: "tooLong", repsMax: "repsMaxNotAboveReps" }}`
  renders "Enter a number from 1 to 999.", "Use at most 40 characters.",
  "Must be more than reps." and marks those inputs `aria-invalid`.

Run: `pnpm vitest run src/components/sortable src/components/library src/components/prescription` → FAIL.

- [ ] **Step 3: Implement**

`src/components/sortable/sortable-list.tsx`:

```tsx
"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export type SortableHandleProps = { ref: (node: HTMLElement | null) => void } & Record<
  string,
  unknown
>;

/** Vertical drag-to-reorder list with keyboard support and translated announcements. */
export function SortableList<T extends { key: string }>({
  items,
  onReorder,
  label,
  renderItem,
  className,
}: {
  items: T[];
  onReorder: (items: T[]) => void;
  label: (item: T) => string;
  renderItem: (item: T, handle: SortableHandleProps) => ReactNode;
  className?: string;
}) {
  const t = useTranslations("Sortable");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const byKey = (key: unknown) => items.find((item) => item.key === key);
  const position = (key: unknown) => items.findIndex((item) => item.key === key) + 1;
  const name = (key: unknown) => {
    const item = byKey(key);
    return item ? label(item) : "";
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => t("picked", { item: name(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? t("moved", { item: name(active.id), position: position(over.id), total: items.length })
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? t("dropped", { item: name(active.id), position: position(over.id), total: items.length })
        : undefined,
    onDragCancel: ({ active }) => t("cancelled", { item: name(active.id) }),
  };

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    onReorder(arrayMove(items, position(active.id) - 1, position(over.id) - 1));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{ announcements, screenReaderInstructions: { draggable: t("instructions") } }}
    >
      <SortableContext items={items.map((item) => item.key)} strategy={verticalListSortingStrategy}>
        <ul className={className}>
          {items.map((item) => (
            <SortableRow
              key={item.key}
              id={item.key}
              handleLabel={t("handle", { item: label(item) })}
            >
              {(handle) => renderItem(item, handle)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  handleLabel,
  children,
}: {
  id: string;
  handleLabel: string;
  children: (handle: SortableHandleProps) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "relative z-10 opacity-80" : undefined}
    >
      {children({
        ...attributes,
        ...listeners,
        ref: setActivatorNodeRef,
        "aria-label": handleLabel,
      })}
    </li>
  );
}
```

Handle usage in consumers:
`<button type="button" {...handle} className="cursor-grab touch-none …"><GripVerticalIcon aria-hidden /></button>`.

`src/components/library/youtube-thumbnail.tsx`:

```tsx
import { youtubeThumbnailUrl } from "@/lib/youtube";
import { cn } from "@/lib/utils";

/** Decorative YouTube thumbnail (the surrounding control carries the accessible name). */
export function YouTubeThumbnail({ videoId, className }: { videoId: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- third-party thumbnail; no optimisation needed
    <img
      src={youtubeThumbnailUrl(videoId)}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={cn("bg-muted size-full object-cover", className)}
    />
  );
}
```

`src/components/library/youtube-preview.tsx`:

```tsx
"use client";

import { PlayIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { youtubeEmbedUrl } from "@/lib/youtube";
import { cn } from "@/lib/utils";

import { YouTubeThumbnail } from "./youtube-thumbnail";

/** Click-to-load YouTube player: no third-party iframe until the physio asks for it. */
export function YouTubePreview({
  videoId,
  isShort,
  title,
  className,
}: {
  videoId: string;
  isShort: boolean;
  title: string;
  className?: string;
}) {
  const t = useTranslations("Library.media");
  const [playing, setPlaying] = useState(false);
  return (
    <div
      className={cn(
        "bg-muted relative overflow-hidden rounded-lg",
        isShort ? "aspect-[9/16] w-full max-w-60" : "aspect-video w-full",
        className,
      )}
    >
      {playing ? (
        <iframe
          src={youtubeEmbedUrl(videoId)}
          title={t("embedTitle", { title })}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="size-full border-0"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={t("play", { title })}
          className="group focus-visible:ring-ring/50 size-full outline-none focus-visible:ring-[3px]"
        >
          <YouTubeThumbnail videoId={videoId} />
          <span className="bg-background/80 text-foreground group-hover:bg-primary group-hover:text-primary-foreground absolute inset-0 m-auto flex size-12 items-center justify-center rounded-full shadow-sm transition-colors">
            <PlayIcon aria-hidden className="size-5" />
          </span>
        </button>
      )}
    </div>
  );
}
```

`src/components/library/media-list-editor.tsx` (client): state
`items: { key: string; url: string; videoId: string; isShort: boolean }[]` initialised from
`defaultValue` via `parseYouTubeUrl` (drop unparsable), `draft`, `error:
"notYouTube" | "duplicate" | "limit" | null`, `previewKey: string | null`.

- Input (`id` from `useId`, labelled "YouTube link", `aria-describedby` hint/error,
  `inputMode="url"`, placeholder) + "Add video" button (`type="button"`).
  `onKeyDown` Enter → `preventDefault()` + add. `add()`: parse draft; null → `notYouTube`;
  existing `videoId` → `duplicate`; `items.length >= MAX_MEDIA` → `limit` (input also
  `disabled` at the limit, with the limit message shown); else append with
  `key = crypto.randomUUID()`, clear draft/error.
- `SortableList` of rows: drag handle; a thumbnail button (`w-24`, aspect by `isShort`) that
  toggles `previewKey` (when open, render `<YouTubePreview>` under the row with `title`);
  "Cover" `Badge` on index 0; the URL (`truncate text-sm text-muted-foreground`); a remove
  `Button variant="ghost" size="icon"` labelled `remove` with `{ position: index + 1 }`.
  `label(item)` for announcements = `t("itemLabel", { position })`.
- Empty list → `t("empty")` in muted text.
- Hidden inputs after the list: `items.map((item) => <input key={item.key} type="hidden" name={name} value={item.url} />)`.

`src/components/library/tag-input.tsx` (client): state `tags: string[]` (from
`normalizeTags(defaultValue)`), `draft`, `open`.

- Container styled like `Input` (`border-input rounded-md border px-2 py-1 flex flex-wrap gap-1 focus-within:ring-[3px] focus-within:ring-ring/50`);
  each chip is a `Badge variant="secondary"` with the tag and an `XIcon` button labelled
  `t("remove", { tag })`.
- The text input (`id` prop for the external `<Label htmlFor>`) handles:
  - `Enter` or `,` → `preventDefault()`, `commit(draft)`;
  - `Backspace` with empty draft → remove last tag;
  - `onChange` → if the value contains a comma, commit everything before the last comma and
    keep the rest as draft;
  - `onBlur` → commit the draft.
  - `commit(text)`: `splitTagInput(text)`, append those not already present, truncate to
    `MAX_TAGS`; clear draft.
  - `disabled` when `tags.length >= MAX_TAGS` (show `t("limit", { max: MAX_TAGS })`).
- Suggestions: `suggestions.filter((s) => s.startsWith(normalizeTag(draft)) && !tags.includes(s)).slice(0, 8)`,
  shown when the draft is non-empty and there are matches, as a `role="listbox"`
  (`aria-label={t("suggestions")}`) of `role="option"` buttons under the field (use the
  shadcn `Command`/`Popover` if it works with the chip layout; a plain absolutely positioned
  list with arrow-key support is acceptable). Clicking/choosing one commits it (use
  `onMouseDown={(e) => e.preventDefault()}` so blur doesn't commit the draft first).
- Hidden inputs: one `<input type="hidden" name={name} value={tag}>` per tag.

`src/components/prescription/prescription-fields.tsx` (no `"use client"`; rendered inside the
client form):

```tsx
import { useTranslations } from "next-intl";
import { useId } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  LOAD_MAX_LENGTH,
  PRESCRIPTION_LIMITS,
  PRESCRIPTION_NOTES_MAX_LENGTH,
  PRESCRIPTION_SIDES,
  type Prescription,
} from "@/lib/prescription";
import { cn } from "@/lib/utils";

export const selectClassName =
  "border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm";

type NumberField = keyof typeof PRESCRIPTION_LIMITS;
const NUMBER_FIELDS: NumberField[] = [
  "sets",
  "reps",
  "repsMax",
  "durationSeconds",
  "holdSeconds",
  "restSeconds",
];

/** Default-prescription inputs (spec 03), reused by routine items (spec 05). */
export function PrescriptionFields({
  defaultValue,
  errors = {},
}: {
  defaultValue: Prescription;
  errors?: Partial<Record<keyof Prescription, string>>;
}) {
  const t = useTranslations("Prescription");
  const id = useId();
  const errorText = (field: keyof Prescription): string | null => {
    const code = errors[field];
    if (!code) return null;
    if (code === "outOfRange" && field in PRESCRIPTION_LIMITS) {
      return t("errors.outOfRange", PRESCRIPTION_LIMITS[field as NumberField]);
    }
    if (code === "tooLong") {
      return t("errors.tooLong", {
        max: field === "load" ? LOAD_MAX_LENGTH : PRESCRIPTION_NOTES_MAX_LENGTH,
      });
    }
    const known = ["notAWholeNumber", "invalidSide", "repsMaxWithoutReps", "repsMaxNotAboveReps"];
    return t(`errors.${(known.includes(code) ? code : "invalid") as "invalid"}`);
  };
  const field = (name: keyof Prescription) => ({
    id: `${id}-${name}`,
    name,
    "aria-invalid": errors[name] !== undefined,
    "aria-describedby": errors[name] ? `${id}-${name}-error` : undefined,
  });
  const message = (name: keyof Prescription) => {
    const text = errorText(name);
    return text ? (
      <p id={`${id}-${name}-error`} className="text-destructive text-sm">
        {text}
      </p>
    ) : null;
  };

  return (
    <fieldset className="grid gap-4">
      <legend className="text-base font-medium">{t("legend")}</legend>
      <p className="text-muted-foreground -mt-2 text-sm">{t("hint")}</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {NUMBER_FIELDS.map((name) => (
          <div key={name} className="grid content-start gap-2">
            <Label htmlFor={`${id}-${name}`}>{t(name)}</Label>
            <Input
              {...field(name)}
              type="text"
              inputMode="numeric"
              defaultValue={defaultValue[name] ?? ""}
              aria-describedby={
                name === "repsMax" && !errors.repsMax
                  ? `${id}-repsMax-hint`
                  : field(name)["aria-describedby"]
              }
            />
            {name === "repsMax" && !errors.repsMax ? (
              <p id={`${id}-repsMax-hint`} className="text-muted-foreground text-xs">
                {t("repsMaxHint")}
              </p>
            ) : null}
            {message(name)}
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor={`${id}-load`}>{t("load")}</Label>
          <Input
            {...field("load")}
            maxLength={LOAD_MAX_LENGTH}
            placeholder={t("loadPlaceholder")}
            defaultValue={defaultValue.load ?? ""}
          />
          {message("load")}
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={`${id}-side`}>{t("side")}</Label>
          <select
            {...field("side")}
            defaultValue={defaultValue.side ?? ""}
            className={cn(selectClassName)}
          >
            <option value="">{t("sideNone")}</option>
            {PRESCRIPTION_SIDES.map((side) => (
              <option key={side} value={side}>
                {t(`sides.${side}`)}
              </option>
            ))}
          </select>
          {message("side")}
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-notes`}>{t("notes")}</Label>
        <Textarea
          {...field("notes")}
          rows={2}
          maxLength={PRESCRIPTION_NOTES_MAX_LENGTH}
          defaultValue={defaultValue.notes ?? ""}
        />
        {message("notes")}
      </div>
    </fieldset>
  );
}
```

(Uncontrolled inputs are fine here: the form dispatches from `onSubmit`, so React never
resets it; see Task 7.)

- [ ] **Step 4: Run and commit**

Run: `pnpm vitest run src/components` → PASS; `pnpm check` → PASS.

```bash
git add package.json pnpm-lock.yaml src/components messages
git commit -m "feat(library): sortable list, YouTube preview, media editor, tag input and prescription fields"
```

---

### Task 7: Exercise form, create and detail pages, archive/restore/delete

**Files:**

- Create: `src/components/library/exercise-form.tsx`, `…/exercise-form.test.tsx`
- Create: `src/components/library/category-select.tsx`
- Create: `src/components/library/exercise-actions.tsx`, `…/exercise-actions.test.tsx`
- Create: `src/app/(app)/library/new/page.tsx`
- Create: `src/app/(app)/library/[exerciseId]/page.tsx`
- Modify: `messages/en.json`, `messages/es.json` (`Library.title`, `Library.form`, `Library.detail`)

**Interfaces:**

- Consumes: Task 4 queries (`listCategoryTree`, `listTags`, `getExercise`), Task 5 actions,
  Task 6 components, `BodyAreaPicker` (`mode="multi" name="bodyAreas"`), `requirePhysio`/`withPhysio`.
- Produces:
  - `type ExerciseFormValues = { id?: string; name: string; categoryId: string | null; instructions: string | null; bodyAreas: BodyArea[]; tags: string[]; mediaUrls: string[]; prescription: Prescription }`
  - `ExerciseForm({ action, defaults, categories, tagSuggestions }: { action: (state: ExerciseFormState, formData: FormData) => Promise<ExerciseFormState>; defaults: ExerciseFormValues; categories: CategoryNode[]; tagSuggestions: string[] })`
  - `CategorySelect({ id, name, categories, defaultValue, invalid?, describedBy? })` (native
    `<select>`; `""` = Uncategorised; top-level `<optgroup label>` containing the category itself
    then its children labelled `"{parent} › {name}"`)
  - `ExerciseActions({ id, name, archived }: { id: string; name: string; archived: boolean })`

- [ ] **Step 1: Messages** (en then es; same keys)

```json
"title": "Exercise library",
"form": {
  "newTitle": "New exercise",
  "name": "Name",
  "category": "Category",
  "uncategorised": "Uncategorised",
  "subcategoryOption": "{parent} › {name}",
  "instructions": "Instructions",
  "instructionsHint": "Cues and steps. Line breaks are kept.",
  "bodyAreas": "Body areas",
  "tags": "Tags",
  "media": "Videos",
  "create": "Create exercise",
  "save": "Save changes",
  "saving": "Saving…",
  "saved": "Saved",
  "back": "Back to library",
  "errors": {
    "nameRequired": "Enter a name.",
    "nameTooLong": "Use at most {max, number} characters.",
    "categoryInvalid": "That category no longer exists. Choose another one.",
    "instructionsTooLong": "Use at most {max, number} characters.",
    "bodyAreasInvalid": "Choose body areas from the list.",
    "tagTooLong": "Tags can have at most {max, number} characters.",
    "tooManyTags": "Use at most {max, number} tags.",
    "tooManyMedia": "Add at most {max, number} videos.",
    "mediaInvalid": "Each video must be a different YouTube link.",
    "invalid": "Check this field.",
    "notFound": "This exercise no longer exists.",
    "unknown": "Something went wrong. Try again."
  }
},
"detail": {
  "archive": "Archive",
  "restore": "Restore",
  "delete": "Delete",
  "archivedNotice": "This exercise is archived: it's hidden from the library and from pickers, but routines that use it keep working.",
  "deleteTitle": "Delete this exercise?",
  "deleteBody": "“{name}” and its videos will be removed. This can't be undone.",
  "cancel": "Cancel",
  "confirmDelete": "Delete exercise",
  "errors": {
    "notFound": "This exercise no longer exists.",
    "unknown": "Something went wrong. Try again."
  }
}
```

```json
"title": "Biblioteca de ejercicios",
"form": {
  "newTitle": "Nuevo ejercicio",
  "name": "Nombre",
  "category": "Categoría",
  "uncategorised": "Sin categoría",
  "subcategoryOption": "{parent} › {name}",
  "instructions": "Instrucciones",
  "instructionsHint": "Indicaciones y pasos. Se respetan los saltos de línea.",
  "bodyAreas": "Zonas del cuerpo",
  "tags": "Etiquetas",
  "media": "Videos",
  "create": "Crear ejercicio",
  "save": "Guardar cambios",
  "saving": "Guardando…",
  "saved": "Guardado",
  "back": "Volver a la biblioteca",
  "errors": {
    "nameRequired": "Ingresá un nombre.",
    "nameTooLong": "Usá como máximo {max, number} caracteres.",
    "categoryInvalid": "Esa categoría ya no existe. Elegí otra.",
    "instructionsTooLong": "Usá como máximo {max, number} caracteres.",
    "bodyAreasInvalid": "Elegí zonas de la lista.",
    "tagTooLong": "Las etiquetas pueden tener hasta {max, number} caracteres.",
    "tooManyTags": "Usá como máximo {max, number} etiquetas.",
    "tooManyMedia": "Agregá como máximo {max, number} videos.",
    "mediaInvalid": "Cada video tiene que ser un link de YouTube distinto.",
    "invalid": "Revisá este campo.",
    "notFound": "Este ejercicio ya no existe.",
    "unknown": "Algo salió mal. Probá de nuevo."
  }
},
"detail": {
  "archive": "Archivar",
  "restore": "Restaurar",
  "delete": "Eliminar",
  "archivedNotice": "Este ejercicio está archivado: no aparece en la biblioteca ni en los selectores, pero las rutinas que lo usan siguen funcionando.",
  "deleteTitle": "¿Eliminar este ejercicio?",
  "deleteBody": "Se van a borrar “{name}” y sus videos. No se puede deshacer.",
  "cancel": "Cancelar",
  "confirmDelete": "Eliminar ejercicio",
  "errors": {
    "notFound": "Este ejercicio ya no existe.",
    "unknown": "Algo salió mal. Probá de nuevo."
  }
}
```

- [ ] **Step 2: Failing component tests**

- `exercise-form.test.tsx` (mock action with `vi.fn()` returning a state):
  - renders labelled Name, Category, Instructions, body-area picker, Tags, prescription
    fields, Videos, and "Create exercise" (no `id`) / "Save changes" (with `id`, and a hidden
    `id` input).
  - category select: "Uncategorised" first, then an optgroup per top-level category with
    "Lower limb" and "Lower limb › Glutes".
  - submitting passes a `FormData` with `name`, `categoryId`, repeated `bodyAreas`, `tags`,
    `media` and prescription fields to the action.
  - when the action resolves `{ status: "error", fieldErrors: { name: "nameTooLong", reps: "outOfRange", media: "mediaInvalid" } }`
    the form shows "Use at most 120 characters.", "Enter a number from 1 to 999." and
    "Each video must be a different YouTube link.", with `aria-invalid` on those inputs,
    **and the typed values are still in the inputs** (Review Focus 5).
  - `{ status: "saved" }` shows a status "Saved"; `formError: "notFound"` shows the alert.
- `exercise-actions.test.tsx` (mock `@/server/library/actions` and `next/navigation`'s
  `useRouter`): "Archive" calls `setExerciseArchivedAction(id, true)` then `router.refresh()`;
  archived shows "Restore" (calls with `false`); "Delete" opens a dialog titled
  "Delete this exercise?" mentioning the name; "Delete exercise" calls `deleteExerciseAction`;
  a `{ ok: false, error: "notFound" }` result shows "This exercise no longer exists.".

Run: `pnpm vitest run src/components/library/exercise-form.test.tsx src/components/library/exercise-actions.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`ExerciseForm` (client) follows `src/components/physios/profile-form.tsx`:
`useActionState(action, { status: "idle" })`; `<form action={formAction} onSubmit={onSubmit} noValidate className="grid gap-8">`
where `onSubmit` does `event.preventDefault(); const formData = new FormData(event.currentTarget); startTransition(() => formAction(formData));`
(this is what keeps typed values after a save or error: React only resets forms after
`action`-dispatched submissions). Layout (single column on mobile, `lg:grid-cols-[minmax(0,1fr)_20rem]`
on desktop with the picker in the side column is fine):

- hidden `id` when editing;
- Name `Input` (`maxLength={EXERCISE_NAME_MAX_LENGTH}`, `required`, error message);
- `CategorySelect` (`name="categoryId"`);
- Instructions `Textarea` (`rows={6}`, `maxLength={INSTRUCTIONS_MAX_LENGTH}`, hint/error);
- `BodyAreaPicker mode="multi" name="bodyAreas" label={t("bodyAreas")} defaultValue={defaults.bodyAreas}`
  (give its wrapper a definite width, see spec 02 decisions on container queries);
- Tags: `<Label htmlFor>` + `TagInput id=… defaultValue suggestions={tagSuggestions}`;
- `PrescriptionFields defaultValue={defaults.prescription} errors={prescriptionErrors}`;
- Videos: heading + `MediaListEditor defaultValue={defaults.mediaUrls} title={name || t("newTitle")}`;
- error messages map `fieldErrors[field]` to `t(\`form.errors.${code}\`, { max })`with the
right`max`per field (name 120, instructions 5 000, tags 30 or 20, media 10); unknown codes
→`form.errors.invalid`;
- `formError` → destructive `Alert`; submit `Button` (pending → "Saving…"); `role="status"`
  "Saved" after a successful update.

`CategorySelect`: `<select>` with `selectClassName` (exported from
`prescription-fields.tsx` in Task 6; import it from there):

```tsx
<select
  id={id}
  name={name}
  defaultValue={defaultValue ?? ""}
  aria-invalid={invalid}
  aria-describedby={describedBy}
  className={selectClassName}
>
  <option value="">{t("uncategorised")}</option>
  {categories.map((category) => (
    <optgroup key={category.id} label={category.name}>
      <option value={category.id}>{category.name}</option>
      {category.children.map((child) => (
        <option key={child.id} value={child.id}>
          {t("subcategoryOption", { parent: category.name, name: child.name })}
        </option>
      ))}
    </optgroup>
  ))}
</select>
```

`ExerciseActions` (client): `useTransition`, `useRouter`; Archive/Restore `Button
variant="outline"`; Delete `AlertDialog` (trigger `Button variant="outline"` with destructive
text; action button `variant="destructive"`), error `Alert` on failure. `deleteExerciseAction`
redirects on success, so only handle the failure result.

`src/app/(app)/library/new/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { ExerciseForm } from "@/components/library/exercise-form";
import { PageHeader } from "@/components/page-header";
import { EMPTY_PRESCRIPTION } from "@/lib/prescription";
import { withPhysio } from "@/server/auth/session";
import { saveExerciseAction } from "@/server/library/actions";
import { listCategoryTree, listTags } from "@/server/library/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Library.form");
  return { title: t("newTitle") };
}

export default async function NewExercisePage() {
  const t = await getTranslations("Library.form");
  const { categories, tags } = await withPhysio(async (tx, physioId) => ({
    categories: await listCategoryTree(tx, physioId),
    tags: await listTags(tx, physioId),
  }));
  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <Link href="/library" className="text-muted-foreground hover:text-foreground text-sm">
          ← {t("back")}
        </Link>
        <PageHeader title={t("newTitle")} />
      </div>
      <ExerciseForm
        action={saveExerciseAction}
        categories={categories}
        tagSuggestions={tags}
        defaults={{
          name: "",
          categoryId: null,
          instructions: null,
          bodyAreas: [],
          tags: [],
          mediaUrls: [],
          prescription: EMPTY_PRESCRIPTION,
        }}
      />
    </div>
  );
}
```

(Put the "←" arrow in an `aria-hidden` span or use `ArrowLeftIcon`; don't hard-code text.)

`src/app/(app)/library/[exerciseId]/page.tsx`: `params` is a Promise
(`PageProps<"/library/[exerciseId]">`). Validate with `idSchema.safeParse` → `notFound()` on
failure; load `getExercise`, `listCategoryTree`, `listTags` in one `withPhysio`; `notFound()`
when the exercise is null. `generateMetadata` uses the exercise name (same lookup; wrap the
loader in React `cache()` so both calls share it). Render: back link, `PageHeader` with the
exercise name and `ExerciseActions` as `actions`, an `Alert` with `detail.archivedNotice` when
archived, and `ExerciseForm` with `defaults` built from the exercise
(`prescription` = pick of `PRESCRIPTION_FIELDS`, `mediaUrls = media.map((m) => m.url)`) and
`key={exercise.updatedAt.toISOString()}` so a saved update re-mounts with fresh defaults.

- [ ] **Step 4: Run and commit**

Run: `pnpm vitest run src/components/library` → PASS; `pnpm check` → PASS. Start the dev
server (`preview_start` if available, else skip) only if cheap; e2e comes in Task 10.

```bash
git add src/components/library src/app/\(app\)/library messages
git commit -m "feat(library): exercise form with create, edit, archive and delete"
```

---

### Task 8: Library browse page: category tree, filters, grid/list, empty states, mobile sheet

**Files:**

- Replace: `src/app/(app)/library/page.tsx`
- Create: `src/components/library/category-tree.tsx`, `…/category-tree.test.tsx`
- Create: `src/components/library/library-toolbar.tsx`, `…/library-toolbar.test.tsx`
- Create: `src/components/library/exercise-results.tsx`
- Create: `src/components/library/empty-library.tsx`
- Modify: `messages/en.json`, `messages/es.json` (`Library.description`, `newExercise`,
  `manageCategories`, `empty`, `noResults`, `results`, `archivedBadge`, `moreAreas`, `tree`,
  `filters`)

**Interfaces:**

- Consumes: `parseLibraryParams`, `libraryHref`, `hasActiveFilters`, `LibraryFilters`,
  `CategoryNode`, `listCategoryTree`, `listExercises`, `listTags`, `ExerciseSummary`,
  `YouTubeThumbnail`, `BodyAreaBadge`, `BODY_AREAS`, `CategoryManager` (Task 9: until then render
  nothing in its place; Task 9 wires it in).
- Produces:
  - `CategoryTree({ tree, filters }: { tree: CategoryNode[]; filters: LibraryFilters })` (client)
  - `LibraryToolbar({ filters, tags, children }: { filters: LibraryFilters; tags: string[]; children: ReactNode })`
    (client; `children` = the category tree for the mobile sheet)
  - `ExerciseResults({ exercises, view, archived }: { exercises: ExerciseSummary[]; view: LibraryView; archived: boolean })`
  - `EmptyLibrary()`

- [ ] **Step 1: Messages** (en / es)

```json
"description": "Your private exercises, organised in categories.",
"newExercise": "New exercise",
"manageCategories": "Manage categories",
"empty": {
  "title": "Build your exercise library",
  "body": "Add exercises with instructions, YouTube videos and default sets and reps. Group them in categories (for example Lower limb → Glutes) and tag them to find them fast.",
  "cta": "Create your first exercise"
},
"noResults": {
  "title": "No exercises match",
  "body": "Try another search or clear the filters.",
  "clear": "Clear filters"
},
"results": "{count, plural, one {# exercise} other {# exercises}}",
"archivedBadge": "Archived",
"moreAreas": "+{count, number}",
"tree": {
  "label": "Categories",
  "all": "All exercises",
  "uncategorised": "Uncategorised",
  "archived": "Archived",
  "toggle": "Sub-categories of {name}"
},
"filters": {
  "search": "Search exercises",
  "searchPlaceholder": "Search by name or tag",
  "area": "Body area",
  "allAreas": "All body areas",
  "tag": "Tag",
  "allTags": "All tags",
  "open": "Filters",
  "sheetDescription": "Narrow the library by category, body area or tag.",
  "view": "View",
  "grid": "Grid view",
  "list": "List view"
}
```

```json
"description": "Tus ejercicios privados, organizados en categorías.",
"newExercise": "Nuevo ejercicio",
"manageCategories": "Administrar categorías",
"empty": {
  "title": "Armá tu biblioteca de ejercicios",
  "body": "Agregá ejercicios con instrucciones, videos de YouTube y series y repeticiones por defecto. Agrupalos en categorías (por ejemplo Miembro inferior → Glúteos) y etiquetalos para encontrarlos rápido.",
  "cta": "Creá tu primer ejercicio"
},
"noResults": {
  "title": "Ningún ejercicio coincide",
  "body": "Probá con otra búsqueda o quitá los filtros.",
  "clear": "Quitar filtros"
},
"results": "{count, plural, one {# ejercicio} other {# ejercicios}}",
"archivedBadge": "Archivado",
"moreAreas": "+{count, number}",
"tree": {
  "label": "Categorías",
  "all": "Todos los ejercicios",
  "uncategorised": "Sin categoría",
  "archived": "Archivados",
  "toggle": "Subcategorías de {name}"
},
"filters": {
  "search": "Buscar ejercicios",
  "searchPlaceholder": "Buscá por nombre o etiqueta",
  "area": "Zona del cuerpo",
  "allAreas": "Todas las zonas",
  "tag": "Etiqueta",
  "allTags": "Todas las etiquetas",
  "open": "Filtros",
  "sheetDescription": "Filtrá la biblioteca por categoría, zona del cuerpo o etiqueta.",
  "view": "Vista",
  "grid": "Vista de cuadrícula",
  "list": "Vista de lista"
}
```

- [ ] **Step 2: Failing component tests**

- `category-tree.test.tsx`: renders a `navigation` named "Categories" with links "All
  exercises", "Uncategorised", each top-level and sub-category, and "Archived"; counts shown
  (`activeCount`); the link matching `filters.category` has `aria-current="page"`; links keep
  `q/area/tag/view` (e.g. with `filters.tag = "band"`, "Uncategorised" → `/library?category=none&tag=band`);
  a top-level toggle button (`aria-expanded`, named "Sub-categories of Lower limb") hides
  and shows its children; the branch containing the active sub-category starts expanded.
- `library-toolbar.test.tsx` (mock `next/navigation` `useRouter` → `{ replace: vi.fn() }`,
  fake timers): typing "bridge" in "Search exercises" calls `replace("/library?q=bridge&…")`
  once after 300 ms; choosing "Knee" in "Body area" calls `replace` with `area=knee`
  immediately; "All tags" clears `tag`; the view links have hrefs with/without `view=list` and
  `aria-current` on the active one; changing the search keeps the current category.

Run: `pnpm vitest run src/components/library/category-tree.test.tsx src/components/library/library-toolbar.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`CategoryTree` (client, because of the expand toggles): `<nav aria-label={t("tree.label")}>`
with a `<ul>`; `TreeLink` = `Link href={libraryHref(filters, { category })}` styled
`flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted`, active →
`bg-muted font-medium` + `aria-current="page"`; count in `text-muted-foreground tabular-nums text-xs`.
Order: All, Uncategorised, top-level categories (toggle `Button variant="ghost" size="icon-sm"`
with `ChevronRightIcon` rotating when expanded, `aria-expanded`, `aria-controls`), their
children indented (`pl-6`), then a `Separator` and Archived. Expanded state: `useState` of a
`Set` of ids, initially the branch containing the active category.

`LibraryToolbar` (client): `useRouter()`; `navigate(changes)` =
`router.replace(libraryHref(filters, changes), { scroll: false })`.

- Search: `Input type="search"` with `aria-label` "Search exercises", `defaultValue={filters.q}`,
  `maxLength={SEARCH_MAX_LENGTH}`, `SearchIcon` decoration; debounce 300 ms via `useRef` timer
  (clear on unmount); Enter navigates immediately.
- `FilterSelects` (area + tag native selects with `selectClassName`, labelled): rendered
  inline `hidden md:flex` on desktop, and inside the mobile `Sheet`
  (`SheetTrigger` = `Button variant="outline" className="md:hidden"` "Filters" with
  `SlidersHorizontalIcon`; `SheetContent side="left"` with `SheetTitle` "Filters",
  `SheetDescription`, the selects, and `children`). Close the sheet when a link in it is
  clicked (`onClick` on a wrapper that checks `event.target.closest("a")`).
- View toggle: two icon `Link`s (`LayoutGridIcon`, `ListIcon`) with `aria-label`s and
  `aria-current` on the active view, in a bordered group.

`ExerciseResults` (server component):

- Results count line `t("results", { count })` (`text-muted-foreground text-sm`,
  `role="status"`).
- Grid: `grid gap-4 sm:grid-cols-2 xl:grid-cols-3`, each card a `Link` to
  `/library/{id}` (`as Route`) wrapping `Card`: cover area `aspect-video bg-muted` with
  `YouTubeThumbnail` (or a `DumbbellIcon` placeholder when `cover` is null), then name
  (`font-medium`, `line-clamp-2`), up to 3 `BodyAreaBadge`s plus a `moreAreas` badge, tags
  as muted text (`#band #beginner` joined with spaces, `truncate`), and an "Archived" badge in
  the archived view.
- List: `<ul className="divide-y rounded-lg border">` rows with a `w-20 aspect-video`
  thumbnail, name, badges and tags on one line on desktop, wrapping on mobile.

`EmptyLibrary`: centred card with `DumbbellIcon`, `empty.title`, `empty.body`, and a
`Button asChild` → `Link href="/library/new"` "Create your first exercise".

`src/app/(app)/library/page.tsx`:

```tsx
export default async function LibraryPage({ searchParams }: PageProps<"/library">) {
  const filters = parseLibraryParams(await searchParams);
  const t = await getTranslations("Library");
  const { tree, exercises, tags } = await withPhysio(async (tx, physioId) => ({
    tree: await listCategoryTree(tx, physioId),
    exercises: await listExercises(tx, physioId, filters),
    tags: await listTags(tx, physioId),
  }));
  const libraryIsEmpty = exercises.length === 0 && !hasActiveFilters(filters) && tree.length === 0;
  const categoryTree = <CategoryTree tree={tree} filters={filters} />;

  return (
    <div className="grid gap-8">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button asChild>
            <Link href="/library/new">
              <PlusIcon aria-hidden /> {t("newExercise")}
            </Link>
          </Button>
        }
      />
      {libraryIsEmpty ? (
        <EmptyLibrary />
      ) : (
        <div className="grid gap-8 md:grid-cols-[14rem_minmax(0,1fr)]">
          <aside className="hidden md:block">{categoryTree}</aside>
          <div className="grid content-start gap-6">
            <LibraryToolbar filters={filters} tags={tags}>
              {categoryTree}
            </LibraryToolbar>
            {exercises.length === 0 ? (
              <NoResults />
            ) : (
              <ExerciseResults
                exercises={exercises}
                view={filters.view}
                archived={filters.category.kind === "archived"}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

`NoResults` (inline in the page or in `exercise-results.tsx`): title, body and a "Clear
filters" link to `libraryHref(DEFAULT_LIBRARY_FILTERS, { view: filters.view })`. If the
library has categories but no exercises and no filters, show `NoResults`-style copy is wrong:
in that case render `EmptyLibrary` inside the results column instead (condition:
`exercises.length === 0 && !hasActiveFilters(filters)` → `EmptyLibrary`, keeping the tree).
Simplify the page accordingly: full-width `EmptyLibrary` only when there are no categories
either.

- [ ] **Step 4: Run and commit**

Run: `pnpm vitest run src/components/library` → PASS; `pnpm check` → PASS.

```bash
git add src/components/library src/app/\(app\)/library/page.tsx messages
git commit -m "feat(library): browse page with category tree, filters and grid/list views"
```

---

### Task 9: Category manager dialog

**Files:**

- Create: `src/components/library/category-manager.tsx`, `…/category-manager.test.tsx`
- Modify: `src/app/(app)/library/page.tsx` (add `<CategoryManager tree={tree} />` to the
  header `actions`, before "New exercise"; also render it inside `EmptyLibrary`'s area so a new
  physio can create categories first)
- Modify: `messages/en.json`, `messages/es.json` (`Library.categories`)

**Interfaces:**

- Consumes: `CategoryNode`, `createCategoryAction`, `renameCategoryAction`,
  `reorderCategoriesAction`, `deleteCategoryAction`, `CategoryError`, `SortableList`,
  `CATEGORY_NAME_MAX_LENGTH`.
- Produces: `CategoryManager({ tree }: { tree: CategoryNode[] })` (client).

- [ ] **Step 1: Messages**

```json
"categories": {
  "title": "Categories",
  "description": "Two levels: a category and its sub-categories. Drag to reorder.",
  "nameLabel": "Category name",
  "add": "Add category",
  "addPlaceholder": "New category, e.g. Lower limb",
  "addSub": "Add sub-category to {name}",
  "subPlaceholder": "New sub-category",
  "rename": "Rename {name}",
  "save": "Save",
  "cancel": "Cancel",
  "delete": "Delete {name}",
  "deleteTitle": "Delete “{name}”?",
  "deleteSubcategories": "{count, plural, =0 {No sub-categories.} one {Its sub-category will be deleted too.} other {Its # sub-categories will be deleted too.}}",
  "deleteExercises": "{count, plural, =0 {No exercises are affected.} one {# exercise will move to Uncategorised.} other {# exercises will move to Uncategorised.}}",
  "confirmDelete": "Delete category",
  "empty": "No categories yet.",
  "done": "Done",
  "errors": {
    "nameRequired": "Enter a name.",
    "nameTooLong": "Use at most {max, number} characters.",
    "nameTaken": "There's already a category with this name here.",
    "notFound": "This category no longer exists.",
    "tooDeep": "Sub-categories can't have sub-categories.",
    "unknown": "Something went wrong. Try again."
  }
}
```

```json
"categories": {
  "title": "Categorías",
  "description": "Dos niveles: una categoría y sus subcategorías. Arrastrá para reordenar.",
  "nameLabel": "Nombre de la categoría",
  "add": "Agregar categoría",
  "addPlaceholder": "Nueva categoría, p. ej. Miembro inferior",
  "addSub": "Agregar subcategoría a {name}",
  "subPlaceholder": "Nueva subcategoría",
  "rename": "Renombrar {name}",
  "save": "Guardar",
  "cancel": "Cancelar",
  "delete": "Eliminar {name}",
  "deleteTitle": "¿Eliminar “{name}”?",
  "deleteSubcategories": "{count, plural, =0 {No tiene subcategorías.} one {También se va a eliminar su subcategoría.} other {También se van a eliminar sus # subcategorías.}}",
  "deleteExercises": "{count, plural, =0 {No afecta a ningún ejercicio.} one {# ejercicio va a pasar a Sin categoría.} other {# ejercicios van a pasar a Sin categoría.}}",
  "confirmDelete": "Eliminar categoría",
  "empty": "Todavía no hay categorías.",
  "done": "Listo",
  "errors": {
    "nameRequired": "Ingresá un nombre.",
    "nameTooLong": "Usá como máximo {max, number} caracteres.",
    "nameTaken": "Ya hay una categoría con este nombre acá.",
    "notFound": "Esta categoría ya no existe.",
    "tooDeep": "Las subcategorías no pueden tener subcategorías.",
    "unknown": "Algo salió mal. Probá de nuevo."
  }
}
```

- [ ] **Step 2: Failing tests**

`category-manager.test.tsx` (mock the four actions and `useRouter().refresh`):

- The trigger "Manage categories" opens a dialog titled "Categories"; empty tree shows
  "No categories yet.".
- Typing "Lower limb" in "Category name" + "Add category" calls
  `createCategoryAction({ name: "Lower limb", parentId: null })`, clears the input and calls
  `router.refresh()`; a `{ ok: false, error: "nameTaken" }` result shows
  "There's already a category with this name here." and keeps the text.
- "Add sub-category to Lower limb" reveals an input; submitting calls
  `createCategoryAction({ name: "Glutes", parentId: <lower limb id> })`.
- "Rename Lower limb" swaps in an input prefilled with the name; Enter calls
  `renameCategoryAction({ id, name })`; Escape cancels without calling.
- "Delete Lower limb" opens a confirmation with "Its 2 sub-categories will be deleted too."
  and "5 exercises will move to Uncategorised." (from `children.length` and `totalCount`);
  "Delete category" calls `deleteCategoryAction(id)`.
- Sub-categories are rendered under their parent; there is no "Add sub-category" button on a
  sub-category.

Run: `pnpm vitest run src/components/library/category-manager.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`CategoryManager` (client):

- `Dialog` with `DialogTrigger asChild` → `Button variant="outline"` (`FolderTreeIcon` +
  `manageCategories`); `DialogContent className="sm:max-w-lg max-h-[85svh] overflow-y-auto"`,
  `DialogHeader` (title, description), `DialogFooter` with a "Done" `DialogClose`.
- Local `items` state mirrors `tree` (reset when the `tree` prop changes: keep `prevTree` in
  state and compare, React's "adjusting state when a prop changes" pattern), so reorders show
  instantly. `useTransition` for every call; after `ok` → `router.refresh()`; after an error
  → show the translated message next to the control that caused it and restore `items` from
  `tree` for a failed reorder.
- Top-level: `SortableList` of `{ key: id, … }` rows; `onReorder(next)` → `setItems` +
  `reorderCategoriesAction({ parentId: null, orderedIds })`. Each row: handle, name (or the
  rename form), `activeCount` badge, icon buttons Rename (`PencilIcon`), Add sub-category
  (`PlusIcon`, top-level only), Delete (`Trash2Icon`) each with translated `aria-label`s.
  Children: a nested `SortableList` (its own `DndContext`, so items can't be dragged across
  parents) calling `reorderCategoriesAction({ parentId, orderedIds })`.
- `NameForm` (shared for add, add-sub and rename): `Input` (`aria-label` "Category name",
  `maxLength={CATEGORY_NAME_MAX_LENGTH}`, `autoFocus` for rename/sub), submit on Enter, Escape
  cancels (for rename/sub), error text below. It is a `<form>` with `onSubmit` +
  `preventDefault` (the dialog is portalled, so it is never nested inside another form).
- Delete: `AlertDialog` with title `deleteTitle`, body = `deleteSubcategories` (top-level only)
  - `deleteExercises` with `count: node.totalCount`; confirm button `variant="destructive"`.
- Map errors: `nameRequired`, `nameTaken`, `notFound`, `tooDeep` → same key; `nameTooLong` →
  with `{ max: CATEGORY_NAME_MAX_LENGTH }`; `parentNotFound` → `notFound`; `mismatch`/`invalid`
  → `unknown`.

Wire it into the page header (`actions={<><CategoryManager tree={tree} /><Button asChild>…</Button></>}`)
so it's reachable in every state, including the empty library.

- [ ] **Step 4: Run and commit**

Run: `pnpm vitest run src/components/library` → PASS; `pnpm check` → PASS.

```bash
git add src/components/library src/app/\(app\)/library/page.tsx messages
git commit -m "feat(library): category manager dialog"
```

---

### Task 10: End-to-end tests, docs and final verification

**Files:**

- Create: `e2e/library.spec.ts`
- Modify: `docs/specs/03-exercise-library.md` (Status `Done`, acceptance boxes ticked,
  "Decisions made during implementation"), `docs/specs/README.md` (status `Done`)

**Interfaces:**

- Consumes: everything above; `test`/`expect` from `e2e/helpers/auth.ts` (`physioPage`
  fixture: signed-in onboarded physio on `/dashboard`).

- [ ] **Step 1: Write the e2e test**

`e2e/library.spec.ts` (runs in both `desktop` and `mobile` projects; use the `isMobile`
fixture for the filters sheet):

```ts
import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/auth";

const SHORT = "https://youtube.com/shorts/dQw4w9WgXcQ?si=e2e";

async function openFilters(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole("button", { name: "Filters" }).click();
}

test("a physio builds, finds, archives and restores an exercise", async ({
  physioPage: page,
  isMobile,
}) => {
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Build your exercise library" })).toBeVisible();

  // Categories: a top-level category and a sub-category.
  await page.getByRole("button", { name: "Manage categories" }).click();
  const dialog = page.getByRole("dialog", { name: "Categories" });
  await dialog.getByLabel("Category name").fill("Lower limb");
  await dialog.getByRole("button", { name: "Add category" }).click();
  await dialog.getByRole("button", { name: "Add sub-category to Lower limb" }).click();
  await dialog.getByLabel("Category name").last().fill("Glutes");
  await dialog.getByLabel("Category name").last().press("Enter");
  await expect(dialog.getByText("Glutes")).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();

  // Exercise with category, area, tags, prescription and a YouTube Short.
  await page.getByRole("link", { name: "New exercise" }).first().click();
  await page.getByLabel("Name").fill("Single-leg bridge");
  await page.getByLabel("Category").selectOption({ label: "Lower limb › Glutes" });
  await page.getByLabel("Instructions").fill("Push through the heel.\nHold at the top.");
  await page.getByRole("checkbox", { name: "Glute" }).filter({ visible: true }).first().check();
  await page.getByLabel("Tags").fill("Bodyweight");
  await page.getByLabel("Tags").press("Enter");
  await page.getByLabel("Tags").fill("beginner,");
  await page.getByLabel("Sets").fill("3");
  await page.getByLabel("Reps", { exact: true }).fill("12");
  await page.getByLabel("YouTube link").fill(SHORT);
  await page.getByRole("button", { name: "Add video" }).click();
  await expect(page.getByText("Cover")).toBeVisible();
  await page.getByRole("button", { name: "Create exercise" }).click();

  await expect(page).toHaveURL(/\/library\/[0-9a-f-]{36}$/);
  await page.reload();
  await expect(page.getByLabel("Name")).toHaveValue("Single-leg bridge");
  await expect(page.getByLabel("Sets")).toHaveValue("3");
  await expect(page.getByText("bodyweight")).toBeVisible();

  // Edit keeps typed values after saving (Review Focus 5).
  await page.getByLabel("Reps (max)").fill("15");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await expect(page.getByLabel("Reps (max)")).toHaveValue("15");

  // Filters in the URL.
  await page.goto("/library");
  await expect(page.getByRole("link", { name: /Single-leg bridge/ })).toBeVisible();
  await openFilters(page, isMobile);
  await page.getByLabel("Body area").filter({ visible: true }).selectOption({ label: "Knee" });
  await expect(page).toHaveURL(/area=knee/);
  await expect(page.getByRole("heading", { name: "No exercises match" })).toBeVisible();
  await page.goto("/library?area=glute&tag=beginner");
  await expect(page.getByRole("link", { name: /Single-leg bridge/ })).toBeVisible();
  await page.goto("/library?q=BRIDGE");
  await expect(page.getByRole("link", { name: /Single-leg bridge/ })).toBeVisible();

  // Archive and restore.
  await page.getByRole("link", { name: /Single-leg bridge/ }).click();
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText(/This exercise is archived/)).toBeVisible();
  await page.goto("/library?category=archived");
  await expect(page.getByRole("link", { name: /Single-leg bridge/ })).toBeVisible();
  await page.goto("/library");
  await expect(page.getByRole("link", { name: /Single-leg bridge/ })).toHaveCount(0);
  await page.goto("/library?category=archived");
  await page.getByRole("link", { name: /Single-leg bridge/ }).click();
  await page.getByRole("button", { name: "Restore" }).click();
  await page.goto("/library");
  await expect(page.getByRole("link", { name: /Single-leg bridge/ })).toBeVisible();
});

test("an unknown or malformed exercise id is a 404", async ({ physioPage: page }) => {
  for (const id of ["not-a-uuid", crypto.randomUUID()]) {
    const response = await page.goto(`/library/${id}`);
    expect(response?.status()).toBe(404);
  }
});

test("deleting an exercise returns to the library", async ({ physioPage: page }) => {
  await page.goto("/library/new");
  await page.getByLabel("Name").fill("Throwaway plank");
  await page.getByRole("button", { name: "Create exercise" }).click();
  await expect(page).toHaveURL(/\/library\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete exercise" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole("link", { name: /Throwaway plank/ })).toHaveCount(0);
});
```

Selectors are indicative: adjust to the real accessible names (e.g. how the body-area list
labels its checkboxes, whether "Tags" labels the text input) but keep every assertion.

- [ ] **Step 2: Run e2e**

```bash
PORT=3103 pnpm test:e2e
```

Expected: all specs pass in `desktop` and `mobile` (including the existing ones). If the
body-area checkbox or sheet interactions differ on mobile, fix the test or the UI (never
weaken assertions).

- [ ] **Step 3: Docs**

- `docs/specs/03-exercise-library.md`: Status `Done`; tick acceptance criteria; fill
  "Decisions made during implementation" with what was actually decided (composite FKs +
  `ON DELETE SET NULL (category_id)`, `f_unaccent` + trigram index, search also matches tag
  prefixes, `?category=none|archived`, `view` param, 500-row cap, 10-video cap, click-to-load
  embeds, Shorts detection from the URL only, `Prescription`/`Sortable` namespaces, delete
  always allowed until spec 05 adds `inUse`, anything else that deviated).
- `docs/specs/README.md`: row 03 status `Done`.

- [ ] **Step 4: Full verification and commit**

```bash
pnpm check
pnpm test:int
PORT=3103 pnpm test:e2e
git add e2e/library.spec.ts docs
git commit -m "test(library): e2e for the exercise library; spec 03 done"
```
