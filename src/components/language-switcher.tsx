"use client";

import { useLocale } from "next-intl";
import { useTransition } from "react";
import { setLocale } from "@/app/actions";
import { LOCALES, type Locale } from "@/lib/types";

const LABEL: Record<Locale, string> = { ja: "日本語", zh: "中文", en: "EN" };

export function LanguageSwitcher() {
  const locale = useLocale();
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Language"
      value={locale}
      disabled={pending}
      onChange={(e) => start(() => setLocale(e.target.value as Locale))}
      className="h-8 rounded-md border bg-background px-2 text-sm"
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {LABEL[l]}
        </option>
      ))}
    </select>
  );
}
