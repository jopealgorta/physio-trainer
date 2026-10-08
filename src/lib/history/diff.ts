import type { PlanSnapshot, RoutineSnapshot, SnapshotSet } from "./snapshot";

export type SetField =
  "reps" | "repsMax" | "durationSeconds" | "load" | "distanceMeters" | "intensity";
export type ItemField =
  "holdSeconds" | "restSeconds" | "side" | "notes" | "group" | "section" | "sets";
export type FieldChange<F extends string> = { field: F; from: unknown; to: unknown };

export type SetDiff =
  | { index: number; kind: "added" | "removed"; set: SnapshotSet }
  | { index: number; kind: "changed"; changes: FieldChange<SetField>[] };

type SnapshotItem = RoutineSnapshot["items"][number];

export type ItemDiff = {
  status: "added" | "removed" | "changed" | "unchanged";
  moved: boolean;
  before: SnapshotItem | null;
  after: SnapshotItem | null;
  /** "sets" = set count; "group" = superset membership/rest. */
  changes: FieldChange<ItemField>[];
  /** Per set index (0-based; the UI shows index + 1). */
  sets: SetDiff[];
};

/** "sections" = the ordered list of section names (only when both snapshots have sections). */
export type RoutineHeaderField = keyof RoutineSnapshot["routine"] | "sections";
export type RoutineDiff = { header: FieldChange<RoutineHeaderField>[]; items: ItemDiff[] };

export type EntryDiff = {
  status: "added" | "removed" | "changed" | "unchanged";
  /** Moved to another weekday, or reordered within its day (see diffPlans). */
  moved: boolean;
  before: PlanSnapshot["entries"][number] | null;
  after: PlanSnapshot["entries"][number] | null;
  /** "routine" = a different routine id. */
  changes: FieldChange<"label" | "routine">[];
};

export type PlanHeaderField = keyof PlanSnapshot["plan"];
export type DayNoteDiff = { weekday: number; before: string | null; after: string | null };
export type PlanDiff = {
  header: FieldChange<PlanHeaderField>[];
  entries: EntryDiff[];
  /** Day notes that were added, changed or removed, by weekday. */
  days: DayNoteDiff[];
};

const SET_FIELDS: SetField[] = [
  "reps",
  "repsMax",
  "durationSeconds",
  "load",
  "distanceMeters",
  "intensity",
];
const ROUTINE_HEADER_FIELDS: (keyof RoutineSnapshot["routine"])[] = [
  "name",
  "notes",
  "status",
  "caseId",
  "sessionsPerWeek",
  "sessionsPerDay",
  "phaseLabel",
  "startsOn",
  "endsOn",
];
const PLAN_HEADER_FIELDS: PlanHeaderField[] = [
  "name",
  "notes",
  "status",
  "caseId",
  "phaseLabel",
  "startsOn",
  "endsOn",
];

function headerChanges<F extends string>(
  fields: F[],
  before: Record<F, unknown>,
  after: Record<F, unknown>,
): FieldChange<F>[] {
  // Stored snapshots are not re-parsed: a field added later is `undefined` in an old one.
  const norm = (value: unknown) => value ?? null;
  return fields
    .filter((field) => norm(before[field]) !== norm(after[field]))
    .map((field) => ({ field, from: norm(before[field]), to: norm(after[field]) }));
}

/** Indices (into `sequence`) of one longest strictly increasing subsequence. */
function longestIncreasing(sequence: number[]): Set<number> {
  const length: number[] = [];
  const previous: number[] = [];
  let best = -1;
  sequence.forEach((value, i) => {
    length[i] = 1;
    previous[i] = -1;
    for (let j = 0; j < i; j++) {
      if (sequence[j] < value && length[j] + 1 > length[i]) {
        length[i] = length[j] + 1;
        previous[i] = j;
      }
    }
    if (best === -1 || length[i] > length[best]) best = i;
  });
  const keep = new Set<number>();
  for (let i = best; i >= 0; i = previous[i]) keep.add(i);
  return keep;
}

/** After order, with each removed entry re-inserted at its old index. */
function interleave<T>(afterOrder: T[], removed: { index: number; value: T }[]): T[] {
  const result = [...afterOrder];
  for (const { index, value } of [...removed].sort((a, b) => a.index - b.index)) {
    result.splice(Math.min(index, result.length), 0, value);
  }
  return result;
}

