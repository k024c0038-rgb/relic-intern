import "server-only";
import type { SpotCategory, Transport } from "@/lib/types";
import { distanceMeters } from "@/lib/utils";

/**
 * Google Places API (New) / Routes API のサーバー側ラッパー。
 * APIキーをブラウザに出さないため、必ずサーバー（Route Handler / Server Component）から呼ぶ。
 * 規約上、緯度・経度・写真はDBに保存しない。fetch のキャッシュは短時間のみ。
 */

const PLACES_BASE = "https://places.googleapis.com/v1";
const ROUTES_BASE = "https://routes.googleapis.com";

function key() {
  const k = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!k) throw new Error("GOOGLE_MAPS_SERVER_KEY is not set");
  return k;
}

export type PlacePhoto = {
  name: string;
  widthPx?: number;
  heightPx?: number;
  authorAttributions?: { displayName: string; uri?: string; photoUri?: string }[];
};

export type Place = {
  id: string;
  displayName?: { text: string; languageCode?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  types?: string[];
  primaryType?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  businessStatus?: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY";
  photos?: PlacePhoto[];
  editorialSummary?: { text: string };
  regularOpeningHours?: { weekdayDescriptions?: string[]; openNow?: boolean };
  googleMapsUri?: string;
  websiteUri?: string;
};

const LIST_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "types",
  "primaryType",
  "rating",
  "userRatingCount",
  "priceLevel",
  "businessStatus",
  "photos",
];

const DETAIL_FIELDS = [...LIST_FIELDS, "editorialSummary", "regularOpeningHours", "googleMapsUri", "websiteUri"];

