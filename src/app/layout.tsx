import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";
import { siteUrl } from "@/lib/utils";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: `${t("appName")} | ${t("tagline")}`, template: `%s | ${t("appName")}` },
    description: t("tagline"),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body className="min-h-dvh antialiased">
        <NextIntlClientProvider>
          <SiteHeader />
          <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
