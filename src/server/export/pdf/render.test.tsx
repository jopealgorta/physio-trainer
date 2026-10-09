// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Image, Link } from "@react-pdf/renderer";
import { isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Locale } from "@/i18n/config";
import { printAccent } from "@/lib/color";
import { youtubeWatchUrl } from "@/lib/youtube";
import type { ContentItem } from "@/server/routines/content";

import { buildExportDocument, type ExportSource, type SourceRoutine } from "../model";
import { exportTranslators } from "../translate";
import { ExportPdf } from "./document";
import { renderExportPdf } from "./render";

// Unit tests run without the int config's server-only alias; the real package throws here.
vi.mock("server-only", () => ({}));

const LOGO = readFileSync(join(process.cwd(), "src/server/export/__fixtures__/logo.jpg"));
const logoFetch = vi.fn(
  async () => new Response(new Uint8Array(LOGO), { headers: { "content-type": "image/jpeg" } }),
) as unknown as typeof fetch;
const failingFetch = vi.fn(async () => {
  throw new Error("offline");
}) as unknown as typeof fetch;

function item(index: number, over: Partial<ContentItem> = {}): ContentItem {
  return {
    id: `item-${index}`,
    exerciseId: `ex-${index}`,
    kind: "strength",
    name: `Exercise ${index}`,
    instructions: "Keep your back straight and breathe out on the way up.",
    holdSeconds: index % 3 === 0 ? 5 : null,
    restSeconds: 60,
    side: index % 2 === 0 ? "both" : null,
    notes: index % 4 === 0 ? "Stop if it hurts." : null,
    sets: [
      {
        reps: 12,
        repsMax: null,
        durationSeconds: null,
        load: null,
        distanceMeters: null,
        intensity: null,
      },
      {
        reps: 10,
        repsMax: null,
        durationSeconds: null,
        load: "5 kg",
        distanceMeters: null,
        intensity: null,
      },
    ],
    media: [{ videoId: `video${String(index).padStart(6, "0")}`, isShort: false }],
    ...over,
  };
}

function routine(
  id: string,
  blocks: SourceRoutine["sections"][number]["blocks"],
  over: Partial<SourceRoutine> = {},
) {
  return {
    id,
    name: `Routine ${id}`,
    notes: null,
    sessionsPerWeek: 3,
    sessionsPerDay: null,
    sections: [{ key: `s-${id}`, name: "", blocks }],
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
      accentColor: null,
      contact: {
        email: "hola@kinesur.com",
        phone: "+5491122334455",
        whatsappUrl: null,
        website: null,
      },
    },
    shareUrl: "https://physio.example/kinesur/knee-rehab-abc123",
    ...over,
  };
}

async function build(src: ExportSource) {
  const { t, summary } = await exportTranslators(src.locale as Locale);
  return { doc: buildExportDocument(src, summary), t };
}

/** Every string the document tree renders, expanding function components (none use hooks). */
function textOf(node: ReactNode): string[] {
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap(textOf);
  if (!isValidElement(node)) return [];
  const { type, props } = node as { type: unknown; props: { children?: ReactNode } };
  if (typeof type === "function") return textOf((type as (p: unknown) => ReactNode)(props));
  return textOf(props.children);
}

/** The merged style of the first element whose only child is `text`. */
function styleOf(node: ReactNode, text: string): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = styleOf(child, text);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const { type, props } = node as {
    type: unknown;
    props: { children?: ReactNode; style?: unknown };
  };
  if (typeof type === "function") return styleOf((type as (p: unknown) => ReactNode)(props), text);
  if (props.children === text) {
    const styles = [props.style].flat(Infinity).filter(Boolean) as Record<string, unknown>[];
    return Object.assign({}, ...styles);
  }
  return styleOf(props.children, text);
}

