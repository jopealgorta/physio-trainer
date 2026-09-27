import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { localeCookieName, resolveLocale } from "./config";

export default getRequestConfig(async ({ locale: explicitLocale }) => {
  // Patient pages pass the customer's locale explicitly; everything else uses the cookie.
  const locale = resolveLocale(explicitLocale ?? (await cookies()).get(localeCookieName)?.value);

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
