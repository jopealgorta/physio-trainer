import { describe, expect, it } from "vitest";

import { formatPrescription, type PrescriptionTranslate } from "@/lib/prescription";
import type { ContentItem } from "@/server/routines/content";

import {
  buildExportDocument,
  contentDisposition,
  exportFilename,
  setColumns,
  type ExportSource,
  type SourceRoutine,
} from "./model";

const t: PrescriptionTranslate = (k, v) => k + JSON.stringify(v ?? {});
const S = {
  reps: null,
  repsMax: null,
  durationSeconds: null,
  load: null,
  distanceMeters: null,
  intensity: null,
};

function item(id: string, over: Partial<ContentItem> = {}): ContentItem {
  return {
    id,
    exerciseId: `e-${id}`,
    kind: "strength",
    name: `Ex ${id}`,
    instructions: null,
    holdSeconds: null,
    restSeconds: null,
    side: null,
    notes: null,
    sets: [{ ...S, reps: 10 }],
    media: [],
    ...over,
  };
}
function routine(id: string, blocks: SourceRoutine["blocks"] = []): SourceRoutine {
  return {
    id,
    name: `R ${id}`,
    notes: null,
    sessionsPerWeek: null,
    sessionsPerDay: null,
    blocks,
    phase: null,
  };
}
const single = (i: ContentItem) => ({ kind: "single" as const, item: i });
const grp = (key: string, items: ContentItem[]) => ({
  kind: "group" as const,
  key,
  restSeconds: 30,
  items,
});

function source(over: Partial<ExportSource> = {}): ExportSource {
  return {
    kind: "customer",
    customer: { id: "c", firstName: "Ana", locale: "es" },
    title: null,
    plans: [],
    routines: [],
    planRoutines: [],
    locale: "es",
    generatedOn: "2026-10-02",
    branding: { clinicName: "Clinic", logoUrl: null, contact: null },
    shareUrl: null,
    tracking: false,
    ...over,
  };
}

describe("setColumns", () => {
  it("collapses equal values", () => {
    expect(setColumns([1, 2, 3].map(() => ({ ...S, reps: 12 })))).toEqual({
      count: 3,
      reps: "12",
      duration: null,
      load: null,
      distance: null,
      intensity: null,
    });
  });
  it("joins differing values", () => {
    expect(setColumns([12, 10, 8].map((reps) => ({ ...S, reps }))).reps).toBe("12 / 10 / 8");
  });
  it("uses an en dash range", () => {
    expect(setColumns([{ ...S, reps: 8, repsMax: 12 }]).reps).toBe("8–12");
  });
  it("uses a dash for missing values and shows durations", () => {
    const c = setColumns([
      { ...S, load: "5 kg", durationSeconds: 30 },
      { ...S, durationSeconds: 30 },
    ]);
    expect(c.load).toBe("5 kg / –");
    expect(c.duration).toBe("30");
  });
  it("handles no sets", () => {
    expect(setColumns([])).toEqual({
      count: 0,
      reps: null,
      duration: null,
      load: null,
      distance: null,
      intensity: null,
    });
  });
  it("formats distance with the locale and lists intensity per set", () => {
    const c = setColumns(
      [
        { ...S, distanceMeters: 2500, intensity: "Zone 2" },
        { ...S, distanceMeters: 800, intensity: "Zone 2" },
      ],
      "es",
    );
    expect(c.distance).toBe("2,5 km / 800 m");
    expect(c.intensity).toBe("Zone 2");
    expect(setColumns([{ ...S, distanceMeters: 5000 }], "en").distance).toBe("5 km");
  });
});