/** The props of every element of `type` in the tree, expanding function components. */
function elementsOf(node: ReactNode, type: unknown): Record<string, unknown>[] {
  if (Array.isArray(node)) return node.flatMap((child) => elementsOf(child, type));
  if (!isValidElement(node)) return [];
  const element = node as { type: unknown; props: { children?: ReactNode } };
  if (typeof element.type === "function") {
    return elementsOf((element.type as (p: unknown) => ReactNode)(element.props), type);
  }
  const own = element.type === type ? [element.props as Record<string, unknown>] : [];
  return [...own, ...elementsOf(element.props.children, type)];
}

/** Every fixed text drawn from a render prop, as it reads on `pageNumber` of `totalPages`. */
function fixedTexts(node: ReactNode, pageNumber: number, totalPages = 3): string[] {
  if (Array.isArray(node))
    return node.flatMap((child) => fixedTexts(child, pageNumber, totalPages));
  if (!isValidElement(node)) return [];
  const element = node as {
    type: unknown;
    props: {
      children?: ReactNode;
      render?: (p: { pageNumber: number; totalPages: number }) => unknown;
    };
  };
  if (typeof element.type === "function") {
    return fixedTexts(
      (element.type as (p: unknown) => ReactNode)(element.props),
      pageNumber,
      totalPages,
    );
  }
  const own = element.props.render
    ? [String(element.props.render({ pageNumber, totalPages }) ?? "")]
    : [];
  return [...own, ...fixedTexts(element.props.children, pageNumber, totalPages)];
}