/** Group membership by content (keys are positional): partner exercise ids + group rest. */
function groupSignature(snapshot: RoutineSnapshot, item: SnapshotItem) {
  const key = item.prescription.groupKey;
  if (key === null) return null;
  const partners = snapshot.items
    .filter((other) => other !== item && other.prescription.groupKey === key)
    .map((other) => other.exercise.id)
    .sort();
  const restSeconds = snapshot.groups.find((group) => group.key === key)?.restSeconds ?? null;
  return { partners, restSeconds };
}

function diffSets(before: SnapshotSet[], after: SnapshotSet[]): SetDiff[] {
  const diffs: SetDiff[] = [];
  for (let index = 0; index < Math.max(before.length, after.length); index++) {
    const a = before[index];
    const b = after[index];
    if (!a) diffs.push({ index, kind: "added", set: b });
    else if (!b) diffs.push({ index, kind: "removed", set: a });
    else {
      const changes = headerChanges(SET_FIELDS, a, b);
      if (changes.length > 0) diffs.push({ index, kind: "changed", changes });
    }
  }
  return diffs;
}

/**
 * Section names of both snapshots, or null when either predates sections (stored jsonb is not
 * re-parsed, so `sections` may be missing): an old version has no sections to compare against.
 */
function sectionNames(before: RoutineSnapshot, after: RoutineSnapshot) {
  const a = before.sections ?? [];
  const b = after.sections ?? [];
  if (a.length === 0 || b.length === 0) return null;
  const nameOf = (sections: typeof a, item: SnapshotItem) => {
    const key = item.prescription.sectionKey ?? null;
    return sections.find((section) => section.key === key)?.name ?? sections[0].name;
  };
  return {
    before: a.map((section) => section.name),
    after: b.map((section) => section.name),
    of: (side: "before" | "after", item: SnapshotItem) => nameOf(side === "before" ? a : b, item),
  };
}

function diffItem(
  before: SnapshotItem,
  after: SnapshotItem,
  beforeGroup: unknown,
  afterGroup: unknown,
  moved: boolean,
  section: { from: string; to: string } | null,
): ItemDiff {
  const a = before.prescription;
  const b = after.prescription;
  const changes: FieldChange<ItemField>[] = headerChanges(
    ["holdSeconds", "restSeconds", "side", "notes"] as const,
    a,
    b,
  );
  if (JSON.stringify(beforeGroup) !== JSON.stringify(afterGroup)) {
    changes.push({ field: "group", from: beforeGroup, to: afterGroup });
  }
  if (section && section.from !== section.to) {
    changes.push({ field: "section", from: section.from, to: section.to });
  }
  if (a.sets.length !== b.sets.length) {
    changes.push({ field: "sets", from: a.sets.length, to: b.sets.length });
  }
  const sets = diffSets(a.sets, b.sets);
  return {
    status: changes.length > 0 || sets.length > 0 ? "changed" : "unchanged",
    moved,
    before,
    after,
    changes,
    sets,
  };
}

/** Compare two routine snapshots: header fields plus a per-item diff (see spec 15). */
export function diffRoutines(before: RoutineSnapshot, after: RoutineSnapshot): RoutineDiff {
  const byPosition = (a: SnapshotItem, b: SnapshotItem) => a.position - b.position;
  const beforeItems = [...before.items].sort(byPosition);
  const afterItems = [...after.items].sort(byPosition);

  // Pair the k-th occurrence of an exercise in `before` with the k-th in `after`.
  const occurrences = new Map<string, number[]>();
  beforeItems.forEach((item, index) => {
    const list = occurrences.get(item.exercise.id) ?? [];
    list.push(index);
    occurrences.set(item.exercise.id, list);
  });
  const seen = new Map<string, number>();
  const pairedBefore: (number | null)[] = afterItems.map((item) => {
    const k = seen.get(item.exercise.id) ?? 0;
    seen.set(item.exercise.id, k + 1);
    return occurrences.get(item.exercise.id)?.[k] ?? null;
  });

  // Paired items outside the longest common subsequence of the order are the ones that moved.
  const pairedAt = pairedBefore.flatMap((b, i) => (b === null ? [] : [i]));
  const keep = longestIncreasing(pairedAt.map((i) => pairedBefore[i] as number));
  const stable = new Set(pairedAt.filter((_, n) => keep.has(n)));

  const names = sectionNames(before, after);

  const items: ItemDiff[] = afterItems.map((item, i) => {
    const b = pairedBefore[i];
    if (b === null) {
      return { status: "added", moved: false, before: null, after: item, changes: [], sets: [] };
    }
    const old = beforeItems[b];
    return diffItem(
      old,
      item,
      groupSignature(before, old),
      groupSignature(after, item),
      !stable.has(i),
      names && { from: names.of("before", old), to: names.of("after", item) },
    );
  });

  const paired = new Set(pairedBefore);
  const removed = beforeItems.flatMap((item, index) =>
    paired.has(index)
      ? []
      : [
          {
            index,
            value: {
              status: "removed",
              moved: false,
              before: item,
              after: null,
              changes: [],
              sets: [],
            } satisfies ItemDiff,
          },
        ],
  );

  const header: FieldChange<RoutineHeaderField>[] = headerChanges(
    ROUTINE_HEADER_FIELDS,
    before.routine,
    after.routine,
  );
  if (names && names.before.join("\u0000") !== names.after.join("\u0000")) {
    header.push({
      field: "sections",
      from: names.before.join(", "),
      to: names.after.join(", "),
    });
  }

  return {
    header,
    items: interleave(items, removed),
  };
}