describe("buildExportDocument", () => {
  const plan = {
    id: "p",
    name: "Plan",
    notes: null,
    phase: null,
    days: [{ weekday: 3, notes: "Easy day" }],
    entries: [
      { weekday: 1, label: "AM", routineId: "R" },
      { weekday: 1, label: null, routineId: "S" },
      { weekday: 3, label: null, routineId: "R" },
      { weekday: 5, label: null, routineId: "missing" },
    ],
  };
  it("orders routines and computes weekdays", () => {
    const doc = buildExportDocument(
      source({
        plans: [plan],
        routines: [routine("T")],
        planRoutines: [routine("S"), routine("R")],
      }),
      t,
    );
    expect(doc.routines.map((r) => r.id)).toEqual(["R", "S", "T"]);
    expect(doc.routines.map((r) => r.weekdays)).toEqual([[1, 3], [1], []]);
    const week = doc.plans[0].week;
    expect(week).toHaveLength(7);
    expect(week[0].entries).toEqual([
      { label: "AM", routineName: "R R" },
      { label: null, routineName: "R S" },
    ]);
    expect(week[4].entries).toEqual([]);
    expect(week.map((day) => day.notes)).toEqual([null, null, "Easy day", null, null, null, null]);
  });
  it("labels supersets", () => {
    const doc = buildExportDocument(
      source({
        routines: [
          routine("R", [
            grp("g1", [item("a"), item("b")]),
            single(item("c")),
            grp("g2", [item("d"), item("e")]),
          ]),
        ],
      }),
      t,
    );
    const blocks = doc.routines[0].blocks;
    expect(blocks[0]).toMatchObject({ kind: "group", label: "A" });
    if (blocks[0].kind === "group") {
      expect(blocks[0].items.map((i) => i.label)).toEqual(["A1", "A2"]);
    }
    expect(blocks[1]).toMatchObject({ kind: "single", item: { label: null } });
    expect(blocks[2]).toMatchObject({ kind: "group", label: "B" });
  });
  it("builds summary, columns and video url", () => {
    const i = item("a", { holdSeconds: 5, media: [{ videoId: "abc", isShort: false }] });
    const doc = buildExportDocument(source({ routines: [routine("R", [single(i)])] }), t);
    const out = doc.routines[0].blocks[0];
    if (out.kind !== "single") throw new Error("expected single");
    expect(out.item.summary).toBe(formatPrescription(i, t));
    expect(out.item.videoId).toBe("abc");
    expect(out.item.videoUrl).toBe("https://www.youtube.com/watch?v=abc");
    expect(out.item.columns.reps).toBe("10");
  });
  it("has null video without media", () => {
    const doc = buildExportDocument(source({ routines: [routine("R", [single(item("a"))])] }), t);
    const out = doc.routines[0].blocks[0];
    if (out.kind !== "single") throw new Error("expected single");
    expect(out.item.videoUrl).toBeNull();
    expect(out.item.videoId).toBeNull();
  });
  it("computes isEmpty", () => {
    expect(buildExportDocument(source({ routines: [routine("R")] }), t).isEmpty).toBe(true);
    expect(
      buildExportDocument(source({ routines: [routine("R", [single(item("a"))])] }), t).isEmpty,
    ).toBe(false);
    expect(
      buildExportDocument(source({ plans: [plan], planRoutines: [routine("R")] }), t).isEmpty,
    ).toBe(false);
  });
});

describe("filenames", () => {
  it("builds ascii and utf8 names", () => {
    expect(exportFilename("Rodilla – fase 2 ñ", "2026-10-02", "pdf")).toEqual({
      ascii: "rodilla-fase-2-n-2026-10-02.pdf",
      utf8: "Rodilla – fase 2 ñ-2026-10-02.pdf",
    });
  });
  it("falls back for emoji-only names", () => {
    expect(exportFilename("🦵", "2026-10-02", "xlsx").ascii).toMatch(
      /^[a-z0-9-]+-2026-10-02\.xlsx$/,
    );
  });
  it("builds content disposition", () => {
    expect(contentDisposition("Rodilla ñ", "2026-10-02", "pdf")).toBe(
      `attachment; filename="rodilla-n-2026-10-02.pdf"; filename*=UTF-8''${encodeURIComponent("Rodilla ñ-2026-10-02.pdf")}`,
    );
  });
  it("percent-encodes the characters RFC 5987 does not allow raw", () => {
    const header = contentDisposition("Rodilla's (fase 2)*", "2026-10-02", "pdf");
    expect(header).toBe(
      `attachment; filename="rodilla-s-fase-2-2026-10-02.pdf"; filename*=UTF-8''Rodilla%27s%20%28fase%202%29%2A-2026-10-02.pdf`,
    );
    expect(header.split("filename*=UTF-8''")[1]).toMatch(/^[A-Za-z0-9!#$&+.^_`|~%-]+$/);
  });
});
