// Pure helpers for aerobic inputs. No "@/" imports: drizzle-kit may load this file.

/** "5" → 5000, "2,5" / "2.5" → 2500, "0.8" → 800; blank → null; NaN/≤0 → undefined (invalid). */
export function parseKm(value: string): number | null | undefined {
  const text = value.trim().replace(",", ".");
  if (text === "") return null;
  if (!/^\d+(\.\d+)?$/.test(text)) return undefined;
  const meters = Math.round(Number(text) * 1000);
  return meters > 0 ? meters : undefined;
}

/** 5000 → "5", 2500 → "2.5", 800 → "0.8" (for the editor input; dot decimal). */
export function metersToKmInput(meters: number | null): string {
  return meters === null ? "" : String(meters / 1000);
}

/** Unit + value for display: < 1000 m → { unit: "m", value: 800 }, else { unit: "km", value: 2.5 }. */
export function distanceDisplay(meters: number): { unit: "m" | "km"; value: number } {
  return meters < 1000 ? { unit: "m", value: meters } : { unit: "km", value: meters / 1000 };
}

/** "30" → 1800, "1:30" → 90, "45:00" → 2700; blank → null; invalid → undefined. */
export function parseDurationInput(value: string): number | null | undefined {
  const text = value.trim();
  if (text === "") return null;
  if (/^\d+$/.test(text)) return Number(text) * 60;
  const match = /^(\d+):([0-5]\d)$/.exec(text);
  return match ? Number(match[1]) * 60 + Number(match[2]) : undefined;
}

/** 1800 → "30", 90 → "1:30" (inverse of parseDurationInput). */
export function durationToInput(seconds: number | null): string {
  if (seconds === null) return "";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? String(minutes) : `${minutes}:${String(rest).padStart(2, "0")}`;
}
