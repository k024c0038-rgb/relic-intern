"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALES, type Locale } from "@/lib/types";
import { LOCALE_COOKIE } from "@/i18n/request";
import { getUser } from "@/lib/supabase/server";

export async function setLocale(locale: Locale) {
  if (!LOCALES.includes(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const { supabase, user } = await getUser();
  if (user) await supabase.from("profiles").update({ language: locale }).eq("id", user.id);
  revalidatePath("/", "layout");
}
