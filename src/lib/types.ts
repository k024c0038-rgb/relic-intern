import { z } from "zod";

export const LOCALES = ["ja", "zh", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const TRANSPORTS = ["walk", "transit", "car"] as const;
export type Transport = (typeof TRANSPORTS)[number];

export const PREFERENCES = ["nature", "gourmet", "history", "drive", "shopping", "art", "onsen", "nightview"] as const;
export type Preference = (typeof PREFERENCES)[number];

export const SPOT_CATEGORIES = ["sightseeing", "food", "stay", "other"] as const;
export type SpotCategory = (typeof SPOT_CATEGORIES)[number];

export const POST_TYPES = ["food", "stay", "route"] as const;
export type PostType = (typeof POST_TYPES)[number];

/** 移動手段ごとの周辺検索半径（メートル） */
export const SEARCH_RADIUS: Record<Transport, number> = {
  walk: 1500,
  transit: 5000,
  car: 20000,
};

export const MainPlaceSchema = z.object({
  placeId: z.string().min(1),
  name: z.string().min(1),
});
export type MainPlace = z.infer<typeof MainPlaceSchema>;

/** 旅行条件入力フォームの値 */
export const PlanRequestSchema = z.object({
  destination: z.string().trim().min(1).max(100),
  mainPlaces: z.array(MainPlaceSchema).max(5),
  days: z.number().int().min(1).max(7),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  budget: z.number().int().min(0).max(10_000_000).nullable(),
  transport: z.enum(TRANSPORTS),
  preferences: z.array(z.enum(PREFERENCES)).max(PREFERENCES.length),
  language: z.enum(LOCALES),
});
export type PlanRequest = z.infer<typeof PlanRequestSchema>;

/** Google Places から取得した候補スポット（保存しない） */
export type Candidate = {
  placeId: string;
  name: string;
  category: SpotCategory;
  types: string[];
  lat: number;
  lng: number;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  isMain: boolean;
  postStats?: { postCount: number; avgRating: number | null; likeCount: number; routeCount: number };
  coVisitCount?: number;
};

export type DbTripPlan = {
  id: string;
  user_id: string;
  title: string;
  destination: string;
  start_date: string | null;
  days: number;
  budget: number | null;
  transport: Transport;
  preferences: string[];
  language: Locale;
  summary: string | null;
  is_saved: boolean;
  is_public: boolean;
  created_at: string;
};

export type DbPlanSpot = {
  id: string;
  plan_id: string;
  google_place_id: string;
  is_main: boolean;
  day: number;
  order_index: number;
  name: string;
  category: SpotCategory;
  description: string | null;
  start_time: string | null;
  stay_minutes: number;
  travel_minutes: number;
  estimated_cost: number;
};

export type DbPost = {
  id: string;
  user_id: string;
  type: PostType;
  title: string;
  region: string;
  body: string;
  place_name: string | null;
  dish_name: string | null;
  highlights: string | null;
  google_place_id: string | null;
  price: number | null;
  rating: number | null;
  days: number | null;
  transport: Transport | null;
  language: Locale;
  plan_id: string | null;
  created_at: string;
};

export type DbPostWithStats = DbPost & {
  like_count: number;
  cover_path: string | null;
  author_name: string | null;
};

export type DbRouteSpot = {
  id: string;
  post_id: string;
  day: number;
  order_index: number;
  name: string;
  google_place_id: string | null;
  travel_minutes: number | null;
};

export type DbPhoto = {
  id: string;
  storage_path: string;
  taken_at: string | null;
};
