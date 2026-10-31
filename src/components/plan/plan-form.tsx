"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, MapPin, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PlaceAutocomplete } from "@/components/place-autocomplete";
import { LOCALES, PREFERENCES, TRANSPORTS, type Locale, type MainPlace, type PlanRequest } from "@/lib/types";
import { cn } from "@/lib/utils";

export type PlanFormInitial = Partial<Omit<PlanRequest, "language">> & { language?: Locale };

export function PlanForm({ initial }: { initial: PlanFormInitial }) {
  const t = useTranslations("home");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const router = useRouter();

  const [destination, setDestination] = useState(initial.destination ?? "");
  const [mainPlaces, setMainPlaces] = useState<MainPlace[]>(initial.mainPlaces ?? []);
  const [days, setDays] = useState(initial.days ?? 2);
  const [startDate, setStartDate] = useState(initial.startDate ?? "");
  const [budget, setBudget] = useState(initial.budget?.toString() ?? "");
  const [transport, setTransport] = useState(initial.transport ?? "transit");
  const [preferences, setPreferences] = useState<string[]>(initial.preferences ?? []);
  const [language, setLanguage] = useState<Locale>(initial.language ?? locale);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!destination.trim()) {
      setError(t("destinationRequired"));
      return;
    }
    setError(null);
    setLoading(true);
    const body: PlanRequest = {
      destination: destination.trim(),
      mainPlaces,
      days,
      startDate: startDate || null,
      budget: budget ? Number(budget) : null,
      transport,
      preferences: preferences as PlanRequest["preferences"],
      language,
    };
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        router.push(`/login?next=${encodeURIComponent("/")}`);
        return;
      }
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error);
      router.push(`/plan/${data.id}`);
    } catch {
      setError(tc("error"));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <CardContent className="grid gap-5 pt-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="destination">{t("destination")}</Label>
            <Input
              id="destination"
              value={destination}
              placeholder={t("destinationPlaceholder")}
              onChange={(e) => setDestination(e.target.value)}
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="main">{t("mainPlaces")}</Label>
            <PlaceAutocomplete
              id="main"
              placeholder={t("mainPlacesPlaceholder")}
              onSelect={(s) =>
                setMainPlaces((prev) =>
                  prev.some((p) => p.placeId === s.placeId) || prev.length >= 5
                    ? prev
                    : [...prev, { placeId: s.placeId, name: s.name }],
                )
              }
            />
            <p className="text-xs text-muted-foreground">{t("mainPlacesHelp")}</p>
            <div className="flex flex-wrap gap-2">
              {mainPlaces.map((p) => (
                <span key={p.placeId} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-sm">
                  ★ {p.name}
                  <button
                    type="button"
                    aria-label="remove"
                    onClick={() => setMainPlaces((prev) => prev.filter((x) => x.placeId !== p.placeId))}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="days">{t("days")}</Label>
              <Select id="days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {t("daysValue", { n })}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="start">{t("startDate")}</Label>
              <Input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="budget">{t("budget")}</Label>
            <Input
              id="budget"
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              value={budget}
              placeholder={t("budgetPlaceholder")}
              onChange={(e) => setBudget(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("transport")}</Label>
            <div className="flex gap-2">
              {TRANSPORTS.map((m) => (
                <Button
                  key={m}
                  type="button"
                  variant={transport === m ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTransport(m)}
                >
                  {tc(`transport.${m}`)}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lang">{t("language")}</Label>
            <Select id="lang" value={language} onChange={(e) => setLanguage(e.target.value as Locale)}>
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {tc(`language.${l}`)}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>{t("preferences")}</Label>
            <div className="flex flex-wrap gap-2">
              {PREFERENCES.map((p) => {
                const active = preferences.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPreferences((prev) => (active ? prev.filter((x) => x !== p) : [...prev, p]))}
                    className={cn(
                      "rounded-full border px-3 py-1 text-sm transition-colors",
                      active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                    )}
                  >
                    {tc(`preference.${p}`)}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <Card>
          <CardContent className="flex items-center gap-3 pt-4">
            <Loader2 className="size-6 animate-spin text-primary" />
            <div>
              <p className="font-medium">{t("generating")}</p>
              <p className="text-sm text-muted-foreground">{t("generatingHint")}</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="submit" size="lg" className="sm:flex-1">
            <Sparkles /> {t("submit")}
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="sm:flex-1"
            disabled={mainPlaces.length === 0}
            title={mainPlaces.length === 0 ? t("nearbyHelp") : undefined}
            onClick={() => router.push(`/nearby/${encodeURIComponent(mainPlaces[0].placeId)}?transport=${transport}`)}
          >
            <MapPin /> {t("nearby")}
          </Button>
        </div>
      )}
    </form>
  );
}
