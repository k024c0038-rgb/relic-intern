import type { AiPlan } from "@/lib/planner";
import type { Candidate, Locale, PlanRequest } from "@/lib/types";
import { distanceMeters } from "@/lib/utils";

/**
 * Claude API の代わりに、ルールでプランを組み立てる（デモモード用）。
 * AI版と同じく、候補リストの中からだけスポットを選ぶ。
 */

const TEXT = {
  ja: {
    title: (d: string, n: number) => `${d} ${n}日間 おすすめプラン`,
    summary: (mains: string) =>
      mains ? `${mains}を中心に、近くの観光スポットと食事を組み合わせたプランです。` : "人気の観光スポットと食事を、移動が少ない順に組み合わせたプランです。",
    main: (n: string) => `今回のメイン。${n}は時間に余裕をもって見学しましょう。`,
    sight: (n: string) => `近くにある${n}にも立ち寄ります。`,
    lunch: (n: string) => `昼食は${n}で。`,
    dinner: (n: string) => `夕食は${n}で。`,
    stay: (n: string) => `今夜の宿は${n}です。`,
  },
  en: {
    title: (d: string, n: number) => `${n}-day ${d} trip`,
    summary: (mains: string) =>
      mains ? `A plan centered on ${mains}, combined with nearby sights and meals.` : "Popular sights and meals, ordered to keep travel short.",
    main: (n: string) => `Your must-visit. Take your time at ${n}.`,
    sight: (n: string) => `Stop by ${n}, which is nearby.`,
    lunch: (n: string) => `Lunch at ${n}.`,
    dinner: (n: string) => `Dinner at ${n}.`,
    stay: (n: string) => `Tonight's stay: ${n}.`,
  },
  zh: {
    title: (d: string, n: number) => `${d}${n}日游推荐行程`,
    summary: (mains: string) => (mains ? `以${mains}为中心，搭配周边景点和美食的行程。` : "按移动距离最短的顺序，组合热门景点和美食的行程。"),
    main: (n: string) => `本次的主要景点，请在${n}慢慢参观。`,
    sight: (n: string) => `顺路参观附近的${n}。`,
    lunch: (n: string) => `午餐在${n}。`,
    dinner: (n: string) => `晚餐在${n}。`,
    stay: (n: string) => `今晚入住${n}。`,
  },
} satisfies Record<Locale, unknown>;

/** 基準点から近い順に並べる（貪欲法で移動を短くする） */
function nearestOrder<T extends { lat: number; lng: number }>(start: { lat: number; lng: number }, items: T[]) {
  const rest = [...items];
  const ordered: T[] = [];
  let cur = start;
  while (rest.length) {
    rest.sort((a, b) => distanceMeters(cur, a) - distanceMeters(cur, b));
    const next = rest.shift()!;
    ordered.push(next);
    cur = next;
  }
  return ordered;
}

const fmt = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const sightCost = (c: Candidate) => (c.types.includes("museum") ? 1000 : c.types.includes("place_of_worship") ? 500 : 0);

export function mockPlan(req: PlanRequest, candidates: Candidate[], centers: { lat: number; lng: number }[]): AiPlan {
  const t = TEXT[req.language];
  const center = centers[0];
  const byDistance = (list: Candidate[]) => [...list].sort((a, b) => distanceMeters(center, a) - distanceMeters(center, b));
  const mains = candidates.filter((c) => c.isMain);
  const sights = byDistance(candidates.filter((c) => !c.isMain && c.category === "sightseeing"));
  const foods = byDistance(candidates.filter((c) => !c.isMain && c.category === "food"));
  const stays = byDistance(candidates.filter((c) => c.category === "stay"));

  const days: AiPlan["days"] = [];
  for (let d = 1; d <= req.days; d++) {
    const dayMains = mains.filter((_, i) => i % req.days === d - 1);
    const daySights = [...dayMains, ...sights.splice(0, Math.max(0, 4 - dayMains.length))];
    const anchor = dayMains[0] ?? daySights[0] ?? center;
    const ordered = nearestOrder(anchor, daySights);
    const morning = ordered.slice(0, 2);
    const afternoon = ordered.slice(2);

    const spots: AiPlan["days"][number]["spots"] = [];
    let clock = 9 * 60;
    const addSight = (c: Candidate) => {
      const stay = c.isMain ? 120 : c.types.includes("museum") ? 90 : 60;
      spots.push({
        place_id: c.placeId,
        start_time: fmt(clock),
        stay_minutes: stay,
        estimated_cost: sightCost(c),
        description: c.isMain ? t.main(c.name) : t.sight(c.name),
      });
      clock += stay + 20;
    };

    morning.forEach(addSight);
    const lunch = foods.shift();
    if (lunch) {
      clock = Math.max(clock, 12 * 60);
      spots.push({ place_id: lunch.placeId, start_time: fmt(clock), stay_minutes: 60, estimated_cost: 1500, description: t.lunch(lunch.name) });
      clock += 80;
    }
    afternoon.forEach(addSight);
    const dinner = foods.shift();
    if (dinner) {
      clock = Math.max(clock, 18 * 60 + 30);
      spots.push({ place_id: dinner.placeId, start_time: fmt(clock), stay_minutes: 90, estimated_cost: 3500, description: t.dinner(dinner.name) });
      clock += 110;
    }
    const hotel = stays[0];
    if (d < req.days && hotel) {
      spots.push({ place_id: hotel.placeId, start_time: fmt(Math.max(clock, 20 * 60 + 30)), stay_minutes: 0, estimated_cost: 15000, description: t.stay(hotel.name) });
    }
    days.push({ day: d, spots });
  }

  return {
    title: t.title(req.destination, req.days),
    summary: t.summary(mains.map((m) => m.name).join("・")),
    days,
  };
}

export function mockCourses(candidates: Candidate[], language: Locale) {
  const t = TEXT[language];
  const main = candidates.find((c) => c.isMain);
  if (!main) return [];
  const sights = nearestOrder(main, candidates.filter((c) => !c.isMain && c.category === "sightseeing")).slice(0, 3);
  const lunch = candidates.filter((c) => c.category === "food").sort((a, b) => distanceMeters(main, a) - distanceMeters(main, b))[0];
  const entry = (c: Candidate, stay: number, note: string) => ({ place_id: c.placeId, stay_minutes: stay, note });
  const label = { ja: ["半日で", "1日で"], en: ["Half day:", "Full day:"], zh: ["半日游：", "一日游："] }[language];
  return [
    {
      kind: "half_day" as const,
      title: `${label[0]} ${main.name}`,
      spots: [entry(main, 90, t.main(main.name)), ...sights.slice(0, 2).map((s) => entry(s, 45, t.sight(s.name)))],
    },
    {
      kind: "full_day" as const,
      title: `${label[1]} ${main.name}`,
      spots: [
        entry(main, 120, t.main(main.name)),
        ...(sights[0] ? [entry(sights[0], 60, t.sight(sights[0].name))] : []),
        ...(lunch ? [entry(lunch, 60, t.lunch(lunch.name))] : []),
        ...sights.slice(1).map((s) => entry(s, 60, t.sight(s.name))),
      ],
    },
  ];
}

export function mockTranslate<T extends { body: string }>(post: T, target: Locale): T {
  const note = {
    ja: "（デモモード：翻訳APIに接続していないため、原文を表示しています）",
    en: "(Demo mode: the translation API is not connected, so the original text is shown.)",
    zh: "（演示模式：未连接翻译API，显示原文）",
  }[target];
  return { ...post, body: `${note}\n\n${post.body}` };
}
