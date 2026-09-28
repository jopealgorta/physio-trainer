import "server-only";

import { env } from "@/env";
import { languageOptions, type Locale } from "@/i18n/config";
import { timeZoneOptions } from "@/lib/timezones";

/** Serialisable options ProfileForm needs, built on the server. */
export function profileFormOptions(displayLocale: Locale) {
  return {
    linkBase: new URL(env.NEXT_PUBLIC_APP_URL).host,
    timeZones: timeZoneOptions(),
    languages: languageOptions(displayLocale),
  };
}
