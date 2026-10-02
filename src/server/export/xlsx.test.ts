// @vitest-environment node
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import type { Locale } from "@/i18n/config";
import type { ContentItem } from "@/server/routines/content";

import { buildExportDocument, type ExportSource, type SourceRoutine } from "./model";
import { exportTranslators } from "./translate";
import { renderExportXlsx, sheetNames } from "./xlsx";

function item(id: string, over: Partial<ContentItem> = {}): ContentItem {
  return {
    id,
    name: `Exercise ${id}`,
    instructions: "Keep your back straight.",
    holdSeconds: 5,
    restSeconds: 60,
    side: "both",
    notes: null,
    sets: [
      { reps: 12, repsMax: null, durationSeconds: null, load: null },
      { reps: 10, repsMax: null, durationSeconds: null, load: "5 kg" },
      { reps: 8, repsMax: null, durationSeconds: null, load: null },
    ],
    media: [{ videoId: "abcdefghijk", isShort: false }],
    ...over,
  };
}

function routine(id: string, name: string, blocks: SourceRoutine["blocks"]): SourceRoutine {
  return { id, name, notes: null, sessionsPerWeek: 3, sessionsPerDay: null, blocks, phase: null };
}

function source(over: Partial<ExportSource> = {}): ExportSource {
  return {
    kind: "plan",
    customer: { id: "c", firstName: "Ñandú", locale: "es" },
    title: "Rodilla",
    plans: [],
    routines: [],
    planRoutines: [],
    locale: "es",
    generatedOn: "2026-10-02",
    branding: { clinicName: "Kine Sur", logoUrl: null, contact: null },
    shareUrl: null,
    tracking: false,
    ...over,
  };
}

async function load(src: ExportSource) {
  const { t, summary } = await exportTranslators(src.locale as Locale);
  const doc = buildExportDocument(src, summary);
  const buffer = await renderExportXlsx(doc, t, summary);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return { workbook, t };
}

describe("sheetNames", () => {
  it("makes names valid and unique", () => {
    const names = sheetNames(
      ["Knee/hip [A]", "knee/hip [a]", "x".repeat(40), "", "Overview"],
      ["Overview"],
    );
    expect(names.slice(0, 3)).toEqual(["Knee hip A", "knee hip a (2)", "x".repeat(31)]);
    expect(names[3].length).toBeGreaterThan(0);
    expect(names[4]).toBe("Overview (2)");
  });

  it("keeps the suffix when truncating", () => {
    const [a, b] = sheetNames(["y".repeat(40), "y".repeat(40)]);
    expect(a).toBe("y".repeat(31));
    expect(b).toBe(`${"y".repeat(27)} (2)`);
  });
});

describe("renderExportXlsx", () => {
  it("round-trips a plan with duplicate routine names and a superset", async () => {
    const name = "Rodilla – fase 2 ñ";
    const { workbook, t } = await load(
      source({
        plans: [
          {
            id: "p",
            name,
            notes: null,
            phase: null,
            entries: [
              { weekday: 1, label: "Mañana", routineId: "R" },
              { weekday: 3, label: null, routineId: "S" },
            ],
          },
        ],
        planRoutines: [
          routine("R", name, [
            { kind: "group", key: "g", restSeconds: 45, items: [item("1"), item("2")] },
            { kind: "single", item: item("3", { holdSeconds: null, media: [] }) },
          ]),
          routine("S", name, [{ kind: "single", item: item("4") }]),
        ],
      }),
    );
    expect(workbook.worksheets.map((s) => s.name)).toEqual([
      t("xlsx.overview"),
      name,
      `${name} (2)`,
    ]);
    const overview = workbook.worksheets[0];
    expect(overview.getCell("A1").value).toBe(t("xlsx.clinic"));
    expect(overview.getCell("B1").value).toBe("Kine Sur");
    expect(overview.getCell("B2").value).toBe("Ñandú");
    expect(overview.getCell("A5").value).toBe(name);
    expect(overview.getCell("B7").value).toBe(`Mañana: ${name}`);

    const sheet = workbook.worksheets[1];
    expect(sheet.getCell("A1").value).toBe(t("xlsx.clinic"));
    expect(sheet.getCell("A2").value).toBe(t("xlsx.customer"));
    expect(sheet.getCell("A4").value).toBe(name);
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 6 });
    const keys = [
      "group",
      "exercise",
      "sets",
      "reps",
      "hold",
      "duration",
      "rest",
      "load",
      "side",
      "notes",
      "instructions",
      "video",
    ] as const;
    expect((sheet.getRow(6).values as unknown[]).slice(1)).toEqual(
      keys.map((k) => t(`xlsx.columns.${k}`)),
    );
    const first = sheet.getRow(7);
    expect(first.getCell(1).value).toBe("A1");
    expect(first.getCell(3).value).toBe(3);
    expect(first.getCell(4).value).toBe("12 / 10 / 8");
    expect(first.getCell(5).value).toBe(5);
    expect(first.getCell(7).value).toBe(60);
    expect(first.getCell(8).value).toBe("– / 5 kg / –");
    const link = first.getCell(12).value as { text: string; hyperlink: string };
    expect(link.hyperlink).toContain("abcdefghijk");
    expect(sheet.getRow(9).getCell(12).value).toBeNull();
  });

  it("renders an empty document without throwing", async () => {
    const { workbook, t } = await load(source({ kind: "customer", title: null }));
    expect(workbook.worksheets.length).toBeGreaterThan(0);
    const headers = workbook.worksheets[0].getRow(6).values as unknown[];
    expect(headers.slice(1)[1]).toBe(t("xlsx.columns.exercise"));
  });

  it("skips the overview for a single standalone routine", async () => {
    const { workbook } = await load(
      source({
        kind: "routine",
        routines: [routine("R", "Solo", [{ kind: "single", item: item("1") }])],
      }),
    );
    expect(workbook.worksheets.map((s) => s.name)).toEqual(["Solo"]);
  });
});
