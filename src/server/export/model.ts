import type { Locale } from "@/i18n/config";
import type { BrandingContact } from "@/lib/branding";
import {
  formatPrescription,
  type PrescriptionSide,
  type PrescriptionTranslate,
  type SetPrescription,
} from "@/lib/prescription";
import { distanceDisplay } from "@/lib/distance";
import { shareSlug } from "@/lib/share-links";
import { visibleSections } from "@/lib/routine-sections";
import { youtubeWatchUrl } from "@/lib/youtube";
import type { ContentItem, RoutineContent } from "@/server/routines/content";

export type ExportFormat = "pdf" | "xlsx";
export type ExportKind = "routine" | "plan" | "customer";
export type ExportPhase = { label: string | null; startsOn: string | null; endsOn: string | null };

export type SourceRoutine = RoutineContent & { phase: ExportPhase | null };
export type SourcePlan = {
  id: string;
  name: string;
  notes: string | null;
  phase: ExportPhase | null;
  /** The plan's day notes (a weekday without a note has no row). */
  days: { weekday: number; notes: string }[];
  entries: { weekday: number; label: string | null; routineId: string }[]; // ordered by weekday, position
};
/** What a loader returns (physio or patient side). */
export type ExportSourceData = {
  customer: { id: string; firstName: string; locale: string };
  /** Routine/plan name; null for "everything active" (the PDF then uses Export.pdf.allTitle). */
  title: string | null;
  plans: SourcePlan[];
  /** Standalone routines (customer export / routine export), in display order. */
  routines: SourceRoutine[];
  /** Content of routines referenced by plan entries but not in `routines`. */
  planRoutines: SourceRoutine[];
};
export type ExportSource = ExportSourceData & {
  kind: ExportKind;
  locale: Locale; // resolved customer locale
  generatedOn: string; // YYYY-MM-DD, physio's today
  branding: { clinicName: string; logoUrl: string | null; contact: BrandingContact | null };
  shareUrl: string | null;
  tracking: boolean;
};

export type SetColumns = {
  count: number;
  reps: string | null;
  duration: string | null;
  load: string | null;
  distance: string | null;
  intensity: string | null;
};
export type ExportItem = {
  id: string;
  name: string;
  /** "A1", "A2" inside a superset; null for a single exercise. */
  label: string | null;
  summary: string; // formatPrescription
  columns: SetColumns;
  holdSeconds: number | null;
  restSeconds: number | null;
  side: PrescriptionSide | null;
  notes: string | null;
  instructions: string | null;
  videoId: string | null;
  videoUrl: string | null;
};
export type ExportBlock =
  | { kind: "single"; item: ExportItem }
  | { kind: "group"; label: string; restSeconds: number | null; items: ExportItem[] };
export type ExportRoutine = {
  id: string;
  name: string;
  notes: string | null;
  phase: ExportPhase | null;
  sessionsPerWeek: number | null;
  sessionsPerDay: number | null;
  /** ISO weekdays the routine is scheduled on in the exported plans; [] = any day. */
  weekdays: number[];
  /** Non-empty sections in order; the implicit section has name "". */
  sections: { name: string; blocks: ExportBlock[] }[];
  /** True with two or more non-empty sections: only then are section headings shown. */
  sectionHeadings: boolean;
};
export type ExportWeekDay = {
  weekday: number;
  notes: string | null;
  entries: { label: string | null; routineName: string }[];
};
export type ExportPlan = {
  id: string;
  name: string;
  notes: string | null;
  phase: ExportPhase | null;
  week: ExportWeekDay[]; /* always 7, Mon..Sun */
};
export type ExportDocument = Omit<ExportSource, "plans" | "routines" | "planRoutines"> & {
  plans: ExportPlan[];
  /** Every routine once: plan routines first (first appearance order), then standalone ones. */
  routines: ExportRoutine[];
  isEmpty: boolean;
};

export const EXPORT_CONTENT_TYPES: Record<ExportFormat, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function column(values: (string | null)[]): string | null {
  if (values.every((value) => value === null)) return null;
  if (values.every((value) => value === values[0])) return values[0];
  return values.map((value) => value ?? "–").join(" / ");
}

export function setColumns(sets: SetPrescription[], locale: string = "en"): SetColumns {
  const numbers = new Intl.NumberFormat(locale);
  return {
    count: sets.length,
    reps: column(
      sets.map((set) =>
        set.reps === null
          ? null
          : set.repsMax !== null
            ? `${set.reps}–${set.repsMax}`
            : `${set.reps}`,
      ),
    ),
    duration: column(
      sets.map((set) => (set.durationSeconds === null ? null : `${set.durationSeconds}`)),
    ),
    load: column(sets.map((set) => set.load)),
    distance: column(
      sets.map((set) => {
        if (set.distanceMeters === null) return null;
        const { unit, value } = distanceDisplay(set.distanceMeters);
        return `${numbers.format(value)} ${unit}`;
      }),
    ),
    intensity: column(sets.map((set) => set.intensity)),
  };
}

