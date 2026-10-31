"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PlaceAutocomplete } from "@/components/place-autocomplete";
import { createPost, type PostInput } from "@/app/posts/new/actions";
import { uploadOriginalPhoto } from "@/lib/upload";
import { MOCK_SUPABASE } from "@/lib/mock/config";
import { POST_TYPES, TRANSPORTS, type Locale, type PostType, type Transport } from "@/lib/types";
import { cn } from "@/lib/utils";

export type RouteSpotDraft = { key: string; name: string; placeId: string | null; day: number; travelMinutes: number | null };

function Stars({ value, onChange }: { value: number | null; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n}`}
          onClick={() => onChange(n)}
          className={cn("text-2xl", value && n <= value ? "text-amber-500" : "text-stone-300")}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function PostForm({
  initial,
}: {
  initial?: { type?: PostType; title?: string; region?: string; days?: number; transport?: Transport; price?: number | null; planId?: string; routeSpots?: RouteSpotDraft[] };
}) {
  const t = useTranslations("newPost");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const router = useRouter();

  const [type, setType] = useState<PostType>(initial?.type ?? "food");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [region, setRegion] = useState(initial?.region ?? "");
  const [body, setBody] = useState("");
  const [place, setPlace] = useState<{ placeId: string | null; name: string }>({ placeId: null, name: "" });
  const [dishName, setDishName] = useState("");
  const [highlights, setHighlights] = useState("");
  const [price, setPrice] = useState(initial?.price?.toString() ?? "");
  const [rating, setRating] = useState<number | null>(null);
  const [days, setDays] = useState(initial?.days ?? 1);
  const [transport, setTransport] = useState<Transport>(initial?.transport ?? "transit");
  const [routeSpots, setRouteSpots] = useState<RouteSpotDraft[]>(initial?.routeSpots ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function move(i: number, dir: -1 | 1) {
    setRouteSpots((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const folder = `posts/${crypto.randomUUID()}`;
      const photos = [];
      for (const f of files.slice(0, 10)) photos.push(await uploadOriginalPhoto(f, folder));
      const input: PostInput = {
        type,
        title,
        region,
        body,
        language: locale,
        placeName: place.name || null,
        placeId: place.placeId,
        dishName: dishName || null,
        highlights: highlights || null,
        price: price ? Number(price) : null,
        rating,
        days: type === "route" ? days : null,
        transport: type === "route" ? transport : null,
        planId: initial?.planId ?? null,
        routeSpots: type === "route" ? routeSpots.map(({ key: _key, ...s }) => s) : [],
        photos: photos.map((p) => ({ path: p.path, takenAt: p.takenAt })),
      };
      const res = await createPost(input);
      if ("error" in res) {
        if (res.error === "login_required") return router.push("/login?next=/posts/new");
        throw new Error(res.error);
      }
      router.push(`/posts/${res.id}`);
    } catch {
      setError(tc("error"));
      setSubmitting(false);
    }
  }

  const placeLabel = type === "food" ? t("foodPlace") : t("stayPlace");

  return (
    <form onSubmit={submit} className="space-y-4">
      <Card>
        <CardContent className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>{t("type")}</Label>
            <div className="flex gap-2">
              {POST_TYPES.map((ty) => (
                <Button key={ty} type="button" size="sm" variant={type === ty ? "default" : "outline"} onClick={() => setType(ty)}>
                  {tc(`postType.${ty}`)}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="title">{t("postTitle")}</Label>
            <Input id="title" required maxLength={100} value={title} placeholder={t("postTitlePlaceholder")} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="region">{t("region")}</Label>
            <Input id="region" required maxLength={50} value={region} onChange={(e) => setRegion(e.target.value)} />
          </div>

          {type !== "route" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="place">{placeLabel}</Label>
                {place.placeId ? (
                  <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <span>{place.name}</span>
                    <button type="button" onClick={() => setPlace({ placeId: null, name: "" })}>
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ) : (
                  <PlaceAutocomplete id="place" placeholder={t("searchPlace")} onSelect={(s) => setPlace({ placeId: s.placeId, name: s.name })} />
                )}
              </div>
              {type === "food" && (
                <div className="space-y-2">
                  <Label htmlFor="dish">{t("dish")}</Label>
                  <Input id="dish" maxLength={100} value={dishName} onChange={(e) => setDishName(e.target.value)} />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="price">{type === "food" ? t("price") : t("nightPrice")}</Label>
                <Input id="price" type="number" min={0} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{type === "food" ? t("recommend") : t("valueRating")}</Label>
                <Stars value={rating} onChange={setRating} />
              </div>
              {type === "stay" && (
                <div className="space-y-2">
                  <Label htmlFor="highlights">{t("highlights")}</Label>
                  <Textarea id="highlights" maxLength={1000} value={highlights} onChange={(e) => setHighlights(e.target.value)} />
                </div>
              )}
            </>
          )}

          {type === "route" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="days">{t("routeDays")}</Label>
                  <Input id="days" type="number" min={1} max={30} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value)))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="transport">{t("routeTransport")}</Label>
                  <Select id="transport" value={transport} onChange={(e) => setTransport(e.target.value as Transport)}>
                    {TRANSPORTS.map((m) => (
                      <option key={m} value={m}>
                        {tc(`transport.${m}`)}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("routeSpots")}</Label>
                <ol className="space-y-2">
                  {routeSpots.map((s, i) => (
                    <li key={s.key} className="flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-sm">
                      <Select
                        className="h-8 w-20"
                        value={s.day}
                        aria-label={t("routeDays")}
                        onChange={(e) =>
                          setRouteSpots((prev) => prev.map((x) => (x.key === s.key ? { ...x, day: Number(e.target.value) } : x)))
                        }
                      >
                        {Array.from({ length: days }, (_, d) => d + 1).map((d) => (
                          <option key={d} value={d}>
                            D{d}
                          </option>
                        ))}
                      </Select>
                      <span className="flex-1">
                        {i + 1}. {s.name}
                      </span>
                      <Button type="button" size="icon" variant="ghost" aria-label={t("up")} onClick={() => move(i, -1)}>
                        <ArrowUp />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" aria-label={t("down")} onClick={() => move(i, 1)}>
                        <ArrowDown />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={t("remove")}
                        onClick={() => setRouteSpots((prev) => prev.filter((x) => x.key !== s.key))}
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  ))}
                </ol>
                <PlaceAutocomplete
                  placeholder={t("addSpot")}
                  onSelect={(p) =>
                    setRouteSpots((prev) => [
                      ...prev,
                      { key: crypto.randomUUID(), name: p.name, placeId: p.placeId, day: prev.at(-1)?.day ?? 1, travelMinutes: null },
                    ])
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="total">{t("totalCost")}</Label>
                <Input id="total" type="number" min={0} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="body">{t("body")}</Label>
            <Textarea id="body" rows={6} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="photos">{t("photos")}</Label>
            <p className="text-xs text-muted-foreground">{MOCK_SUPABASE ? tc("demoPhotos") : t("photosHelp")}</p>
            <Input
              disabled={MOCK_SUPABASE}
              id="photos"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 10))}
            />
            {files.length > 0 && <p className="text-xs">{files.map((f) => f.name).join(", ")}</p>}
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={submitting}>
        {submitting && <Loader2 className="animate-spin" />}
        {submitting ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
