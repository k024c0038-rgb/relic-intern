import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getUser } from "@/lib/supabase/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";

export async function SiteHeader() {
  const t = await getTranslations("common");
  const { user } = await getUser();
  return (
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4 sm:gap-3">
        <Link href="/" className="text-lg font-bold text-primary">
          {t("appName")}
        </Link>
        <nav className="flex flex-1 items-center gap-3 whitespace-nowrap text-xs sm:text-sm">
          <Link href="/posts" className="hover:underline">
            {t("posts")}
          </Link>
          <Link href="/posts/new" className="hover:underline">
            {t("newPost")}
          </Link>
        </nav>
        <LanguageSwitcher />
        {user ? (
          <form action="/auth/signout" method="post">
            <Button variant="ghost" size="sm" type="submit">
              {t("logout")}
            </Button>
          </form>
        ) : (
          <Button asChild size="sm" variant="outline">
            <Link href="/login">{t("login")}</Link>
          </Button>
        )}
      </div>
    </header>
  );
}
