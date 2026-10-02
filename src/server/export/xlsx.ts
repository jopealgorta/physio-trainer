import ExcelJS from "exceljs";

import { CALENDAR_DATE_FORMAT, calendarDateToDate } from "@/lib/calendar-date";
import { weekdayName } from "@/lib/plans";
import type { PrescriptionTranslate } from "@/lib/prescription";

import type { ExportDocument, ExportItem, ExportRoutine } from "./model";
import type { ExportTranslate } from "./translate";

const MAX_SHEET_NAME = 31;
const FALLBACK_NAME = "Sheet";
const COLUMN_WIDTHS = [8, 32, 6, 14, 8, 12, 8, 14, 12, 30, 60, 44];
const HEADER_ROW = 6;

function sanitize(name: string): string {
  return name
    .replace(/[[\]:*?/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^'+|'+$/g, "")
    .trim();
}

/**
 * Valid Excel sheet names (at most 31 characters, no `[]:*?/\`, not blank, no edge quotes),
 * unique case-insensitively: later duplicates become "Name (2)", "Name (3)".
 */
export function sheetNames(names: string[], reserved: string[] = []): string[] {
  const used = new Set(reserved.map((name) => name.toLowerCase()));
  return names.map((raw) => {
    const base = sanitize(raw) || FALLBACK_NAME;
    for (let n = 1; ; n++) {
      const suffix = n === 1 ? "" : ` (${n})`;
      const stem = sanitize(base.slice(0, MAX_SHEET_NAME - suffix.length)) || FALLBACK_NAME;
      const candidate = `${stem}${suffix}`;
      if (!used.has(candidate.toLowerCase())) {
        used.add(candidate.toLowerCase());
        return candidate;
      }
    }
  });
}

/** A numeric string becomes a number cell; a range or a per-set list stays text. */
function numberOrText(value: string | number | null): string | number | null {
  if (value === null) return null;
  if (typeof value === "number") return value;
  return /^\d+$/.test(value) ? Number(value) : value;
}

function headerBlock(
  sheet: ExcelJS.Worksheet,
  doc: ExportDocument,
  t: ExportTranslate,
  date: string,
) {
  sheet.addRow([t("xlsx.clinic"), doc.branding.clinicName]);
  sheet.addRow([t("xlsx.customer"), doc.customer.firstName]);
  sheet.addRow([t("xlsx.generated"), date]);
  for (let row = 1; row <= 3; row++) sheet.getCell(row, 1).font = { bold: true };
}

function overviewSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  doc: ExportDocument,
  t: ExportTranslate,
  date: string,
) {
  const sheet = workbook.addWorksheet(name);
  headerBlock(sheet, doc, t, date);
  const standalone = doc.routines.filter((routine) => routine.weekdays.length === 0);
  for (const plan of doc.plans) {
    sheet.addRow([]);
    sheet.addRow([plan.name]).font = { bold: true };
    sheet.addRow([t("xlsx.day"), t("xlsx.routines")]).font = { bold: true };
    for (const day of plan.week) {
      sheet.addRow([
        weekdayName(doc.locale, day.weekday as 1),
        day.entries
          .map((entry) =>
            entry.label ? `${entry.label}: ${entry.routineName}` : entry.routineName,
          )
          .join("; "),
      ]);
    }
  }
  if (standalone.length > 0) {
    sheet.addRow([]);
    sheet.addRow([t("xlsx.standalone")]).font = { bold: true };
    for (const routine of standalone) sheet.addRow([routine.name]);
  }
  sheet.getColumn(1).width = 20;
  sheet.getColumn(2).width = 60;
}

function itemRow(item: ExportItem, summary: PrescriptionTranslate): ExcelJS.CellValue[] {
  return [
    item.label ?? "",
    item.name,
    item.columns.count,
    numberOrText(item.columns.reps),
    item.holdSeconds,
    numberOrText(item.columns.duration),
    item.restSeconds,
    item.columns.load,
    item.side ? summary(`sides.${item.side}`) : null,
    item.notes,
    item.instructions,
    item.videoUrl ? { text: item.videoUrl, hyperlink: item.videoUrl } : null,
  ];
}

function routineSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  routine: ExportRoutine | null,
  doc: ExportDocument,
  t: ExportTranslate,
  summary: PrescriptionTranslate,
  date: string,
) {
  const sheet = workbook.addWorksheet(name);
  headerBlock(sheet, doc, t, date);
  sheet.addRow([routine?.name ?? ""]).font = { bold: true };
  sheet.addRow([]);
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
  const header = sheet.addRow(keys.map((key) => t(`xlsx.columns.${key}`)));
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.border = { bottom: { style: "thin" } };
  });
  sheet.views = [{ state: "frozen", ySplit: HEADER_ROW }];
  COLUMN_WIDTHS.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  for (const block of routine?.blocks ?? []) {
    for (const item of block.kind === "single" ? [block.item] : block.items) {
      const row = sheet.addRow(itemRow(item, summary));
      row.getCell(11).alignment = { wrapText: true, vertical: "top" };
    }
  }
}

export async function renderExportXlsx(
  doc: ExportDocument,
  t: ExportTranslate,
  summary: PrescriptionTranslate,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = doc.branding.clinicName;
  const date = new Intl.DateTimeFormat(doc.locale, CALENDAR_DATE_FORMAT).format(
    calendarDateToDate(doc.generatedOn),
  );
  const overviewName = sheetNames([t("xlsx.overview")])[0];

  if (doc.routines.length === 0 && doc.plans.length === 0) {
    // Nothing to list: a single sheet with the headers keeps the file valid and self-explanatory.
    routineSheet(workbook, overviewName, null, doc, t, summary, date);
  } else {
    if (doc.plans.length > 0 || doc.routines.length > 1) {
      overviewSheet(workbook, overviewName, doc, t, date);
    }
    const names = sheetNames(
      doc.routines.map((routine) => routine.name),
      [overviewName],
    );
    doc.routines.forEach((routine, index) => {
      routineSheet(workbook, names[index], routine, doc, t, summary, date);
    });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