function exportItem(
  item: ContentItem,
  label: string | null,
  summary: PrescriptionTranslate,
  locale: string,
) {
  const media = item.media[0] ?? null;
  return {
    id: item.id,
    name: item.name,
    label,
    summary: formatPrescription(item, summary),
    columns: setColumns(item.sets, locale),
    holdSeconds: item.holdSeconds,
    restSeconds: item.restSeconds,
    side: item.side,
    notes: item.notes,
    instructions: item.instructions,
    videoId: media ? media.videoId : null,
    videoUrl: media ? youtubeWatchUrl(media.videoId, media.isShort) : null,
  } satisfies ExportItem;
}

function exportRoutine(
  routine: SourceRoutine,
  weekdays: number[],
  summary: PrescriptionTranslate,
  locale: string,
): ExportRoutine {
  let groupIndex = 0;
  const { sections: visible, headings } = visibleSections(routine.sections);
  const sections = visible.map((section) => ({
    name: section.name,
    blocks: section.blocks.map((block): ExportBlock => {
      if (block.kind === "single") {
        return { kind: "single", item: exportItem(block.item, null, summary, locale) };
      }
      const letter = String.fromCharCode(65 + groupIndex++);
      return {
        kind: "group",
        label: letter,
        restSeconds: block.restSeconds,
        items: block.items.map((item, index) =>
          exportItem(item, `${letter}${index + 1}`, summary, locale),
        ),
      };
    }),
  }));
  return {
    id: routine.id,
    name: routine.name,
    notes: routine.notes,
    phase: routine.phase,
    sessionsPerWeek: routine.sessionsPerWeek,
    sessionsPerDay: routine.sessionsPerDay,
    weekdays,
    sections,
    sectionHeadings: headings,
  };
}

export function buildExportDocument(
  source: ExportSource,
  summary: PrescriptionTranslate,
): ExportDocument {
  const { plans, routines, planRoutines, ...rest } = source;
  const byId = new Map<string, SourceRoutine>();
  for (const routine of [...routines, ...planRoutines]) {
    if (!byId.has(routine.id)) byId.set(routine.id, routine);
  }

  const weekdaysById = new Map<string, Set<number>>();
  const order: string[] = [];
  const exportPlans = plans.map((plan): ExportPlan => {
    const week: ExportWeekDay[] = Array.from({ length: 7 }, (_, index) => ({
      weekday: index + 1,
      notes: plan.days.find((day) => day.weekday === index + 1)?.notes ?? null,
      entries: [],
    }));
    for (const entry of plan.entries) {
      const routine = byId.get(entry.routineId);
      const day = week[entry.weekday - 1];
      if (!routine || !day) continue;
      day.entries.push({ label: entry.label, routineName: routine.name });
      if (!weekdaysById.has(routine.id)) {
        weekdaysById.set(routine.id, new Set());
        order.push(routine.id);
      }
      weekdaysById.get(routine.id)?.add(entry.weekday);
    }
    return { id: plan.id, name: plan.name, notes: plan.notes, phase: plan.phase, week };
  });
  for (const routine of routines) {
    if (!weekdaysById.has(routine.id) && !order.includes(routine.id)) order.push(routine.id);
  }

  const exportRoutines = order.flatMap((id) => {
    const routine = byId.get(id);
    if (!routine) return [];
    const weekdays = [...(weekdaysById.get(id) ?? [])].sort((a, b) => a - b);
    return [exportRoutine(routine, weekdays, summary, source.locale)];
  });

  const hasItems = exportRoutines.some((routine) => routine.sections.length > 0);
  const hasEntries = exportPlans.some((plan) => plan.week.some((day) => day.entries.length > 0));
  return {
    ...rest,
    plans: exportPlans,
    routines: exportRoutines,
    isEmpty: !hasItems && !hasEntries,
  };
}

export function exportFilename(
  name: string,
  generatedOn: string,
  format: ExportFormat,
): { ascii: string; utf8: string } {
  return {
    ascii: `${shareSlug(name)}-${generatedOn}.${format}`,
    utf8: `${name}-${generatedOn}.${format}`,
  };
}

/** RFC 5987 `ext-value` encoding: encodeURIComponent leaves `'()*` raw, which the grammar forbids. */
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

export function contentDisposition(
  name: string,
  generatedOn: string,
  format: ExportFormat,
): string {
  const { ascii, utf8 } = exportFilename(name, generatedOn, format);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeRfc5987(utf8)}`;
}
