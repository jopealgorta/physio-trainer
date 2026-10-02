// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { Locale } from "@/i18n/config";
import { youtubeCoverUrl } from "@/lib/youtube";
import type { ContentItem } from "@/server/routines/content";

import { buildExportDocument, type ExportSource, type SourceRoutine } from "../model";
import { exportTranslators } from "../translate";
import { truncateText } from "./document";
import { renderExportPdf } from "./render";

// Unit tests run without the int config's server-only alias; the real package throws here.
vi.mock("server-only", () => ({}));

const THUMB = readFileSync(join(process.cwd(), "src/server/export/__fixtures__/thumb.jpg"));
// Bytes after the JPEG's end marker make every cover a distinct image, as real covers are (the
// renderer embeds identical images once, which would understate the size).
const thumbFetch = vi.fn(
  async (url: string | URL | Request) =>
    new Response(new Uint8Array(Buffer.concat([THUMB, Buffer.from(String(url))])), {
      headers: { "content-type": "image/jpeg" },
    }),
) as unknown as typeof fetch;
const failingFetch = vi.fn(async () => {
  throw new Error("offline");
}) as unknown as typeof fetch;

function item(index: number, over: Partial<ContentItem> = {}): ContentItem {
  return {
    id: `item-${index}`,
    name: `Exercise ${index}`,
    instructions: "Keep your back straight and breathe out on the way up.",
    holdSeconds: index % 3 === 0 ? 5 : null,
    restSeconds: 60,
    side: index % 2 === 0 ? "both" : null,
    notes: index % 4 === 0 ? "Stop if it hurts." : null,
    sets: [
      { reps: 12, repsMax: null, durationSeconds: null, load: null },
      { reps: 10, repsMax: null, durationSeconds: null, load: "5 kg" },
    ],
    media: [{ videoId: `video${String(index).padStart(6, "0")}`, isShort: false }],
    ...over,
  };
}

function routine(id: string, blocks: SourceRoutine["blocks"], over: Partial<SourceRoutine> = {}) {
  return {
    id,
    name: `Routine ${id}`,
    notes: null,
    sessionsPerWeek: 3,
    sessionsPerDay: null,
    blocks,
    phase: null,
    ...over,
  } satisfies SourceRoutine;
}

function source(over: Partial<ExportSource> = {}): ExportSource {
  return {
    kind: "routine",
    customer: { id: "c", firstName: "Ana", locale: "en" },
    title: "Knee rehab",
    plans: [],
    routines: [],
    planRoutines: [],
    locale: "en",
    generatedOn: "2026-10-02",
    branding: {
      clinicName: "Kine Sur",
      logoUrl: "https://storage.example/logo.jpg",
      contact: {
        email: "hola@kinesur.com",
        phone: "+5491122334455",
        whatsappUrl: null,
        website: null,
      },
    },
    shareUrl: "https://physio.example/kinesur/knee-rehab-abc123",
    tracking: true,
    ...over,
  };
}

async function build(src: ExportSource) {
  const { t, summary } = await exportTranslators(src.locale as Locale);
  return { doc: buildExportDocument(src, summary), t };
}

const pageCount = (buffer: Buffer) =>
  (buffer.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;

/** Covers are cached per video id, so a test that must reach fetch uses its own id `prefix`. */
const tenExercises = (prefix: string) =>
  source({
    routines: [
      routine(
        "R",
        Array.from({ length: 10 }, (_, i) => ({
          kind: "single" as const,
          item: item(i + 1, { media: [{ videoId: `${prefix}${i + 1}`, isShort: false }] }),
        })),
      ),
    ],
  });

describe("renderExportPdf", () => {
  it("renders 10 exercises with thumbnails under 2 MB and 3 s", async () => {
    const { doc, t } = await build(tenExercises("sized"));
    const started = performance.now();
    const buffer = await renderExportPdf(doc, t, { fetchImpl: thumbFetch });
    const elapsed = performance.now() - started;
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(buffer.length).toBeLessThan(2 * 1024 * 1024);
    expect(elapsed).toBeLessThan(3000);
  });

  it("still renders when every image fails to load", async () => {
    const { doc, t } = await build(tenExercises("offline"));
    const buffer = await renderExportPdf(doc, t, { fetchImpl: failingFetch });
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    // Every cover and the logo really went to the (failing) network, none came from a cache.
    const urls = (failingFetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map(([url]) =>
      String(url),
    );
    expect(urls.sort()).toEqual(
      [
        "https://storage.example/logo.jpg",
        ...Array.from({ length: 10 }, (_, i) => youtubeCoverUrl(`offline${i + 1}`)),
      ].sort(),
    );
  });

  it("paginates 25 long exercises with a plan, a superset and Spanish text", async () => {
    const long = "Mantené la espalda recta y respirá. ".repeat(30).slice(0, 1000);
    const items = Array.from({ length: 25 }, (_, i) => item(i + 1, { instructions: long }));
    const blocks: SourceRoutine["blocks"] = [
      { kind: "group", key: "g", restSeconds: 45, items: items.slice(0, 3) },
      ...items.slice(3).map((it) => ({ kind: "single" as const, item: it })),
    ];
    const { doc, t } = await build(
      source({
        kind: "plan",
        locale: "es",
        title: "Rodilla – fase 2 ñ",
        customer: { id: "c", firstName: "Ñandú", locale: "es" },
        plans: [
          {
            id: "p",
            name: "Rodilla – fase 2 ñ",
            notes: "Caminá 20 minutos los días de descanso.",
            phase: { label: "Fase 2", startsOn: "2026-09-01", endsOn: "2026-10-31" },
            entries: [
              { weekday: 1, label: "Mañana", routineId: "R" },
              { weekday: 3, label: null, routineId: "R" },
              { weekday: 5, label: null, routineId: "S" },
            ],
          },
        ],
        planRoutines: [
          routine("R", blocks, {
            name: "Rodilla – fase 2 ñ",
            notes: "Hacelo despacio.",
            phase: { label: "Fase 2", startsOn: "2026-09-01", endsOn: null },
          }),
          routine("S", [{ kind: "single", item: item(99) }], { sessionsPerWeek: 0 }),
        ],
      }),
    );
    const buffer = await renderExportPdf(doc, t, { fetchImpl: thumbFetch });
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(pageCount(buffer)).toBeGreaterThan(1);
  });

  it("renders an empty document without a link or a logo", async () => {
    const { doc, t } = await build(
      source({
        kind: "customer",
        title: null,
        shareUrl: null,
        branding: { clinicName: "Kine Sur", logoUrl: null, contact: null },
      }),
    );
    expect(doc.isEmpty).toBe(true);
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const buffer = await renderExportPdf(doc, t, { fetchImpl });
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(pageCount(buffer)).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("truncateText", () => {
  it("keeps short text and cuts long text at the limit with an ellipsis", () => {
    expect(truncateText("short", 280)).toBe("short");
    const cut = truncateText("x".repeat(300), 280);
    expect(cut).toHaveLength(280);
    expect(cut.endsWith("…")).toBe(true);
  });
  it("cuts at a word break when there is one", () => {
    expect(truncateText("one two three four", 12)).toBe("one two…");
  });
  it("does not split a surrogate pair or leave trailing spaces", () => {
    expect(truncateText("ab 😀😀😀", 4)).toBe("ab…");
    expect(Array.from(truncateText("😀".repeat(10), 5))).toHaveLength(5);
  });
});