/**
 * Ids of the entries that moved: to another weekday, or within the same day out of the relative
 * order of the day's other kept entries. Positions alone don't count, since the board renumbers a
 * day whenever an entry is added, removed or moved (removing the first of three shifts the rest).
 */
function movedEntries(before: PlanSnapshot, after: PlanSnapshot): Set<string> {
  const beforeById = new Map(before.entries.map((entry) => [entry.id, entry]));
  const moved = new Set<string>();
  const stayed = new Map<number, PlanSnapshot["entries"]>();
  for (const entry of after.entries) {
    const old = beforeById.get(entry.id);
    if (!old) continue;
    if (old.weekday !== entry.weekday) moved.add(entry.id);
    else stayed.set(entry.weekday, [...(stayed.get(entry.weekday) ?? []), entry]);
  }
  for (const day of stayed.values()) {
    day.sort((a, b) => a.position - b.position);
    const keep = longestIncreasing(day.map((entry) => beforeById.get(entry.id)!.position));
    day.forEach((entry, i) => {
      if (!keep.has(i)) moved.add(entry.id);
    });
  }
  return moved;
}

/** Compare two plan snapshots: header fields plus entries paired by id. */
export function diffPlans(before: PlanSnapshot, after: PlanSnapshot): PlanDiff {
  const beforeById = new Map(before.entries.map((entry) => [entry.id, entry]));
  const afterIds = new Set(after.entries.map((entry) => entry.id));
  const moved = movedEntries(before, after);

  const entries: EntryDiff[] = after.entries.map((entry) => {
    const old = beforeById.get(entry.id);
    if (!old) {
      return { status: "added", moved: false, before: null, after: entry, changes: [] };
    }
    const changes: FieldChange<"label" | "routine">[] = [];
    if (old.label !== entry.label)
      changes.push({ field: "label", from: old.label, to: entry.label });
    if (old.routine.id !== entry.routine.id) {
      changes.push({ field: "routine", from: old.routine.id, to: entry.routine.id });
    }
    return {
      status: changes.length > 0 ? "changed" : "unchanged",
      moved: moved.has(entry.id),
      before: old,
      after: entry,
      changes,
    };
  });

  const removed = before.entries.flatMap((entry, index) =>
    afterIds.has(entry.id)
      ? []
      : [
          {
            index,
            value: {
              status: "removed",
              moved: false,
              before: entry,
              after: null,
              changes: [],
            } satisfies EntryDiff,
          },
        ],
  );

  // Stored snapshots are not re-parsed, so one from before day notes has no `days` at runtime.
  const beforeDays = new Map((before.days ?? []).map((day) => [day.weekday, day.notes]));
  const afterDays = new Map((after.days ?? []).map((day) => [day.weekday, day.notes]));
  const days: DayNoteDiff[] = [...new Set([...beforeDays.keys(), ...afterDays.keys()])]
    .sort((x, y) => x - y)
    .map((weekday) => ({
      weekday,
      before: beforeDays.get(weekday) ?? null,
      after: afterDays.get(weekday) ?? null,
    }))
    .filter((day) => day.before !== day.after);

  return {
    header: headerChanges(PLAN_HEADER_FIELDS, before.plan, after.plan),
    entries: interleave(entries, removed),
    days,
  };
}
