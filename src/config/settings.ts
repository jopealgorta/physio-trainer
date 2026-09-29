import type { Route } from "next";

export const SETTINGS_SECTIONS = ["profile", "branding", "account"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export function settingsSection(value: string | undefined): SettingsSection {
  return SETTINGS_SECTIONS.find((section) => section === value) ?? "profile";
}

export function settingsHref(section: SettingsSection): Route {
  return (section === "profile" ? "/settings" : `/settings?section=${section}`) as Route;
}
