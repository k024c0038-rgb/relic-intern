import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { getUser } from "@/lib/supabase/server";
import { getPlaces, latLng } from "@/lib/google";
import type { DbPhoto, DbPostWithStats, DbRouteSpot } from "@/lib/types";
import { formatYen, photoUrl } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MapView, type MapPoint } from "@/components/map-view";
import { PostContent } from "@/components/posts/post-content";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { id } = await params;
  const { supabase } = await getUser();
  const { data } = await supabase.from("posts").select("title, body").eq("id", id).maybeSingle();
  return data ? { title: data.title, description: data.body.slice(0, 120) } : {};
}

export default async function PostPage({ params }: { params: Params }) {
  const { id } = await params;
  const t = await getTranslations("postDetail");
  const tc = await getTranslations("common");
  const format = await getFormatter();
  const { supabase, user } = await getUser();

  const { data: post } = await supabase.from("posts_with_stats").select("*").eq("id", id).maybeSingle<DbPostWithStats>();
  if (!post) notFound();

  const [{ data: photos }, { data: routeSpots }, likeRes, saveRes] = await Promise.all([
    supabase.from("post_photos").select("id, storage_path, taken_at").eq("post_id", id).order("taken_at", { nullsFirst: false }),
    post.type === "route"
      ? supabase.from("post_route_spots").select("*").eq("post_id", id).order("day").order("order_index")
      : Promise.resolve({ data: [] }),
    user
      ? supabase.from("post_likes").select("id").eq("post_id", id).eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    user
      ? supabase.from("post_saves").select("id").eq("post_id", id).eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const spots = (routeSpots ?? []) as DbRouteSpot[];

  // 地図表示：ルート投稿は回ったスポット、グルメ・宿はそのお店
  const placeIds = post.type === "route" ? spots.map((s) => s.google_place_id).filter((x): x is string => !!x) : post.google_place_id ? [post.google_place_id] : [];
  const places = placeIds.length ? await getPlaces(placeIds, post.language).catch(() => new Map()) : new Map();
  const points: MapPoint[] = [];
  const routes: { lat: number; lng: number }[][] = [];
  if (post.type === "route") {
    const days = [...new Set(spots.map((s) => s.day))];
    for (const d of days) {
      const path: { lat: number; lng: number }[] = [];
      spots
        .filter((s) => s.day === d)
        .forEach((s, i) => {
          const place = s.google_place_id ? places.get(s.google_place_id) : null;
          const loc = place ? latLng(place) : null;
          if (!loc) return;
          path.push(loc);
          points.push({ id: s.id, ...loc, title: s.name, label: `${d}-${i + 1}`, kind: "sightseeing" });
        });
      if (path.length > 1) routes.push(path);
    }
  } else if (post.google_place_id) {
    const place = places.get(post.google_place_id);
    const loc = place ? latLng(place) : null;
    if (loc) points.push({ id: post.id, ...loc, title: post.place_name ?? post.title, kind: post.type === "food" ? "food" : "stay" });
  }

  return (
    <article className="mx-auto max-w-3xl space-y-5">
      {(photos ?? []).length > 0 && (
        <div className="flex snap-x gap-2 overflow-x-auto rounded-xl">
          {(photos as DbPhoto[]).map((p) => (
            <figure key={p.id} className="relative shrink-0 snap-center">
              {/* 撮影したままの写真をそのまま表示 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl(p.storage_path)} alt={post.title} className="h-72 w-auto max-w-[85vw] rounded-lg object-contain bg-black" />
              {p.taken_at && (
                <figcaption className="absolute bottom-1 left-1 rounded bg-black/60 px-2 text-xs text-white">
                  {t("takenAt", { date: format.dateTime(new Date(p.taken_at), { dateStyle: "medium" }) })}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="secondary">{tc(`postType.${post.type}`)}</Badge>
        <span>{post.region}</span>
        <span>· {t("by", { name: post.author_name ?? "-" })}</span>
        <span>· {format.dateTime(new Date(post.created_at), { dateStyle: "medium" })}</span>
      </div>

      <PostContent
        postId={post.id}
        isRoute={post.type === "route"}
        original={{ title: post.title, body: post.body, dish_name: post.dish_name, highlights: post.highlights }}
        originalLanguage={post.language}
        likeCount={post.like_count}
        liked={!!likeRes.data}
        saved={!!saveRes.data}
      >
        <div className="flex flex-wrap gap-3 text-sm">
          {post.place_name &&
            (post.google_place_id ? (
              <Link href={`/nearby/${encodeURIComponent(post.google_place_id)}`} className="font-medium underline">
                📍 {post.place_name}
              </Link>
            ) : (
              <span className="font-medium">📍 {post.place_name}</span>
            ))}
          {post.rating && <span className="text-amber-600">{"★".repeat(post.rating)}{"☆".repeat(5 - post.rating)}</span>}
          {post.price != null && (
            <span>{post.type === "stay" ? t("nightPrice", { price: formatYen(post.price) }) : t("price", { price: formatYen(post.price) })}</span>
          )}
          {post.type === "route" && post.transport && (
            <span>
              {post.days}d · {tc(`transport.${post.transport}`)}
            </span>
          )}
        </div>
      </PostContent>

      {points.length > 0 && <MapView points={points} route={routes} />}

      {post.type === "route" && spots.length > 0 && (
        <ol className="relative space-y-3 border-l-2 border-primary/30 pl-5">
          {spots.map((s, i) => (
            <li key={s.id}>
              <span className="absolute -left-[7px] mt-1.5 size-3 rounded-full bg-primary" />
              {(i === 0 || spots[i - 1].day !== s.day) && <p className="text-xs font-bold text-primary">Day {s.day}</p>}
              {s.travel_minutes ? <p className="text-xs text-muted-foreground">↓ {tc("minutes", { n: s.travel_minutes })}</p> : null}
              {s.google_place_id ? (
                <Link href={`/nearby/${encodeURIComponent(s.google_place_id)}`} className="font-medium hover:underline">
                  {s.name}
                </Link>
              ) : (
                <span className="font-medium">{s.name}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
