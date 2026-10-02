// Imported by the Drizzle schema via a relative path: keep this file free of imports
// ("@/" aliases do not resolve under drizzle-kit).
export const VERSION_KINDS = ["created", "edited", "restored"] as const;
export type VersionKind = (typeof VERSION_KINDS)[number];
