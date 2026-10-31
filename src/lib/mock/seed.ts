/**
 * デモモードのサンプルデータ（Supabase の代わり）。
 * 投稿はすべて動作確認用のサンプルで、本文にもその旨を書いている。写真は付けない（実際の写真のみを使うルールのため）。
 */

export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";
const TRAVELER_ID = "00000000-0000-4000-8000-000000000002";
const TRAVELER2_ID = "00000000-0000-4000-8000-000000000003";

const SAMPLE = "※デモモード用のサンプル投稿です。";
const at = (d: string) => `${d}T10:00:00+09:00`;

const post = (p: Record<string, unknown>) => ({
  body: "",
  place_name: null,
  dish_name: null,
  highlights: null,
  google_place_id: null,
  price: null,
  rating: null,
  days: null,
  transport: null,
  language: "ja",
  plan_id: null,
  ...p,
});

export const SEED: Record<string, Record<string, unknown>[]> = {
  profiles: [
    { id: DEMO_USER_ID, display_name: "デモユーザー", language: "ja", is_premium: false, created_at: at("2026-10-01") },
    { id: TRAVELER_ID, display_name: "旅人さくら", language: "ja", is_premium: false, created_at: at("2026-09-01") },
    { id: TRAVELER2_ID, display_name: "Alex", language: "en", is_premium: false, created_at: at("2026-09-05") },
  ],
  posts: [
    post({
      id: "10000000-0000-4000-8000-000000000001",
      user_id: TRAVELER_ID,
      type: "route",
      title: "清水寺から祇園へ、東山を歩く1日",
      region: "京都",
      body: `朝いちばんに清水寺へ。産寧坂を下って八坂神社、最後は花見小路を散歩しました。坂道が多いので歩きやすい靴がおすすめです。\n\n${SAMPLE}`,
      price: 6000,
      days: 1,
      transport: "walk",
      created_at: at("2026-10-20"),
    }),
    post({
      id: "10000000-0000-4000-8000-000000000002",
      user_id: TRAVELER2_ID,
      type: "route",
      title: "Kiyomizu-dera, museums and Fushimi Inari",
      region: "京都",
      language: "en",
      body: `Started at Kiyomizu-dera, then the National Museum and Sanjusangen-do, and finished with the torii gates of Fushimi Inari before sunset.\n\n(Sample post for demo mode.)`,
      price: 4000,
      days: 1,
      transport: "transit",
      created_at: at("2026-10-22"),
    }),
    post({
      id: "10000000-0000-4000-8000-000000000003",
      user_id: TRAVELER_ID,
      type: "food",
      title: "清水寺の帰りに湯豆腐ランチ",
      region: "京都",
      body: `参道から少し入ったところで、落ち着いて湯豆腐を食べられました。\n\n${SAMPLE}`,
      place_name: "奥丹 清水",
      dish_name: "湯豆腐",
      google_place_id: "mock_okutan",
      price: 4400,
      rating: 5,
      created_at: at("2026-10-21"),
    }),
    post({
      id: "10000000-0000-4000-8000-000000000004",
      user_id: TRAVELER_ID,
      type: "stay",
      title: "祇園まで歩いて行ける便利なホテル",
      region: "京都",
      body: `八坂神社や花見小路まで歩いて行けるので、夜の散歩も楽しめました。\n\n${SAMPLE}`,
      place_name: "ホテル ザ セレスティン京都祇園",
      highlights: "立地がよい・大浴場がある",
      google_place_id: "mock_celestine-gion",
      price: 25000,
      rating: 4,
      created_at: at("2026-10-18"),
    }),
    post({
      id: "10000000-0000-4000-8000-000000000005",
      user_id: TRAVELER2_ID,
      type: "food",
      title: "Breakfast walk at Tsukiji Outer Market",
      region: "東京",
      language: "en",
      body: `Lots of small stalls — come early before it gets crowded.\n\n(Sample post for demo mode.)`,
      place_name: "築地場外市場",
      dish_name: "Tamagoyaki",
      google_place_id: "mock_tsukiji",
      price: 1500,
      rating: 4,
      created_at: at("2026-10-15"),
    }),
  ],
  post_route_spots: [
    ...["kiyomizu:清水寺", "sannenzaka:産寧坂（三年坂）", "yasaka:八坂神社", "hanamikoji:祇園 花見小路"].map((s, i) => {
      const [slug, name] = s.split(":");
      return {
        id: `20000000-0000-4000-8000-00000000000${i + 1}`,
        post_id: "10000000-0000-4000-8000-000000000001",
        day: 1,
        order_index: i,
        name,
        google_place_id: `mock_${slug}`,
        travel_minutes: i === 0 ? null : 10,
        created_at: at("2026-10-20"),
      };
    }),
    ...["kiyomizu:Kiyomizu-dera", "kyohaku:Kyoto National Museum", "sanjusangendo:Sanjusangen-do", "fushimi-inari:Fushimi Inari Taisha"].map(
      (s, i) => {
        const [slug, name] = s.split(":");
        return {
          id: `20000000-0000-4000-8000-00000000001${i + 1}`,
          post_id: "10000000-0000-4000-8000-000000000002",
          day: 1,
          order_index: i,
          name,
          google_place_id: `mock_${slug}`,
          travel_minutes: i === 0 ? null : 15,
          created_at: at("2026-10-22"),
        };
      },
    ),
  ],
  post_likes: [
    { id: "30000000-0000-4000-8000-000000000001", post_id: "10000000-0000-4000-8000-000000000001", user_id: TRAVELER2_ID, created_at: at("2026-10-23") },
    { id: "30000000-0000-4000-8000-000000000002", post_id: "10000000-0000-4000-8000-000000000003", user_id: TRAVELER2_ID, created_at: at("2026-10-23") },
    { id: "30000000-0000-4000-8000-000000000003", post_id: "10000000-0000-4000-8000-000000000002", user_id: TRAVELER_ID, created_at: at("2026-10-23") },
  ],
};
