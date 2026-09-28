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

// Known timezone aliases for systems where the primary name is not available
const TIMEZONE_ALIASES: Record<string, string> = {
  "Asia/Kolkata": "Asia/Calcutta",
};

/** Options for a timezone <select>: UTC first, then every zone, labelled "Europe/Madrid (GMT+1)". */
export function timeZoneOptions(now: Date = new Date()): TimeZoneOption[] {
  const supportedZones = Intl.supportedValuesOf("timeZone");
  const zones = ["UTC", ...supportedZones.filter((zone) => zone !== "UTC")];

  // Add aliases for zones not directly supported but available under different names
  const zoneSet = new Set(zones);
  for (const [alias, canonical] of Object.entries(TIMEZONE_ALIASES)) {
    if (!zoneSet.has(alias) && zoneSet.has(canonical)) {
      zones.push(alias);
    }
  }

  return zones.map((zone) => ({
    value: zone,
    label: `${zone.replaceAll("_", " ")} (${offsetLabel(zone, now)})`,
  }));
}

function offsetLabel(timeZone: string, date: Date): string {
  // Use the canonical timezone name if this is an alias
  const canonical = TIMEZONE_ALIASES[timeZone] ?? timeZone;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: canonical,
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  return parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
}
