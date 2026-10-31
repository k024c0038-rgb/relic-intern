import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Clock, MapPin, Train } from "lucide-react";
import { getUser } from "@/lib/supabase/server";
import { getPlaces, latLng, type Place } from "@/lib/google";
import type { DbPlanSpot, DbTripPlan } from "@/lib/types";
import { formatYen, photoUrl } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapView, type MapPoint } from "@/components/map-view";
import { PlacePhoto } from "@/components/place-photo";
import { PlanActions } from "@/components/plan/plan-actions";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { id } = await params;
  const { supabase } = await getUser();
  const { data } = await supabase.from("trip_plans").select("title").eq("id", id).maybeSingle();
  return { title: data?.title };
}

export default async function PlanPage({ params }: { params: Params }) {
  const { id } = await params;
  const t = await getTranslations("plan");
  const tc = await getTranslations("common");
  const { supabase, user } = await getUser();

  const { data: plan } = await supabase.from("trip_plans").select("*").eq("id", id).maybeSingle<DbTripPlan>();
  if (!plan) notFound();
  const { data: spotRows } = await supabase
    .from("plan_spots")
    .select("*")
    .eq("plan_id", id)
    .order("day")
    .order("order_index");
  const spots = (spotRows ?? []) as DbPlanSpot[];
  const { data: photoRows } = await supabase
    .from("spot_photos")
    .select("id, spot_id, storage_path, taken_at")
    .eq("plan_id", id)
    .order("taken_at", { ascending: true, nullsFirst: false });
  const photosBySpot = new Map<string, { id: string; storage_path: string }[]>();
  for (const p of photoRows ?? []) {
    photosBySpot.set(p.spot_id, [...(photosBySpot.get(p.spot_id) ?? []), p]);
  }

  // 写真・位置は保存していないので、表示のたびに google_place_id から取得する
  const places = await getPlaces(
    spots.map((s) => s.google_place_id),
    plan.language,
  ).catch(() => new Map<string, Place | null>());

  const isOwner = user?.id === plan.user_id;
  const total = spots.reduce((sum, s) => sum + s.estimated_cost, 0);
  const days = Array.from({ length: plan.days }, (_, i) => i + 1);

  const points: MapPoint[] = [];
  const routes: { lat: number; lng: number }[][] = [];
  for (const d of days) {
    const path: { lat: number; lng: number }[] = [];
    spots
      .filter((s) => s.day === d)
      .forEach((s, i) => {
        const place = places.get(s.google_place_id);
        const loc = place ? latLng(place) : null;
        if (!loc) return;
        path.push(loc);
        points.push({
          id: s.id,
          ...loc,
          title: s.name,
          label: `${d}-${i + 1}`,
          kind: s.is_main ? "main" : s.category,
        });
      });
    if (path.length > 1) routes.push(path);
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {t("conditions", { destination: plan.destination, days: plan.days, transport: tc(`transport.${plan.transport}`) })}
          {plan.start_date && ` · ${plan.start_date}〜`}
        </p>
        <h1 className="text-2xl font-bold">{plan.title}</h1>
        {plan.summary && <p className="text-muted-foreground">{plan.summary}</p>}
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-background p-3 text-sm shadow-sm">
          <span>
            {t("total")}: <strong className="text-lg">{formatYen(total)}</strong>
          </span>
          {plan.budget != null && (
            <span className={total > plan.budget ? "text-destructive" : "text-muted-foreground"}>
              {t("budget", { budget: formatYen(plan.budget) })}
              {total > plan.budget && ` · ${t("overBudget")}`}
            </span>
          )}
        </div>
      </section>

      <PlanActions
        planId={plan.id}
        isOwner={isOwner}
        isSaved={plan.is_saved}
        spots={spots.map((s) => ({ id: s.id, label: `${t("day", { n: s.day })} ${s.name}` }))}
      />

      <section className="space-y-2">
        <h2 className="font-semibold">{t("map")}</h2>
        <MapView points={points} route={routes} className="h-80 w-full" />
      </section>

      {days.map((d) => (
        <section key={d} className="space-y-3">
          <h2 className="sticky top-14 z-10 bg-stone-50/95 py-2 text-xl font-bold">{t("day", { n: d })}</h2>
          <ol className="relative space-y-4 border-l-2 border-primary/30 pl-5">
            {spots
              .filter((s) => s.day === d)
              .map((s) => {
                const place = places.get(s.google_place_id);
                const myPhotos = photosBySpot.get(s.id) ?? [];
                return (
                  <li key={s.id} className="space-y-2">
                    {s.travel_minutes > 0 && (
                      <p className="-ml-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Train className="size-3" /> {t("travel", { n: s.travel_minutes })}
                      </p>
                    )}
                    <span className="absolute -left-[7px] mt-2 size-3 rounded-full bg-primary" />
                    <Card className="overflow-hidden">
                      <div className="grid sm:grid-cols-[220px_1fr]">
                        <PlacePhoto photo={place?.photos?.[0]} alt={s.name} width={600} className="sm:h-full" />
                        <div>
                          <CardHeader className="pb-2">
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              <span className="flex items-center gap-1 font-mono font-semibold">
                                <Clock className="size-3" /> {s.start_time?.slice(0, 5)}
                              </span>
                              {s.is_main && <Badge variant="main">{tc("mainBadge")}</Badge>}
                              <Badge variant="secondary">{tc(`category.${s.category}`)}</Badge>
                              {place?.rating && <span className="text-xs text-muted-foreground">★{place.rating}</span>}
                            </div>
                            <CardTitle className="text-lg">{s.name}</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2 text-sm">
                            {s.description && <p>{s.description}</p>}
                            <p className="text-muted-foreground">
                              {s.category === "stay" ? t("checkIn") : t("stay", { n: s.stay_minutes })} ·{" "}
                              {t("cost", { cost: formatYen(s.estimated_cost) })}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <Button asChild size="sm" variant="outline">
                                <Link href={`/nearby/${encodeURIComponent(s.google_place_id)}?transport=${plan.transport}`}>
                                  <MapPin /> {t("seeNearby")}
                                </Link>
                              </Button>
                              {place?.googleMapsUri && (
                                <Button asChild size="sm" variant="ghost">
                                  <a href={place.googleMapsUri} target="_blank" rel="noopener noreferrer">
                                    Google Maps
                                  </a>
                                </Button>
                              )}
                            </div>
                            {myPhotos.length > 0 && (
                              <div>
                                <p className="mb-1 text-xs font-medium">{t("myPhotos")}</p>
                                <div className="flex gap-2 overflow-x-auto">
                                  {myPhotos.map((p) => (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      key={p.id}
                                      src={photoUrl(p.storage_path)}
                                      alt={s.name}
                                      className="h-20 w-28 shrink-0 rounded object-cover"
                                    />
                                  ))}
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </div>
                      </div>
                    </Card>
                  </li>
                );
              })}
          </ol>
        </section>
      ))}
    </div>
  );
}