const pageCount = (buffer: Buffer) =>
  (buffer.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;

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
  it("renders 10 exercises under 2 MB and 3 s", async () => {
    const { doc, t } = await build(tenExercises("sized"));
    const started = performance.now();
    const buffer = await renderExportPdf(doc, t, { fetchImpl: logoFetch });
    const elapsed = performance.now() - started;
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(buffer.length).toBeLessThan(2 * 1024 * 1024);
    expect(elapsed).toBeLessThan(3000);
  });

  it("fetches only the logo, and still renders when it fails to load", async () => {
    const { doc, t } = await build(tenExercises("offline"));
    const buffer = await renderExportPdf(doc, t, { fetchImpl: failingFetch });
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    // No video covers are fetched any more: the logo is the only image.
    const urls = (failingFetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map(([url]) =>
      String(url),
    );
    expect(urls).toEqual(["https://storage.example/logo.jpg"]);
  });

  it("paginates 25 long exercises with a plan, a superset and Spanish text", async () => {
    const long = "Mantené la espalda recta y respirá. ".repeat(30).slice(0, 1000);
    const items = Array.from({ length: 25 }, (_, i) => item(i + 1, { instructions: long }));
    const blocks: SourceRoutine["sections"][number]["blocks"] = [
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
            days: [{ weekday: 3, notes: "Día suave, parás si duele." }],
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
    const buffer = await renderExportPdf(doc, t, { fetchImpl: logoFetch });
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(pageCount(buffer)).toBeGreaterThan(1);
  });

  /** Renders and fails on react-pdf's overflow warning: an unbreakable view taller than a page. */
  async function renderWithoutOverflow(src: ExportSource) {
    const { doc, t } = await build(src);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const buffer = await renderExportPdf(doc, t, { fetchImpl: failingFetch });
      const overflow = warn.mock.calls.filter((args) => String(args[0]).includes("can't wrap"));
      expect(overflow).toEqual([]);
      return { doc, t, buffer };
    } finally {
      warn.mockRestore();
    }
  }

  const longInstructions = "Keep the knee over the second toe and move slowly. ".repeat(97).trim();

  it("prints instructions in full, breaking a first exercise longer than a page", async () => {
    const { doc, t, buffer } = await renderWithoutOverflow(
      source({
        routines: [
          routine("R", [{ kind: "single", item: item(1, { instructions: longInstructions }) }], {
            notes: "Warm up first. ".repeat(60).trim(),
          }),
        ],
      }),
    );
    expect(textOf(ExportPdf({ doc, t, logo: null }))).toContain(longInstructions);
    expect(pageCount(buffer)).toBeGreaterThan(1);
  });

  it("breaks a long first exercise under a section heading", async () => {
    const { buffer } = await renderWithoutOverflow(
      source({
        routines: [
          {
            ...routine("R", []),
            sections: [
              { key: "a", name: "Warm-up", blocks: [{ kind: "single", item: item(1) }] },
              {
                key: "b",
                name: "Strength",
                blocks: [
                  {
                    kind: "single",
                    item: item(2, {
                      instructions: longInstructions,
                      notes: "Go slowly. ".repeat(45).trim(),
                    }),
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    expect(pageCount(buffer)).toBeGreaterThan(1);
  });

  it("breaks a long first superset member", async () => {
    const { buffer } = await renderWithoutOverflow(
      source({
        routines: [
          routine("R", [
            {
              kind: "group",
              key: "g",
              restSeconds: 60,
              items: [item(1, { instructions: longInstructions }), item(2)],
            },
          ]),
        ],
      }),
    );
    expect(pageCount(buffer)).toBeGreaterThan(1);
  });

  it("prints a heading per section only when two or more are non-empty", async () => {
    const two = await build(
      source({
        routines: [
          {
            ...routine("R", []),
            sections: [
              { key: "a", name: "Calentamiento", blocks: [{ kind: "single", item: item(1) }] },
              { key: "b", name: "Fuerza", blocks: [{ kind: "single", item: item(2) }] },
              { key: "c", name: "Vacía", blocks: [] },
            ],
          },
        ],
      }),
    );
    const texts = textOf(ExportPdf({ doc: two.doc, t: two.t, logo: null }));
    expect(texts).toContain("Calentamiento");
    expect(texts).toContain("Fuerza");
    expect(texts).not.toContain("Vacía");
    // A heading of its own: larger than the superset caption, in the text colour, not uppercase.
    const heading = styleOf(ExportPdf({ doc: two.doc, t: two.t, logo: null }), "Calentamiento");
    expect(heading).toMatchObject({ fontSize: 10.5, fontWeight: 700, color: "#171717" });
    expect(heading?.textTransform).toBeUndefined();
    expect(heading?.marginTop).toBeGreaterThan(0);

    const one = await build(
      source({
        routines: [
          {
            ...routine("R", []),
            sections: [
              { key: "a", name: "Solo uno", blocks: [{ kind: "single", item: item(1) }] },
              { key: "b", name: "Vacía", blocks: [] },
            ],
          },
        ],
      }),
    );
    const oneTexts = textOf(ExportPdf({ doc: one.doc, t: one.t, logo: null }));
    expect(oneTexts).not.toContain("Solo uno");
    const buffer = await renderExportPdf(two.doc, two.t, { fetchImpl: failingFetch });
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("prints the per-day frequency of a routine with no weekly count", async () => {
    const { doc, t } = await build(
      source({
        routines: [
          routine("R", [{ kind: "single", item: item(1) }], {
            sessionsPerWeek: null,
            sessionsPerDay: 3,
          }),
        ],
      }),
    );
    const texts = textOf(ExportPdf({ doc, t, logo: null }));
    expect(texts).toContain("3 times a day");
    const buffer = await renderExportPdf(doc, t, { fetchImpl: failingFetch });
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("renders an empty document without a link or a logo", async () => {
    const { doc, t } = await build(
      source({
        kind: "customer",
        title: null,
        shareUrl: null,
        branding: { clinicName: "Kine Sur", logoUrl: null, accentColor: null, contact: null },
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

describe("ExportPdf", () => {
  const supersetRoutine = () =>
    source({
      routines: [
        {
          ...routine("R", []),
          sections: [
            { key: "a", name: "Warm-up", blocks: [{ kind: "single", item: item(1) }] },
            {
              key: "b",
              name: "Strength",
              blocks: [
                { kind: "group", key: "g", restSeconds: 90, items: [item(2), item(3)] },
                { kind: "single", item: item(4, { media: [] }) },
              ],
            },
          ],
        },
      ],
    });

  it("draws no exercise images, only the logo", async () => {
    const { doc, t } = await build(supersetRoutine());
    expect(elementsOf(ExportPdf({ doc, t, logo: null }), Image)).toHaveLength(0);
    expect(elementsOf(ExportPdf({ doc, t, logo: "data:image/png;base64,AA" }), Image)).toHaveLength(
      1,
    );
  });

  it("links each exercise that has a video, and no other", async () => {
    const { doc, t } = await build(supersetRoutine());
    const links = elementsOf(ExportPdf({ doc, t, logo: null }), Link).map((link) => link.src);
    for (const id of ["video000001", "video000002", "video000003"]) {
      expect(links).toContain(youtubeWatchUrl(id, false));
    }
    expect(links.filter((src) => String(src).includes("youtube"))).toHaveLength(3);
    expect(
      textOf(ExportPdf({ doc, t, logo: null })).filter((s) => s === "Watch video"),
    ).toHaveLength(3);
  });

  it("links the clinic email, website and the share URL", async () => {
    const { doc, t } = await build(
      source({
        branding: {
          clinicName: "Kine Sur",
          logoUrl: null,
          accentColor: null,
          contact: {
            email: "hola@kinesur.com",
            phone: "+5491122334455",
            whatsappUrl: null,
            website: "https://kinesur.com/",
          },
        },
      }),
    );
    const links = elementsOf(ExportPdf({ doc, t, logo: null }), Link).map((link) => link.src);
    expect(links).toEqual(
      expect.arrayContaining([
        "mailto:hola@kinesur.com",
        "https://kinesur.com/",
        "https://physio.example/kinesur/knee-rehab-abc123",
      ]),
    );
    // The phone is printed, not linked.
    expect(links.some((src) => String(src).includes("5491122334455"))).toBe(false);
  });

  it("numbers single exercises through the routine and keeps superset labels", async () => {
    const { doc, t } = await build(supersetRoutine());
    const texts = textOf(ExportPdf({ doc, t, logo: null }));
    const labels = texts.filter((s) => /^(\d+|[A-Z]\d)$/.test(s));
    expect(labels).toEqual(["1", "A1", "A2", "2"]);
  });

  it("restarts numbering for each routine", async () => {
    const { doc, t } = await build(
      source({
        kind: "customer",
        title: null,
        routines: [
          routine("R", [
            { kind: "single", item: item(1) },
            { kind: "single", item: item(2) },
          ]),
          routine("S", [{ kind: "single", item: item(3) }]),
        ],
      }),
    );
    const labels = textOf(ExportPdf({ doc, t, logo: null })).filter((s) => /^\d+$/.test(s));
    expect(labels).toEqual(["1", "2", "1"]);
  });

  it("has no paper tracking boxes or hint", async () => {
    const { doc, t } = await build(supersetRoutine());
    const texts = textOf(ExportPdf({ doc, t, logo: null }));
    expect(texts.join(" ")).not.toMatch(/tick/i);
    // No narrow weekday initials row (M T W T F S S).
    expect(texts.filter((s) => s === "M")).toHaveLength(0);
  });

  it("uses the clinic accent, made readable for print, for section headings", async () => {
    const { doc, t } = await build({
      ...supersetRoutine(),
      branding: { ...source().branding, accentColor: "#3b82f6" },
    });
    const heading = styleOf(ExportPdf({ doc, t, logo: null }), "Warm-up");
    expect(heading?.color).toBe(printAccent("#3b82f6"));
  });

  it("falls back to the neutral text colour without an accent", async () => {
    const { doc, t } = await build(supersetRoutine());
    expect(styleOf(ExportPdf({ doc, t, logo: null }), "Warm-up")?.color).toBe("#171717");
  });

  it("repeats the title and customer at the top of every page but the first", async () => {
    const { doc, t } = await build(supersetRoutine());
    const tree = ExportPdf({ doc, t, logo: null });
    const first = fixedTexts(tree, 1).join(" ");
    const second = fixedTexts(tree, 2).join(" ");
    expect(first).not.toContain("Knee rehab");
    expect(second).toContain("Knee rehab");
    expect(second).toContain("For Ana");
  });
});
