import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALES, type Locale } from "@/lib/types";

export const LOCALE_COOKIE = "NEXT_LOCALE";

function detect(acceptLanguage: string | null): Locale {
  const lang = acceptLanguage?.split(",")[0]?.toLowerCase() ?? "";
  if (lang.startsWith("zh")) return "zh";
  if (lang.startsWith("en")) return "en";
  return "ja";
}

/** URLは言語ごとに分けず、Cookie（なければブラウザの言語）で表示言語を決める */
export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale: Locale = LOCALES.includes(cookieLocale as Locale)
    ? (cookieLocale as Locale)
    : detect((await headers()).get("accept-language"));
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: "Asia/Tokyo",
  };
});
