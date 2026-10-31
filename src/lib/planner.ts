import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateJson, AiError } from "@/lib/ai";
import {
  categorize,
  computeTravelMinutes,
  getPlaces,
  latLng,
  nearbySearch,
  textSearch,
  type Place,
} from "@/lib/google";
import { SEARCH_RADIUS, type Candidate, type PlanRequest, type SpotCategory, type Transport } from "@/lib/types";
import { addMinutes, distanceMeters, toMinutes } from "@/lib/utils";
import { isMockAi } from "@/lib/mock/config";
import { mockCourses, mockPlan } from "@/lib/mock/ai";

const LANGUAGE_NAME = { ja: "日本語", zh: "简体中文", en: "English" } as const;
const TRANSPORT_NAME = { walk: "徒歩", transit: "電車・バス", car: "車" } as const;
const DAY_START = "09:00";
const DAY_END = "21:00";

// ------------------------------------------------------------
// 1〜3. 候補スポットを集める
// ------------------------------------------------------------

function toCandidate(p: Place, isMain: boolean): Candidate | null {
  const loc = latLng(p);
  if (!loc || !p.displayName?.text) return null;
  return {
    placeId: p.id,
    name: p.displayName.text,
    category: categorize(p),
    types: (p.types ?? []).slice(0, 5),
    lat: loc.lat,
    lng: loc.lng,
    rating: p.rating,
    userRatingCount: p.userRatingCount,
    priceLevel: p.priceLevel,
    isMain,
  };
}

export async function collectCandidates(
  supabase: SupabaseClient,
  req: Pick<PlanRequest, "destination" | "mainPlaces" | "transport" | "language" | "days">,
) {
  const lang = req.language;
  const byId = new Map<string, Candidate>();
  const add = (p: Place, isMain = false) => {
    if (byId.has(p.id)) {
      if (isMain) byId.get(p.id)!.isMain = true;
      return;
    }
    const c = toCandidate(p, isMain);
    if (c) byId.set(c.placeId, c);
  };

  // 1. メイン観光地（なければ行き先の人気スポット）
  const mainPlaces = await getPlaces(
    req.mainPlaces.map((m) => m.placeId),
    lang,
  );
  const mains = [...mainPlaces.values()].filter((p): p is Place => !!p);
  mains.forEach((p) => add(p, true));

  let centers = mains.map(latLng).filter((l): l is { lat: number; lng: number } => !!l);
  if (centers.length === 0) {
    const popular = await textSearch(`${req.destination} 観光スポット`, lang, 20);
    popular.forEach((p) => add(p));
    centers = popular
      .slice(0, 2)
      .map(latLng)
      .filter((l): l is { lat: number; lng: number } => !!l);
  }
  if (centers.length === 0) throw new PlannerError("destination_not_found");

  // 2. 周辺の観光地・飲食店・宿（移動手段に合わせた範囲）
  const radius = SEARCH_RADIUS[req.transport];
  const categories: Exclude<SpotCategory, "other">[] = ["sightseeing", "food"];
  if (req.days > 1) categories.push("stay");
  const searches = centers.slice(0, 3).flatMap((center) =>
    categories.map((cat) =>
      nearbySearch(center, radius, cat, lang, cat === "stay" ? 10 : 15).catch((e) => {
        console.error("nearbySearch failed", e);
        return [] as Place[];
      }),
    ),
  );
  (await Promise.all(searches)).flat().forEach((p) => add(p));

  const candidates = [...byId.values()];

  // 3. 投稿の評価・いいね数、ルート投稿で一緒に回られた回数
  const ids = candidates.map((c) => c.placeId);
  const { data: stats } = await supabase.rpc("get_place_post_stats", { place_ids: ids });
  for (const s of (stats ?? []) as {
    google_place_id: string;
    post_count: number;
    avg_rating: number | null;
    like_count: number;
    route_count: number;
  }[]) {
    const c = byId.get(s.google_place_id);
    if (c)
      c.postStats = {
        postCount: Number(s.post_count),
        avgRating: s.avg_rating == null ? null : Number(s.avg_rating),
        likeCount: Number(s.like_count),
        routeCount: Number(s.route_count),
      };
  }
  const coVisits = await Promise.all(
    mains.map((m) => supabase.rpc("get_co_visited_spots", { target_place_id: m.id }).then((r) => r.data ?? [])),
  );
  for (const row of coVisits.flat() as { google_place_id: string; visit_count: number }[]) {
    const c = byId.get(row.google_place_id);
    if (c) c.coVisitCount = (c.coVisitCount ?? 0) + Number(row.visit_count);
  }

  return { candidates, centers };
}

