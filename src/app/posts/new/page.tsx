import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getUser } from "@/lib/supabase/server";
import type { DbPlanSpot, DbTripPlan } from "@/lib/types";
import { PostForm, type RouteSpotDraft } from "@/components/posts/post-form";

type SearchParams = Promise<{ fromPlan?: string }>;

export default async function NewPostPage({ searchParams }: { searchParams: SearchParams }) {
  const { fromPlan } = await searchParams;
  const t = await getTranslations("newPost");
  const { supabase, user } = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(fromPlan ? `/posts/new?fromPlan=${fromPlan}` : "/posts/new")}`);

  // 「このプランで旅行した」から開いた場合は、プランのスポットと順番を最初から入力しておく
  let initial: Parameters<typeof PostForm>[0]["initial"];
  let plan: DbTripPlan | null = null;
  if (fromPlan) {
    const { data } = await supabase.from("trip_plans").select("*").eq("id", fromPlan).maybeSingle<DbTripPlan>();
    plan = data;
    if (plan) {
      const { data: spots } = await supabase
        .from("plan_spots")
        .select("*")
        .eq("plan_id", plan.id)
        .order("day")
        .order("order_index");
      const list = (spots ?? []) as DbPlanSpot[];
      initial = {
        type: "route",
        title: plan.title,
        region: plan.destination,
        days: plan.days,
        transport: plan.transport,
        price: list.reduce((sum, s) => sum + s.estimated_cost, 0),
        planId: plan.user_id === user.id ? plan.id : undefined,
        routeSpots: list.map<RouteSpotDraft>((s) => ({
          key: s.id,
          name: s.name,
          placeId: s.google_place_id,
          day: s.day,
          travelMinutes: s.travel_minutes,
        })),
      };
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      {plan && <p className="rounded-md bg-amber-50 p-3 text-sm">{t("fromPlan", { title: plan.title })}</p>}
      <PostForm initial={initial} />
    </div>
  );
}
