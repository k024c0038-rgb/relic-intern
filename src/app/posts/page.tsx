import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getUser } from "@/lib/supabase/server";
import { POST_TYPES, type DbPostWithStats, type PostType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PostCard } from "@/components/posts/post-card";

type SearchParams = Promise<{ type?: string; region?: string; sort?: string }>;
const SORTS = ["new", "popular", "value"] as const;

export default async function PostsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const t = await getTranslations("posts");
  const tc = await getTranslations("common");
  const type = POST_TYPES.includes(sp.type as PostType) ? (sp.type as PostType) : null;
  const region = sp.region?.trim().slice(0, 50) ?? "";
  const sort = SORTS.includes(sp.sort as (typeof SORTS)[number]) ? (sp.sort as (typeof SORTS)[number]) : "new";

  const { supabase } = await getUser();
  let query = supabase.from("posts_with_stats").select("*").limit(60);
  if (type) query = query.eq("type", type);
  if (region) query = query.ilike("region", `%${region.replace(/[%_]/g, "")}%`);
  if (sort === "popular") query = query.order("like_count", { ascending: false });
  if (sort === "value") {
    // コスパ順：評価が高く、費用が安いもの
    query = query.order("rating", { ascending: false, nullsFirst: false }).order("price", { ascending: true, nullsFirst: false });
  }
  query = query.order("created_at", { ascending: false });
  const { data: posts } = await query;

  const href = (next: Partial<{ type: string | null; sort: string }>) => {
    const qs = new URLSearchParams();
    const nt = next.type === undefined ? type : next.type;
    if (nt) qs.set("type", nt);
    if (region) qs.set("region", region);
    qs.set("sort", next.sort ?? sort);
    return `/posts?${qs.toString()}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Button asChild>
          <Link href="/posts/new">{tc("newPost")}</Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {[null, ...POST_TYPES].map((ty) => (
          <Link
            key={ty ?? "all"}
            href={href({ type: ty })}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              ty === type ? "border-primary bg-primary text-primary-foreground" : "bg-background",
            )}
          >
            {tc(`postType.${ty ?? "all"}`)}
          </Link>
        ))}
      </div>

      <form className="flex flex-wrap items-center gap-2" action="/posts">
        {type && <input type="hidden" name="type" value={type} />}
        <Input name="region" defaultValue={region} placeholder={t("regionPlaceholder")} className="max-w-48" aria-label={t("region")} />
        <Select name="sort" defaultValue={sort} className="w-auto">
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {t(`sort.${s}`)}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="outline">
          {t("search")}
        </Button>
      </form>

      {(posts ?? []).length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {(posts as DbPostWithStats[]).map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      )}
    </div>
  );
}
