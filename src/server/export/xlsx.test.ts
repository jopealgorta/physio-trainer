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
    exerciseId: `e-${id}`,
    kind: "strength",
    name: `Exercise ${id}`,
    instructions: "Keep your back straight.",
    holdSeconds: 5,
    restSeconds: 60,
    side: "both",
    notes: null,
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
      {
        reps: 8,
        repsMax: null,
        durationSeconds: null,
        load: null,
        distanceMeters: null,
        intensity: null,
      },
    ],
    media: [{ videoId: "abcdefghijk", isShort: false }],
    ...over,
  };
}

function routine(
  id: string,
  name: string,
  blocks: SourceRoutine["blocks"],
  over: Partial<SourceRoutine> = {},
): SourceRoutine {
  return {
    id,
    name,
    notes: null,
    sessionsPerWeek: null,
    sessionsPerDay: null,
    blocks,
    phase: null,
    ...over,
  };
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
      ["Knee/hip [A]", "knee/hip [a]", "x".repeat(40), "", "Overview", "[]"],
      "Routine",
      ["Overview"],
    );
    expect(names).toEqual([
      "Knee hip A",
      "knee hip a (2)",
      "x".repeat(31),
      "Routine",
      "Overview (2)",
      "Routine (2)",
    ]);
  });

  it("keeps the suffix when truncating", () => {
    const [a, b] = sheetNames(["y".repeat(40), "y".repeat(40)], "Routine");
    expect(a).toBe("y".repeat(31));
    expect(b).toBe(`${"y".repeat(27)} (2)`);
  });
});

describe("renderExportXlsx", () => {
  it("writes the distance and intensity cells of an aerobic item", async () => {
    const aerobic = item("1", {
      kind: "aerobic",
      holdSeconds: null,
      sets: [
        {
          reps: null,
          repsMax: null,
          durationSeconds: 1800,
          load: null,
          distanceMeters: 5000,
          intensity: "Zona 2",
        },
      ],
    });
    const { workbook } = await load(
      source({
        kind: "routine",
        routines: [routine("R", "Solo", [{ kind: "single", item: aerobic }])],
      }),
    );
    const row = workbook.worksheets[0].getRow(7);
    expect(row.getCell(9).value).toBe("5 km");
    expect(row.getCell(10).value).toBe("Zona 2");
    expect(row.getCell(13).alignment).toMatchObject({ wrapText: true });
  });

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
            days: [{ weekday: 3, notes: "Día suave" }],
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
    expect(overview.getCell("C6").value).toBe(t("xlsx.notes"));
    expect(overview.getCell("C7").value).toBeNull();
    expect(overview.getCell("C9").value).toBe("Día suave");

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
      "distance",
      "intensity",
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
    expect(first.getCell(9).value).toBeNull();
    expect(first.getCell(10).value).toBeNull();
    expect(first.getCell(13).alignment).toMatchObject({ wrapText: true });
    const link = first.getCell(14).value as { text: string; hyperlink: string };
    expect(link.hyperlink).toContain("abcdefghijk");
    expect(sheet.getRow(9).getCell(14).value).toBeNull();
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

  it("names a sheet from the messages when the routine name has no valid characters", async () => {
    const { workbook, t } = await load(
      source({
        kind: "routine",
        routines: [routine("R", "[]", [{ kind: "single", item: item("1") }])],
      }),
    );
    expect(workbook.worksheets.map((s) => s.name)).toEqual([t("xlsx.sheetFallback")]);
    expect(t("xlsx.sheetFallback")).toBe("Rutina");
  });

  it("puts the frequency next to the routine name and the notes under it", async () => {
    const { workbook, t } = await load(
      source({
        kind: "routine",
        routines: [
          routine("R", "Solo", [{ kind: "single", item: item("1") }], {
            notes: "Hacelo despacio.",
            sessionsPerWeek: 3,
            sessionsPerDay: 2,
          }),
        ],
      }),
    );
    const sheet = workbook.worksheets[0];
    expect(sheet.getCell("A4").value).toBe(
      `Solo · ${t("pdf.sessions", { perWeek: 3 })} · ${t("pdf.sessionsPerDay", { perDay: 2 })}`,
    );
    expect(sheet.getCell("A5").value).toBe("Hacelo despacio.");
    expect(sheet.getRow(6).getCell(2).value).toBe(t("xlsx.columns.exercise"));
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 6 });
    expect(sheet.getRow(7).getCell(2).value).toBe("Exercise 1");
  });

  it("keeps the routine name alone when there is no frequency or notes", async () => {
    const { workbook } = await load(
      source({
        kind: "routine",
        routines: [routine("R", "Solo", [{ kind: "single", item: item("1") }])],
      }),
    );
    const sheet = workbook.worksheets[0];
    expect(sheet.getCell("A4").value).toBe("Solo");
    expect(sheet.getCell("A5").value).toBeNull();
  });

  it("lists plan notes under the plan name on the overview", async () => {
    const { workbook, t } = await load(
      source({
        plans: [
          {
            id: "p",
            name: "Plan",
            notes: "Caminá los días libres.",
            phase: null,
            days: [],
            entries: [{ weekday: 1, label: null, routineId: "R" }],
          },
        ],
        planRoutines: [routine("R", "Solo", [{ kind: "single", item: item("1") }])],
      }),
    );
    const overview = workbook.worksheets[0];
    expect(overview.getCell("A5").value).toBe("Plan");
    expect(overview.getCell("A6").value).toBe("Caminá los días libres.");
    expect(overview.getCell("A7").value).toBe(t("xlsx.day"));
    expect(overview.getCell("B8").value).toBe("Solo");
  });
});