async function placesFetch<T>(path: string, init: { method?: string; body?: unknown; fieldMask: string; revalidate?: number }) {
  const res = await fetch(`${PLACES_BASE}${path}`, {
    method: init.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key(),
      "X-Goog-FieldMask": init.fieldMask,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    next: { revalidate: init.revalidate ?? 3600 },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Places API ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

const languageCode = (lang: string) => (lang === "zh" ? "zh-CN" : lang);

export async function autocomplete(input: string, lang: string, sessionToken?: string) {
  const data = await placesFetch<{
    suggestions?: {
      placePrediction?: {
        placeId: string;
        text: { text: string };
        structuredFormat?: { mainText: { text: string }; secondaryText?: { text: string } };
      };
    }[];
  }>("/places:autocomplete", {
    body: { input, languageCode: languageCode(lang), includedRegionCodes: ["jp"], sessionToken },
    fieldMask: "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
    revalidate: 0,
  });
  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({
      placeId: p.placeId,
      name: p.structuredFormat?.mainText.text ?? p.text.text,
      secondary: p.structuredFormat?.secondaryText?.text ?? "",
    }));
}

export async function getPlace(placeId: string, lang: string) {
  return placesFetch<Place>(`/places/${encodeURIComponent(placeId)}?languageCode=${languageCode(lang)}`, {
    method: "GET",
    fieldMask: DETAIL_FIELDS.join(","),
  });
}

/** 取得できなかったスポットは null（閉業・ID失効など） */
export async function getPlaces(placeIds: string[], lang: string) {
  const unique = [...new Set(placeIds)];
  const results = await Promise.all(unique.map((id) => getPlace(id, lang).catch(() => null)));
  return new Map(unique.map((id, i) => [id, results[i]]));
}

export async function textSearch(query: string, lang: string, max = 20) {
  const data = await placesFetch<{ places?: Place[] }>("/places:searchText", {
    body: { textQuery: query, languageCode: languageCode(lang), pageSize: max, regionCode: "jp" },
    fieldMask: LIST_FIELDS.map((f) => `places.${f}`).join(","),
  });
  return (data.places ?? []).filter(isOpenBusiness);
}

export const CATEGORY_TYPES: Record<Exclude<SpotCategory, "other">, string[]> = {
  sightseeing: ["tourist_attraction", "museum", "park", "art_gallery"],
  food: ["restaurant", "cafe"],
  stay: ["lodging"],
};

export async function nearbySearch(
  center: { lat: number; lng: number },
  radius: number,
  category: Exclude<SpotCategory, "other">,
  lang: string,
  max = 20,
) {
  const data = await placesFetch<{ places?: Place[] }>("/places:searchNearby", {
    body: {
      includedTypes: CATEGORY_TYPES[category],
      maxResultCount: max,
      rankPreference: "POPULARITY",
      languageCode: languageCode(lang),
      locationRestriction: {
        circle: { center: { latitude: center.lat, longitude: center.lng }, radius: Math.min(radius, 50000) },
      },
    },
    fieldMask: LIST_FIELDS.map((f) => `places.${f}`).join(","),
  });
  return (data.places ?? []).filter(isOpenBusiness);
}

/** 閉業しているスポットは候補から外す */
export function isOpenBusiness(p: Place) {
  return !p.businessStatus || p.businessStatus === "OPERATIONAL";
}

export function categorize(p: Place): SpotCategory {
  const types = p.types ?? [];
  if (types.includes("lodging")) return "stay";
  if (types.some((t) => ["restaurant", "cafe", "bakery", "bar", "meal_takeaway", "food"].includes(t))) return "food";
  if (
    types.some((t) =>
      ["tourist_attraction", "museum", "park", "art_gallery", "place_of_worship", "point_of_interest", "natural_feature"].includes(t),
    )
  )
    return "sightseeing";
  return "other";
}

export function latLng(p: Place) {
  return p.location ? { lat: p.location.latitude, lng: p.location.longitude } : null;
}

// ------------------------------------------------------------
// Photos
// ------------------------------------------------------------

/** 写真の実体URLを取得（Googleの写真は保存せず、表示のたびに取得する） */
export async function getPhotoUri(photoName: string, maxWidthPx = 800) {
  const res = await fetch(
    `${PLACES_BASE}/${photoName}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true&key=${key()}`,
    { next: { revalidate: 3600 } },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { photoUri?: string };
  return data.photoUri ?? null;
}

// ------------------------------------------------------------
// Routes
// ------------------------------------------------------------

const TRAVEL_MODE: Record<Transport, string> = { walk: "WALK", transit: "TRANSIT", car: "DRIVE" };

/** Routes API が使えないときの概算（直線距離 × 迂回係数） */
export function estimateTravelMinutes(a: { lat: number; lng: number }, b: { lat: number; lng: number }, transport: Transport) {
  const km = (distanceMeters(a, b) * 1.3) / 1000;
  if (transport === "walk") return Math.max(3, Math.round((km / 4.5) * 60));
  if (transport === "car") return Math.max(5, Math.round((km / 30) * 60) + 5);
  return Math.max(5, Math.round((km / 20) * 60) + 10);
}

export async function computeTravelMinutes(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  transport: Transport,
  departureTime?: Date,
) {
  try {
    const body: Record<string, unknown> = {
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
      travelMode: TRAVEL_MODE[transport],
    };
    if (transport === "transit" && departureTime && departureTime.getTime() > Date.now()) {
      body.departureTime = departureTime.toISOString();
    }
    const res = await fetch(`${ROUTES_BASE}/directions/v2:computeRoutes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key(),
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
      },
      body: JSON.stringify(body),
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`Routes API ${res.status}`);
    const data = (await res.json()) as { routes?: { duration?: string; distanceMeters?: number }[] };
    const duration = data.routes?.[0]?.duration;
    if (!duration) throw new Error("no route");
    return { minutes: Math.max(1, Math.round(parseInt(duration, 10) / 60)), estimated: false };
  } catch {
    return { minutes: estimateTravelMinutes(origin, destination, transport), estimated: true };
  }
}

/** 1つの出発地から複数の目的地への移動時間（周辺おすすめページ用） */
export async function computeTravelMatrix(
  origin: { lat: number; lng: number },
  destinations: { lat: number; lng: number }[],
  transport: Transport,
) {
  const result: (number | null)[] = destinations.map(() => null);
  if (destinations.length === 0) return result;
  try {
    const res = await fetch(`${ROUTES_BASE}/distanceMatrix/v2:computeRouteMatrix`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key(),
        "X-Goog-FieldMask": "originIndex,destinationIndex,duration,condition",
      },
      body: JSON.stringify({
        origins: [{ waypoint: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } } }],
        destinations: destinations.slice(0, 25).map((d) => ({
          waypoint: { location: { latLng: { latitude: d.lat, longitude: d.lng } } },
        })),
        travelMode: TRAVEL_MODE[transport],
      }),
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`Route Matrix ${res.status}`);
    const rows = (await res.json()) as { destinationIndex: number; duration?: string; condition?: string }[];
    for (const row of rows) {
      if (row.condition === "ROUTE_EXISTS" && row.duration) {
        result[row.destinationIndex] = Math.max(1, Math.round(parseInt(row.duration, 10) / 60));
      }
    }
  } catch {
    // 概算にフォールバック
  }
  return result.map((m, i) => m ?? estimateTravelMinutes(origin, destinations[i], transport));
}
