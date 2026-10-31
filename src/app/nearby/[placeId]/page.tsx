import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getUser } from "@/lib/supabase/server";
import { computeTravelMatrix, getPlace, latLng, nearbySearch, type Place } from "@/lib/google";
import { SEARCH_RADIUS, TRANSPORTS, type DbPostWithStats, type Transport } from "@/lib/types";
import { distanceMeters, formatYen } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlacePhoto } from "@/components/place-photo";
import { NearbyExplorer, type NearbySpot } from "@/components/nearby/nearby-explorer";

type Params = Promise<{ placeId: string }>;
type SearchParams = Promise<{ transport?: string }>;

/** 種類ごとの滞在時間の目安（分） */
function stayEstimate(place: Place) {
  const types = place.types ?? [];
  if (types.includes("museum") || types.includes("amusement_park")) return 120;
  return 60;
}

export default async function NearbyPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { placeId: rawId } = await params;
  const placeId = decodeURIComponent(rawId);
  const sp = await searchParams;
  const transport: Transport = TRANSPORTS.includes(sp.transport as Transport) ? (sp.transport as Transport) : "transit";
  const locale = await getLocale();
  const t = await getTranslations("nearby");
  const tc = await getTranslations("common");
  const { supabase } = await getUser();

  const main = await getPlace(placeId, locale).catch(() => null);
  const center = main ? latLng(main) : null;
  if (!main || !center) notFound();
  const mainName = main.displayName?.text ?? "";

  // 周辺の観光地・飲食店・宿（閉業は除外済み）
  const radius = SEARCH_RADIUS[transport];
  const categories = ["sightseeing", "food", "stay"] as const;
  const lists = await Promise.all(
    categories.map((c) => nearbySearch(center, radius, c, locale, 12).catch(() => [] as Place[])),
  );
  const filtered = lists.map((l) => l.filter((p) => p.id !== main.id && latLng(p)));

  const allIds = filtered.flat().map((p) => p.id);
  const [{ data: stats }, { data: coVisited }, { data: routeRefs }, ...matrices] = await Promise.all([
    supabase.rpc("get_place_post_stats", { place_ids: allIds }),
    supabase.rpc("get_co_visited_spots", { target_place_id: main.id }),
    supabase.from("post_route_spots").select("post_id").eq("google_place_id", main.id).limit(50),
    ...filtered.map((l) => computeTravelMatrix(center, l.map((p) => latLng(p)!), transport)),
  ]);
  const postCount = new Map(
    ((stats ?? []) as { google_place_id: string; post_count: number; route_count: number }[]).map((s) => [
      s.google_place_id,
      Number(s.post_count) + Number(s.route_count),
    ]),
  );

  const spots = Object.fromEntries(
    categories.map((c, ci) => [
      c,
      filtered[ci].map<NearbySpot>((p, i) => {
        const loc = latLng(p)!;
        return {
          placeId: p.id,
          name: p.displayName?.text ?? "",
          lat: loc.lat,
          lng: loc.lng,
          rating: p.rating,
          userRatingCount: p.userRatingCount,
          photo: p.photos?.[0],
          distanceKm: distanceMeters(center, loc) / 1000,
          travelMinutes: (matrices[ci] as number[])[i],
          postCount: postCount.get(p.id) ?? 0,
        };
      }),
    ]),
  ) as Record<(typeof categories)[number], NearbySpot[]>;

  const routePostIds = [...new Set((routeRefs ?? []).map((r) => r.post_id))];
  const { data: routePosts } = routePostIds.length
    ? await supabase
        .from("posts_with_stats")
        .select("*")
        .in("id", routePostIds)
        .order("like_count", { ascending: false })
        .limit(10)
    : { data: [] };

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="grid md:grid-cols-2">
          <PlacePhoto photo={main.photos?.[0]} alt={mainName} width={1000} />
          <div>
            <CardHeader>
              <Badge variant="main" className="w-fit">
                {tc("mainBadge")}
              </Badge>
              <CardTitle className="text-2xl">{mainName}</CardTitle>
              {main.formattedAddress && <p className="text-sm text-muted-foreground">{main.formattedAddress}</p>}
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {main.editorialSummary?.text && <p>{main.editorialSummary.text}</p>}
              <p>{t("stayEstimate", { n: stayEstimate(main) })}</p>
              {main.regularOpeningHours?.weekdayDescriptions && (
                <details>
                  <summary className="cursor-pointer font-medium">{t("openingHours")}</summary>
                  <ul className="mt-1 text-xs text-muted-foreground">
                    {main.regularOpeningHours.weekdayDescriptions.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="text-muted-foreground">{t("transportLabel")}:</span>
                {TRANSPORTS.map((m) => (
                  <Link
                    key={m}
                    href={`/nearby/${encodeURIComponent(main.id)}?transport=${m}`}
                    className={`rounded-full border px-2 py-0.5 ${m === transport ? "bg-primary text-primary-foreground" : ""}`}
                  >
                    {tc(`transport.${m}`)}
                  </Link>
                ))}
              </div>
            </CardContent>
          </div>
        </div>
      </Card>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">{t("coVisitedTitle")}</h2>
        {(coVisited ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {(coVisited as { google_place_id: string; name: string; visit_count: number }[]).map((c) => (
              <li key={c.google_place_id}>
                <Link
                  href={`/nearby/${encodeURIComponent(c.google_place_id)}?transport=${transport}`}
                  className="inline-flex flex-col rounded-lg border bg-background px-3 py-2 text-sm hover:bg-muted"
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{t("coVisitedCount", { n: Number(c.visit_count) })}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <NearbyExplorer main={{ placeId: main.id, name: mainName, ...center }} spots={spots} transport={transport} />

      <section className="space-y-2">
        <h2 className="text-lg font-bold">{t("routesTitle")}</h2>
        {(routePosts ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {(routePosts as DbPostWithStats[]).map((p) => (
              <li key={p.id}>
                <Link href={`/posts/${p.id}`} className="block rounded-lg border bg-background p-3 hover:bg-muted">
                  <p className="font-medium">{p.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.region} · {p.days ? `${p.days}d` : ""} · {formatYen(p.price)} · ♥ {p.like_count}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
