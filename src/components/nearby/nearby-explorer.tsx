"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Loader2, Plus, Sparkles } from "lucide-react";
import type { PlacePhoto as PlacePhotoType } from "@/lib/google";
import type { Locale, Transport } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapView, type MapPoint } from "@/components/map-view";
import { PlacePhoto } from "@/components/place-photo";

export type NearbySpot = {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  rating?: number;
  userRatingCount?: number;
  photo?: PlacePhotoType;
  distanceKm: number;
  travelMinutes: number;
  postCount: number;
};

type Course = {
  kind: "half_day" | "full_day";
  title: string;
  spots: { placeId: string; name: string; isMain: boolean; stayMinutes: number; note: string; lat: number; lng: number }[];
};

export function NearbyExplorer({
  main,
  spots,
  transport,
}: {
  main: { placeId: string; name: string; lat: number; lng: number };
  spots: Record<"sightseeing" | "food" | "stay", NearbySpot[]>;
  transport: Transport;
}) {
  const t = useTranslations("nearby");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [tab, setTab] = useState<"sightseeing" | "food" | "stay">("sightseeing");
  const [selected, setSelected] = useState<{ placeId: string; name: string }[]>([]);
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const points: MapPoint[] = useMemo(
    () => [
      { id: main.placeId, lat: main.lat, lng: main.lng, title: main.name, kind: "main", label: "★" },
      ...spots[tab].map((s, i) => ({ id: s.placeId, lat: s.lat, lng: s.lng, title: s.name, kind: tab, label: String(i + 1) })),
    ],
    [main, spots, tab],
  );

  function toggle(s: { placeId: string; name: string }) {
    setSelected((prev) =>
      prev.some((p) => p.placeId === s.placeId) ? prev.filter((p) => p.placeId !== s.placeId) : [...prev, s].slice(0, 4),
    );
  }

  function createPlan() {
    const mains = [{ placeId: main.placeId, name: main.name }, ...selected];
    const qs = new URLSearchParams({ mains: JSON.stringify(mains), transport, destination: main.name });
    router.push(`/?${qs.toString()}`);
  }

  async function generateCourses() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/nearby-route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placeId: main.placeId, name: main.name, transport, language: locale }),
    });
    setLoading(false);
    if (res.status === 401) return router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    if (!res.ok) return setError(tc("error"));
    setCourses(((await res.json()) as { courses: Course[] }).courses);
  }

  return (
    <div className="space-y-6">
      <MapView points={points} className="h-80 w-full" />

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          {(["sightseeing", "food", "stay"] as const).map((c) => (
            <TabsTrigger key={c} value={c}>
              {tc(`category.${c}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        {(["sightseeing", "food", "stay"] as const).map((c) => (
          <TabsContent key={c} value={c}>
            {spots[c].length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {spots[c].map((s, i) => {
                  const isSelected = selected.some((p) => p.placeId === s.placeId);
                  return (
                    <li key={s.placeId}>
                      <Card className="overflow-hidden">
                        <PlacePhoto photo={s.photo} alt={s.name} width={600} />
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">
                            {i + 1}. {s.name}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                          <p className="text-muted-foreground">
                            {t("distance", { km: s.distanceKm.toFixed(1) })} ·{" "}
                            {t("travelTime", { mode: tc(`transport.${transport}`), n: s.travelMinutes })}
                          </p>
                          <div className="flex flex-wrap gap-2 text-xs">
                            {s.rating && (
                              <Badge variant="outline">
                                ★{s.rating} ({s.userRatingCount ?? 0})
                              </Badge>
                            )}
                            <Badge variant="secondary">{t("postCount", { n: s.postCount })}</Badge>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant={isSelected ? "secondary" : "outline"} onClick={() => toggle(s)}>
                              {isSelected ? <Check /> : <Plus />} {isSelected ? t("added") : t("addToPlan")}
                            </Button>
                            <Button asChild size="sm" variant="ghost">
                              <Link href={`/nearby/${encodeURIComponent(s.placeId)}?transport=${transport}`}>→</Link>
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{t("aiTitle")}</h2>
          <Button size="sm" onClick={generateCourses} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {loading ? t("aiGenerating") : t("aiGenerate")}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {courses && (
          <div className="grid gap-3 md:grid-cols-2">
            {courses.map((c) => (
              <Card key={c.kind}>
                <CardHeader className="pb-2">
                  <Badge variant="secondary" className="w-fit">
                    {c.kind === "half_day" ? t("halfDay") : t("fullDay")}
                  </Badge>
                  <CardTitle className="text-base">{c.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-2 text-sm">
                    {c.spots.map((s, i) => (
                      <li key={`${s.placeId}-${i}`}>
                        <span className="font-medium">
                          {i + 1}. {s.name}
                        </span>
                        {s.isMain && <Badge variant="main" className="ml-1">{tc("mainBadge")}</Badge>}
                        <span className="text-muted-foreground"> · {tc("minutes", { n: s.stayMinutes })}</span>
                        <p className="text-xs text-muted-foreground">{s.note}</p>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <div className="sticky bottom-4 z-20">
        <Button size="lg" className="w-full shadow-lg" onClick={createPlan}>
          <Sparkles /> {t("createPlan", { n: selected.length + 1 })}
        </Button>
      </div>
    </div>
  );
}