export class PlannerError extends Error {}

// ------------------------------------------------------------
// 4. AI にスケジュールを作らせる（候補の中からだけ選ぶ）
// ------------------------------------------------------------

const AiPlanSchema = z.object({
  title: z.string().describe("プランのタイトル（例：秋の京都 寺社めぐり2日間）"),
  summary: z.string().describe("プラン全体の説明（2〜3文）"),
  days: z.array(
    z.object({
      day: z.number().int(),
      spots: z.array(
        z.object({
          place_id: z.string().describe("候補リストの place_id をそのまま使う"),
          start_time: z.string().describe("到着予定時刻 HH:MM（24時間表記）"),
          stay_minutes: z.number().int(),
          estimated_cost: z.number().int().describe("1人あたりの目安の費用（円）。入場料・食事代・宿泊費など"),
          description: z.string().describe("おすすめの理由や過ごし方（1〜2文）"),
        }),
      ),
    }),
  ),
});
export type AiPlan = z.infer<typeof AiPlanSchema>;

function candidatesForPrompt(candidates: Candidate[], origin?: { lat: number; lng: number }) {
  return candidates.map((c) => ({
    place_id: c.placeId,
    name: c.name,
    category: c.category,
    is_main: c.isMain,
    google_rating: c.rating,
    google_reviews: c.userRatingCount,
    price_level: c.priceLevel,
    km_from_main: origin ? Math.round(distanceMeters(origin, c) / 100) / 10 : undefined,
    user_posts: c.postStats,
    co_visited_with_main: c.coVisitCount,
  }));
}

function validatePlan(plan: AiPlan, candidates: Candidate[], req: PlanRequest) {
  const errors: string[] = [];
  const ids = new Set(candidates.map((c) => c.placeId));
  const used = new Set<string>();
  for (const d of plan.days) {
    if (d.day < 1 || d.day > req.days) errors.push(`day ${d.day} は 1〜${req.days} の範囲外です`);
    for (const s of d.spots) {
      if (!ids.has(s.place_id)) errors.push(`place_id "${s.place_id}" は候補リストにありません`);
      if (!/^\d{2}:\d{2}$/.test(s.start_time)) errors.push(`start_time "${s.start_time}" が HH:MM 形式ではありません`);
      const c = candidates.find((x) => x.placeId === s.place_id);
      if (c && c.category !== "stay" && used.has(s.place_id)) errors.push(`"${c.name}" が重複しています`);
      used.add(s.place_id);
    }
  }
  for (const m of req.mainPlaces) {
    if (ids.has(m.placeId) && !used.has(m.placeId)) errors.push(`メイン観光地 "${m.name}" (${m.placeId}) が含まれていません`);
  }
  return errors;
}

export async function askAiForPlan(req: PlanRequest, candidates: Candidate[], centers: { lat: number; lng: number }[]) {
  // Claude API のキーがない場合は、ルールでプランを組み立てる（デモモード）
  if (isMockAi()) return mockPlan(req, candidates, centers);

  const system = `あなたは日本旅行のプランナーです。ユーザーの条件に合わせて、効率よく回れる1日ごとのスケジュールを作ります。

厳守するルール:
- スポットは必ず「候補リスト」の中からだけ選び、place_id は候補リストの値をそのまま使うこと。リストにない場所を考えてはいけない。
- is_main が true のスポット（ユーザーが必ず行きたいメイン観光地）は必ず含め、十分な滞在時間を先に確保し、その前後に近くの周辺スポットを配置すること。
- 移動が少なくなるよう、近いスポット同士をまとめて順番を決めること（km_from_main を参考に）。
- 1日はおおむね ${DAY_START}〜${DAY_END} の間に収め、昼食（11:30〜13:30頃）と夕食（18:00〜20:00頃）に category=food のスポットを入れること。
- 複数日の場合、各日（最終日を除く）の最後に category=stay の宿を1つ入れること（同じ宿を連泊してもよい）。
- 予算が指定されている場合、estimated_cost の合計（宿泊費を含む1人あたり）が予算を超えないようにすること。
- user_posts（実際に行った人の投稿の評価・いいね数）や co_visited_with_main（メインと一緒に回られた回数）が多いスポットを優先してよい。
- title・summary・description は ${LANGUAGE_NAME[req.language]} で書くこと。`;

  const user = {
    conditions: {
      destination: req.destination,
      days: req.days,
      start_date: req.startDate,
      budget_yen: req.budget,
      transport: TRANSPORT_NAME[req.transport],
      preferences: req.preferences,
      main_places: req.mainPlaces,
    },
    candidates: candidatesForPrompt(candidates, centers[0]),
  };

  const messages: Parameters<typeof generateJson>[0]["messages"] = [
    { role: "user", content: `次の条件と候補リストから旅行プランを作ってください。\n\n${JSON.stringify(user)}` },
  ];

  let plan = await generateJson({ schema: AiPlanSchema, system, messages, effort: "medium" });
  let errors = validatePlan(plan, candidates, req);

  // 5. zod でのチェックに加え、候補にないスポットが混ざっていたら1回だけ作り直させる
  if (errors.length > 0) {
    messages.push({ role: "assistant", content: JSON.stringify(plan) });
    messages.push({
      role: "user",
      content: `次の問題があります。候補リストだけを使って修正したプラン全体をもう一度返してください。\n- ${errors.join("\n- ")}`,
    });
    plan = await generateJson({ schema: AiPlanSchema, system, messages, effort: "medium" });
    errors = validatePlan(plan, candidates, req);
  }

  // それでも残る不正なスポットは取り除く（ハルシネーション対策）
  const ids = new Set(candidates.map((c) => c.placeId));
  plan.days = plan.days
    .filter((d) => d.day >= 1 && d.day <= req.days)
    .map((d) => ({ ...d, spots: d.spots.filter((s) => ids.has(s.place_id) && /^\d{2}:\d{2}$/.test(s.start_time)) }));
  if (plan.days.every((d) => d.spots.length === 0)) throw new AiError("empty_plan");
  return plan;
}

