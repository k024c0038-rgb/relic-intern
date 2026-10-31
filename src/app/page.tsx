import { getTranslations } from "next-intl/server";
import { PlanForm, type PlanFormInitial } from "@/components/plan/plan-form";
import { getUser } from "@/lib/supabase/server";
import { MainPlaceSchema, PREFERENCES, TRANSPORTS, type DbRouteSpot, type Preference, type Transport } from "@/lib/types";
import { z } from "zod";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * 他のページからの遷移で、入力欄を最初から埋める：
 * - ?fromPlan=<id>  … 「再作成」（元の条件）
 * - ?fromPost=<id>  … 「このルートをもとにAIでプランを作成」
 * - ?mains=<JSON>&transport=… … 周辺おすすめページの「選んだスポットでプランを作成」
 */
async function initialValues(sp: Awaited<SearchParams>): Promise<PlanFormInitial> {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
  const initial: PlanFormInitial = {};
  const { supabase } = await getUser();

  const fromPlan = one("fromPlan");
  if (fromPlan) {
    const { data: plan } = await supabase.from("trip_plans").select("*").eq("id", fromPlan).maybeSingle();
    if (plan) {
      const { data: mains } = await supabase
        .from("plan_spots")
        .select("google_place_id, name")
        .eq("plan_id", fromPlan)
        .eq("is_main", true);
      Object.assign(initial, {
        destination: plan.destination,
        days: plan.days,
        startDate: plan.start_date,
        budget: plan.budget,
        transport: plan.transport,
        preferences: plan.preferences,
        language: plan.language,
        mainPlaces: (mains ?? []).map((m) => ({ placeId: m.google_place_id, name: m.name })),
      });
    }
  }

  const fromPost = one("fromPost");
  if (fromPost) {
    const { data: post } = await supabase.from("posts").select("*").eq("id", fromPost).eq("type", "route").maybeSingle();
    if (post) {
      const { data: spots } = await supabase
        .from("post_route_spots")
        .select("*")
        .eq("post_id", fromPost)
        .order("day")
        .order("order_index");
      Object.assign(initial, {
        destination: post.region,
        days: Math.min(post.days ?? 1, 7),
        transport: post.transport ?? undefined,
        budget: post.price,
        mainPlaces: ((spots ?? []) as DbRouteSpot[])
          .filter((s) => s.google_place_id)
          .slice(0, 5)
          .map((s) => ({ placeId: s.google_place_id!, name: s.name })),
      });
    }
  }

  const mains = one("mains");
  if (mains) {
    const parsed = z.array(MainPlaceSchema).max(5).safeParse(JSON.parse(mains));
    if (parsed.success) initial.mainPlaces = parsed.data;
  }
  const destination = one("destination");
  if (destination) initial.destination = destination;
  const transport = one("transport");
  if (TRANSPORTS.includes(transport as Transport)) initial.transport = transport as Transport;
  const prefs = one("preferences");
  if (prefs) initial.preferences = prefs.split(",").filter((p): p is Preference => PREFERENCES.includes(p as Preference));
  return initial;
}

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const t = await getTranslations("home");
  const initial = await initialValues(await searchParams).catch(() => ({}));
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-bold md:text-3xl">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </section>
      <PlanForm initial={initial} />
    </div>
  );
}
