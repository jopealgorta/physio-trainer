import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { localeCookieName, pickLocale } from "./config";

export default getRequestConfig(async ({ locale: explicit }) => {
  // Patient pages pass the customer's locale explicitly; everything else uses the cookie, then
  // the browser's language.
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const locale = pickLocale({
    explicit,
    cookie: cookieStore.get(localeCookieName)?.value,
    acceptLanguage: headerList.get("accept-language"),
  });

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