// ------------------------------------------------------------
// 5. 実際の移動時間を計算し、時間が足りなければスポットを減らす
// ------------------------------------------------------------

export type ScheduledSpot = {
  placeId: string;
  name: string;
  category: SpotCategory;
  isMain: boolean;
  day: number;
  orderIndex: number;
  startTime: string;
  stayMinutes: number;
  travelMinutes: number;
  estimatedCost: number;
  description: string;
};

export async function scheduleWithRoutes(plan: AiPlan, candidates: Candidate[], req: PlanRequest) {
  const byId = new Map(candidates.map((c) => [c.placeId, c]));
  const result: ScheduledSpot[] = [];

  for (const day of [...plan.days].sort((a, b) => a.day - b.day)) {
    let spots = day.spots.map((s) => ({ ...s, c: byId.get(s.place_id)! }));
    const dayDate = req.startDate ? new Date(`${req.startDate}T00:00:00+09:00`) : undefined;
    if (dayDate) dayDate.setDate(dayDate.getDate() + day.day - 1);

    for (let attempt = 0; attempt < 10; attempt++) {
      const legs = await Promise.all(
        spots.map((s, i) => {
          if (i === 0) return Promise.resolve({ minutes: 0, estimated: false });
          const prev = spots[i - 1];
          const departure = dayDate ? new Date(dayDate.getTime() + toMinutes(prev.start_time) * 60000) : undefined;
          return computeTravelMinutes(prev.c, s.c, req.transport, departure);
        }),
      );

      // 実際の移動時間で到着時刻を組み直す（AIの時刻より早くはしない＝食事時間などを保つ）
      let clock = spots[0]?.start_time ?? DAY_START;
      const timed = spots.map((s, i) => {
        if (i > 0) {
          const arrival = addMinutes(clock, legs[i].minutes);
          clock = toMinutes(arrival) > toMinutes(s.start_time) ? arrival : s.start_time;
        }
        const startTime = clock;
        clock = addMinutes(clock, s.c.category === "stay" ? 0 : s.stay_minutes);
        return { ...s, startTime, travel: legs[i].minutes };
      });

      const lastActivity = [...timed].reverse().find((s) => s.c.category !== "stay");
      const endOfDay = lastActivity ? toMinutes(lastActivity.startTime) + lastActivity.stay_minutes : 0;
      const lastStay = timed.find((s) => s.c.category === "stay");
      const overflow = endOfDay > toMinutes(DAY_END) || (lastStay && toMinutes(lastStay.startTime) > toMinutes("23:00"));

      const commit = () =>
        timed.forEach((s, i) =>
          result.push({
            placeId: s.place_id,
            name: s.c.name,
            category: s.c.category,
            isMain: s.c.isMain,
            day: day.day,
            orderIndex: i,
            startTime: s.startTime,
            stayMinutes: s.c.category === "stay" ? 0 : s.stay_minutes,
            travelMinutes: s.travel,
            estimatedCost: Math.max(0, s.estimated_cost),
            description: s.description,
          }),
        );

      if (!overflow) {
        commit();
        break;
      }

      // 時間が足りない：メイン・宿以外で、評価の低い観光スポットから減らす（食事は最後まで残す）
      const removable = spots
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => !s.c.isMain && s.c.category !== "stay")
        .sort((a, b) => {
          const pa = a.s.c.category === "food" ? 1 : 0;
          const pb = b.s.c.category === "food" ? 1 : 0;
          if (pa !== pb) return pa - pb;
          return (a.s.c.rating ?? 0) - (b.s.c.rating ?? 0);
        });
      if (removable.length === 0) {
        // これ以上減らせない場合は、メインの滞在時間を優先したまま確定する
        commit();
        break;
      }
      spots = spots.filter((_, i) => i !== removable[0].i);
    }
  }
  return result;
}

