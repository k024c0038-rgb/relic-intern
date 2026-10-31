import "server-only";
import { getUser } from "@/lib/supabase/server";
import { getPlaces, latLng } from "@/lib/google";
import type { DbPlanSpot, DbPostWithStats, DbRouteSpot, DbTripPlan } from "@/lib/types";

export type ShareType = "plan" | "post";

export type ShareData = {
  type: ShareType;
  id: string;
  title: string;
  subtitle: string;
  spotNames: string[];
  points: { lat: number; lng: number; day: number }[];
  /** ユーザー自身が撮った写真のみ（Google の写真は使わない） */
  photos: { id: string; path: string }[];
  language: string;
  pagePath: string;
};

/** satori で描画できる形式の写真だけを使う（HEIC は不可） */
const RENDERABLE = /\.(jpe?g|png)$/i;

export async function loadShareData(type: ShareType, id: string): Promise<ShareData | null> {
  const { supabase } = await getUser();

  if (type === "plan") {
    const { data: plan } = await supabase.from("trip_plans").select("*").eq("id", id).maybeSingle<DbTripPlan>();
    if (!plan) return null;
    const [{ data: spotRows }, { data: photos }] = await Promise.all([
      supabase.from("plan_spots").select("*").eq("plan_id", id).order("day").order("order_index"),
      supabase
        .from("spot_photos")
        .select("id, storage_path, user_id")
        .eq("plan_id", id)
        .eq("user_id", plan.user_id)
        .order("taken_at", { nullsFirst: false }),
    ]);
    const spots = (spotRows ?? []) as DbPlanSpot[];
    const places = await getPlaces(spots.map((s) => s.google_place_id), plan.language).catch(() => new Map());
    const main = spots.filter((s) => s.is_main);
    const highlight = [...main, ...spots.filter((s) => !s.is_main && s.category === "sightseeing")];
    const dateText = plan.start_date ? `${plan.start_date.replaceAll("-", "/")}〜 ` : "";
    return {
      type,
      id,
      title: plan.title,
      subtitle: `${dateText}${plan.destination} · ${plan.days}${plan.language === "en" ? " days" : plan.language === "zh" ? "天" : "日間"}`,
      spotNames: [...new Set(highlight.map((s) => s.name))].slice(0, 6),
      points: spots
        .map((s) => {
          const place = places.get(s.google_place_id);
          const loc = place ? latLng(place) : null;
          return loc ? { ...loc, day: s.day } : null;
        })
        .filter((p): p is NonNullable<typeof p> => !!p),
      photos: (photos ?? []).filter((p) => RENDERABLE.test(p.storage_path)).map((p) => ({ id: p.id, path: p.storage_path })),
      language: plan.language,
      pagePath: `/plan/${id}`,
    };
  }

  const { data: post } = await supabase.from("posts_with_stats").select("*").eq("id", id).maybeSingle<DbPostWithStats>();
  if (!post) return null;
  const [{ data: photos }, { data: routeSpots }] = await Promise.all([
    supabase.from("post_photos").select("id, storage_path").eq("post_id", id).order("taken_at", { nullsFirst: false }),
    supabase.from("post_route_spots").select("*").eq("post_id", id).order("day").order("order_index"),
  ]);
  const spots = (routeSpots ?? []) as DbRouteSpot[];
  const ids = post.type === "route" ? spots.map((s) => s.google_place_id).filter((x): x is string => !!x) : post.google_place_id ? [post.google_place_id] : [];
  const places = ids.length ? await getPlaces(ids, post.language).catch(() => new Map()) : new Map();
  const points =
    post.type === "route"
      ? spots
          .map((s) => {
            const place = s.google_place_id ? places.get(s.google_place_id) : null;
            const loc = place ? latLng(place) : null;
            return loc ? { ...loc, day: s.day } : null;
          })
          .filter((p): p is NonNullable<typeof p> => !!p)
      : [];
  return {
    type,
    id,
    title: post.title,
    subtitle: post.region + (post.days ? ` · ${post.days}d` : ""),
    spotNames: post.type === "route" ? spots.map((s) => s.name).slice(0, 6) : [post.place_name, post.dish_name].filter((x): x is string => !!x),
    points,
    photos: (photos ?? []).filter((p) => RENDERABLE.test(p.storage_path)).map((p) => ({ id: p.id, path: p.storage_path })),
    language: post.language,
    pagePath: `/posts/${id}`,
  };
}
