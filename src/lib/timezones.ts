/**
 * Canonical IANA name for a time zone, or null if the runtime does not know it.
 * Uses DateTimeFormat rather than Intl.supportedValuesOf, which omits "UTC" in V8.
 */
export function normalizeTimeZone(value: string): string | null {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export function isValidTimeZone(value: string): boolean {
  return normalizeTimeZone(value) !== null;
}

export type TimeZoneOption = { value: string; label: string };

/** Options for the timezone picker: UTC first, then every zone, labelled "Europe/Madrid (GMT+1)". */
export function timeZoneOptions(now: Date = new Date()): TimeZoneOption[] {
  const zones = ["UTC", ...Intl.supportedValuesOf("timeZone").filter((zone) => zone !== "UTC")];
  return zones.map((zone) => ({
    value: zone,
    label: `${zone.replaceAll("_", " ")} (${offsetLabel(zone, now)})`,
  }));
}

function offsetLabel(timeZone: string, date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  return parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
}