// ------------------------------------------------------------
// 全体の流れ
// ------------------------------------------------------------

export async function createPlan(supabase: SupabaseClient, userId: string, req: PlanRequest) {
  const { candidates, centers } = await collectCandidates(supabase, req);
  const aiPlan = await askAiForPlan(req, candidates, centers);
  const spots = await scheduleWithRoutes(aiPlan, candidates, req);

  const { data: plan, error } = await supabase
    .from("trip_plans")
    .insert({
      user_id: userId,
      title: aiPlan.title,
      summary: aiPlan.summary,
      destination: req.destination,
      start_date: req.startDate,
      days: req.days,
      budget: req.budget,
      transport: req.transport,
      preferences: req.preferences,
      language: req.language,
    })
    .select("id")
    .single();
  if (error || !plan) throw error ?? new Error("failed to insert plan");

  const { error: spotError } = await supabase.from("plan_spots").insert(
    spots.map((s) => ({
      plan_id: plan.id,
      google_place_id: s.placeId,
      is_main: s.isMain,
      day: s.day,
      order_index: s.orderIndex,
      name: s.name,
      category: s.category,
      description: s.description,
      start_time: s.startTime,
      stay_minutes: s.stayMinutes,
      travel_minutes: s.travelMinutes,
      estimated_cost: s.estimatedCost,
    })),
  );
  if (spotError) throw spotError;
  return plan.id as string;
}

// ------------------------------------------------------------
// 周辺おすすめページ：AIおすすめルート（半日／1日）
// ------------------------------------------------------------

const AiCourseSchema = z.object({
  courses: z.array(
    z.object({
      kind: z.enum(["half_day", "full_day"]),
      title: z.string(),
      spots: z.array(
        z.object({
          place_id: z.string(),
          stay_minutes: z.number().int(),
          note: z.string(),
        }),
      ),
    }),
  ),
});

export async function suggestCourses(
  supabase: SupabaseClient,
  main: { placeId: string; name: string },
  transport: Transport,
  language: PlanRequest["language"],
) {
  const { candidates, centers } = await collectCandidates(supabase, {
    destination: main.name,
    mainPlaces: [main],
    transport,
    language,
    days: 1,
  });
  const ids = new Set(candidates.map((c) => c.placeId));
  const result = isMockAi()
    ? { courses: mockCourses(candidates, language) }
    : await generateJson({
        schema: AiCourseSchema,
        effort: "low",
        system: `あなたは日本旅行のプランナーです。メイン観光地を中心にした「半日コース（half_day、約4時間）」と「1日コース（full_day、約8時間）」を1つずつ作ります。
- スポットは必ず候補リストの中からだけ選び、place_id はそのまま使うこと。
- どちらのコースにも is_main のスポットを必ず含めること。
- 移動が少ない順番にし、1日コースには昼食（category=food）を入れること。宿（stay）は入れないこと。
- title と note は ${LANGUAGE_NAME[language]} で書くこと。`,
        messages: [
          {
            role: "user",
            content: JSON.stringify({ transport: TRANSPORT_NAME[transport], candidates: candidatesForPrompt(candidates, centers[0]) }),
          },
        ],
      });
  const byId = new Map(candidates.map((c) => [c.placeId, c]));
  return result.courses.map((course) => {
    const spots = course.spots.filter((s) => ids.has(s.place_id));
    return {
      kind: course.kind,
      title: course.title,
      spots: spots.map((s, i) => {
        const c = byId.get(s.place_id)!;
        return {
          placeId: c.placeId,
          name: c.name,
          category: c.category,
          isMain: c.isMain,
          stayMinutes: s.stay_minutes,
          note: s.note,
          lat: c.lat,
          lng: c.lng,
          order: i,
        };
      }),
    };
  });
}
