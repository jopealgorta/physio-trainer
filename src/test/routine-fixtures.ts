import type { EditorBlock, EditorItem, EditorSet } from "@/lib/routine-editor";

export const set = (key: string, patch: Partial<EditorSet> = {}): EditorSet => ({
  key,
  reps: null,
  repsMax: null,
  durationSeconds: null,
  load: null,
  distanceMeters: null,
  intensity: null,
  ...patch,
});

export const item = (key: string, patch: Partial<EditorItem> = {}): EditorItem => ({
  key,
  exerciseId: `ex-${key}`,
  exerciseName: `Exercise ${key}`,
  exerciseKind: "strength",
  exerciseArchived: false,
  cover: null,
  holdSeconds: null,
  restSeconds: null,
  side: null,
  notes: null,
  sets: [set(`${key}-s1`, { reps: 10 })],
  ...patch,
});

export const single = (key: string, patch: Partial<EditorItem> = {}): EditorBlock => ({
  kind: "single",
  key,
  item: item(key, patch),
});

export const group = (
  key: string,
  items: EditorItem[],
  restSeconds: number | null = null,
): EditorBlock => ({ kind: "group", key, restSeconds, items });

let counter = 0;
/** Deterministic key factory for tests. */
export const testKey = () => `new-${++counter}`;
