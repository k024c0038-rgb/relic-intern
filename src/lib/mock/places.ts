import type { Place } from "@/lib/google";
import type { SpotCategory } from "@/lib/types";
import { distanceMeters } from "@/lib/utils";

/**
 * デモモード用のスポットデータ（Google Places API の代わり）。
 * 名前と位置は実在のスポットに基づくおおよその値。評価・写真は持たない（作り物の写真や数値を出さないため）。
 */

type Names = { ja: string; en: string; zh: string };
type MockSpot = {
  slug: string;
  region: Region;
  names: Names;
  lat: number;
  lng: number;
  category: Exclude<SpotCategory, "other">;
  types: string[];
};

type Region = "kyoto" | "tokyo" | "osaka" | "kanazawa" | "sapporo";

const REGION_NAMES: Record<Region, Names> = {
  kyoto: { ja: "京都府京都市", en: "Kyoto, Japan", zh: "日本京都府京都市" },
  tokyo: { ja: "東京都", en: "Tokyo, Japan", zh: "日本东京都" },
  osaka: { ja: "大阪府大阪市", en: "Osaka, Japan", zh: "日本大阪府大阪市" },
  kanazawa: { ja: "石川県金沢市", en: "Kanazawa, Ishikawa, Japan", zh: "日本石川县金泽市" },
  sapporo: { ja: "北海道札幌市", en: "Sapporo, Hokkaido, Japan", zh: "日本北海道札幌市" },
};

/** 行き先の入力（日本語・英語・中国語）から地域を判定する */
const REGION_ALIASES: Record<Region, string[]> = {
  kyoto: ["京都", "kyoto", "清水", "嵐山", "祇園"],
  tokyo: ["東京", "东京", "tokyo", "浅草", "渋谷", "上野"],
  osaka: ["大阪", "osaka", "道頓堀", "难波", "難波"],
  kanazawa: ["金沢", "金泽", "kanazawa", "石川"],
  sapporo: ["札幌", "sapporo", "北海道", "hokkaido"],
};

const S = (
  slug: string,
  region: Region,
  ja: string,
  en: string,
  zh: string,
  lat: number,
  lng: number,
  category: MockSpot["category"],
  types: string[],
): MockSpot => ({ slug, region, names: { ja, en, zh }, lat, lng, category, types });

const SIGHT = ["tourist_attraction", "point_of_interest"];
const TEMPLE = ["tourist_attraction", "place_of_worship", "point_of_interest"];
const MUSEUM = ["museum", "tourist_attraction", "point_of_interest"];
const PARK = ["park", "tourist_attraction", "point_of_interest"];
const FOOD = ["restaurant", "food", "point_of_interest"];
const CAFE = ["cafe", "food", "point_of_interest"];
const MARKET = ["market", "food", "point_of_interest"];
const HOTEL = ["lodging", "point_of_interest"];

export const MOCK_SPOTS: MockSpot[] = [
  // 京都
  S("kiyomizu", "kyoto", "清水寺", "Kiyomizu-dera", "清水寺", 34.9949, 135.785, "sightseeing", TEMPLE),
  S("sannenzaka", "kyoto", "産寧坂（三年坂）", "Sannenzaka", "三年坂", 34.9963, 135.7814, "sightseeing", SIGHT),
  S("yasaka", "kyoto", "八坂神社", "Yasaka Shrine", "八坂神社", 35.0037, 135.7785, "sightseeing", TEMPLE),
  S("maruyama", "kyoto", "円山公園", "Maruyama Park", "圆山公园", 35.0037, 135.781, "sightseeing", PARK),
  S("hanamikoji", "kyoto", "祇園 花見小路", "Gion Hanamikoji Street", "祇园花见小路", 35.0028, 135.7752, "sightseeing", SIGHT),
  S("kyohaku", "kyoto", "京都国立博物館", "Kyoto National Museum", "京都国立博物馆", 34.9899, 135.7732, "sightseeing", MUSEUM),
  S("sanjusangendo", "kyoto", "三十三間堂", "Sanjusangen-do", "三十三间堂", 34.9879, 135.7717, "sightseeing", TEMPLE),
  S("fushimi-inari", "kyoto", "伏見稲荷大社", "Fushimi Inari Taisha", "伏见稻荷大社", 34.9671, 135.7727, "sightseeing", TEMPLE),
  S("ginkakuji", "kyoto", "銀閣寺（慈照寺）", "Ginkaku-ji", "银阁寺", 35.027, 135.7982, "sightseeing", TEMPLE),
  S("tetsugaku", "kyoto", "哲学の道", "Philosopher's Path", "哲学之道", 35.0236, 135.7944, "sightseeing", SIGHT),
  S("nijo", "kyoto", "二条城", "Nijo Castle", "二条城", 35.0142, 135.7481, "sightseeing", SIGHT),
  S("kinkakuji", "kyoto", "金閣寺（鹿苑寺）", "Kinkaku-ji", "金阁寺", 35.0394, 135.7292, "sightseeing", TEMPLE),
  S("arashiyama-bamboo", "kyoto", "嵐山 竹林の小径", "Arashiyama Bamboo Grove", "岚山竹林小径", 35.017, 135.6713, "sightseeing", SIGHT),
  S("togetsukyo", "kyoto", "渡月橋", "Togetsukyo Bridge", "渡月桥", 35.0129, 135.6778, "sightseeing", SIGHT),
  S("nishiki", "kyoto", "錦市場", "Nishiki Market", "锦市场", 35.005, 135.7649, "food", MARKET),
  S("okutan", "kyoto", "奥丹 清水", "Okutan Kiyomizu", "奥丹 清水", 34.997, 135.7818, "food", FOOD),
  S("tsujiri", "kyoto", "祇園辻利 本店", "Gion Tsujiri Main Store", "祇园辻利 本店", 35.0037, 135.7757, "food", CAFE),
  S("inoda", "kyoto", "イノダコーヒ 本店", "Inoda Coffee Main Store", "INODA咖啡 本店", 35.0067, 135.7614, "food", CAFE),
  S("owariya", "kyoto", "本家尾張屋 本店", "Honke Owariya", "本家尾张屋 本店", 35.013, 135.7614, "food", FOOD),
  S("pontocho", "kyoto", "先斗町", "Pontocho Alley", "先斗町", 35.0055, 135.771, "food", FOOD),
  S("celestine-gion", "kyoto", "ホテル ザ セレスティン京都祇園", "Hotel The Celestine Kyoto Gion", "京都祇园塞莱斯廷酒店", 35.0005, 135.7766, "stay", HOTEL),
  S("granvia", "kyoto", "ホテルグランヴィア京都", "Hotel Granvia Kyoto", "京都格兰比亚大酒店", 34.9858, 135.7588, "stay", HOTEL),
  S("okura-kyoto", "kyoto", "ホテルオークラ京都", "Hotel Okura Kyoto", "京都大仓酒店", 35.0103, 135.7684, "stay", HOTEL),
  S("hoshinoya-kyoto", "kyoto", "星のや京都", "Hoshinoya Kyoto", "虹夕诺雅 京都", 35.0137, 135.6745, "stay", HOTEL),
  // 東京
  S("sensoji", "tokyo", "浅草寺", "Senso-ji", "浅草寺", 35.7148, 139.7967, "sightseeing", TEMPLE),
  S("skytree", "tokyo", "東京スカイツリー", "Tokyo Skytree", "东京晴空塔", 35.7101, 139.8107, "sightseeing", SIGHT),
  S("ueno-park", "tokyo", "上野恩賜公園", "Ueno Park", "上野恩赐公园", 35.7156, 139.7745, "sightseeing", PARK),
  S("tohaku", "tokyo", "東京国立博物館", "Tokyo National Museum", "东京国立博物馆", 35.7188, 139.7765, "sightseeing", MUSEUM),
  S("imperial-east", "tokyo", "皇居東御苑", "East Gardens of the Imperial Palace", "皇居东御苑", 35.6852, 139.7528, "sightseeing", PARK),
  S("meiji-jingu", "tokyo", "明治神宮", "Meiji Jingu", "明治神宫", 35.6764, 139.6993, "sightseeing", TEMPLE),
  S("shibuya-crossing", "tokyo", "渋谷スクランブル交差点", "Shibuya Scramble Crossing", "涩谷十字路口", 35.6595, 139.7005, "sightseeing", SIGHT),
  S("nakamise", "tokyo", "仲見世通り", "Nakamise Shopping Street", "仲见世商店街", 35.7118, 139.7964, "food", MARKET),
  S("tsukiji", "tokyo", "築地場外市場", "Tsukiji Outer Market", "筑地场外市场", 35.6655, 139.7707, "food", MARKET),
  S("ameyoko", "tokyo", "アメ横商店街", "Ameyoko Shopping Street", "阿美横町", 35.7106, 139.7745, "food", MARKET),
  S("asakusa-view", "tokyo", "浅草ビューホテル", "Asakusa View Hotel", "浅草景观酒店", 35.7155, 139.7905, "stay", HOTEL),
  S("tokyo-station-hotel", "tokyo", "東京ステーションホテル", "The Tokyo Station Hotel", "东京站酒店", 35.6812, 139.766, "stay", HOTEL),
  S("gracery-shinjuku", "tokyo", "ホテルグレイスリー新宿", "Hotel Gracery Shinjuku", "新宿格拉斯丽酒店", 35.6945, 139.7019, "stay", HOTEL),
  // 大阪
  S("osaka-castle", "osaka", "大阪城", "Osaka Castle", "大阪城", 34.6873, 135.5262, "sightseeing", SIGHT),
  S("dotonbori", "osaka", "道頓堀", "Dotonbori", "道顿堀", 34.6687, 135.5013, "sightseeing", SIGHT),
  S("tsutenkaku", "osaka", "通天閣", "Tsutenkaku", "通天阁", 34.6525, 135.5063, "sightseeing", SIGHT),
  S("kaiyukan", "osaka", "海遊館", "Osaka Aquarium Kaiyukan", "海游馆", 34.6545, 135.429, "sightseeing", MUSEUM),
  S("kuromon", "osaka", "黒門市場", "Kuromon Market", "黑门市场", 34.6655, 135.5066, "food", MARKET),
  S("shinsekai", "osaka", "新世界", "Shinsekai", "新世界", 34.6522, 135.5059, "food", FOOD),
  S("nikko-osaka", "osaka", "ホテル日航大阪", "Hotel Nikko Osaka", "大阪日航酒店", 34.6727, 135.4998, "stay", HOTEL),
  // 金沢
  S("kenrokuen", "kanazawa", "兼六園", "Kenroku-en Garden", "兼六园", 36.5621, 136.6627, "sightseeing", PARK),
  S("21seiki", "kanazawa", "金沢21世紀美術館", "21st Century Museum of Contemporary Art, Kanazawa", "金泽21世纪美术馆", 36.5609, 136.6582, "sightseeing", MUSEUM),
  S("kanazawa-castle", "kanazawa", "金沢城公園", "Kanazawa Castle Park", "金泽城公园", 36.5654, 136.6596, "sightseeing", PARK),
  S("higashi-chaya", "kanazawa", "ひがし茶屋街", "Higashi Chaya District", "东茶屋街", 36.5725, 136.6666, "sightseeing", SIGHT),
  S("omicho", "kanazawa", "近江町市場", "Omicho Market", "近江町市场", 36.5715, 136.6564, "food", MARKET),
  S("hyatt-kanazawa", "kanazawa", "ハイアット セントリック 金沢", "Hyatt Centric Kanazawa", "金泽凯悦尚萃酒店", 36.577, 136.647, "stay", HOTEL),
  // 札幌
  S("clock-tower", "sapporo", "さっぽろ時計台", "Sapporo Clock Tower", "札幌钟楼", 43.0625, 141.3536, "sightseeing", SIGHT),
  S("odori-park", "sapporo", "大通公園", "Odori Park", "大通公园", 43.0605, 141.3485, "sightseeing", PARK),
  S("hokkaido-jingu", "sapporo", "北海道神宮", "Hokkaido Jingu", "北海道神宫", 43.0544, 141.308, "sightseeing", TEMPLE),
  S("nijo-market", "sapporo", "二条市場", "Nijo Market", "二条市场", 43.0583, 141.3575, "food", MARKET),
  S("jr-tower-nikko", "sapporo", "JRタワーホテル日航札幌", "JR Tower Hotel Nikko Sapporo", "札幌JR塔日航酒店", 43.068, 141.351, "stay", HOTEL),
];

const PREFIX = "mock_";
const BY_ID = new Map(MOCK_SPOTS.map((s) => [PREFIX + s.slug, s]));

const pick = (names: Names, lang: string) => (lang === "en" ? names.en : lang === "zh" ? names.zh : names.ja);

function toPlace(s: MockSpot, lang: string): Place {
  const name = pick(s.names, lang);
  return {
    id: PREFIX + s.slug,
    displayName: { text: name, languageCode: lang },
    formattedAddress: pick(REGION_NAMES[s.region], lang),
    location: { latitude: s.lat, longitude: s.lng },
    types: s.types,
    primaryType: s.types[0],
    businessStatus: "OPERATIONAL",
    googleMapsUri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.names.ja)}`,
  };
}

export function mockAutocomplete(input: string, lang: string) {
  const q = input.trim().toLowerCase();
  return MOCK_SPOTS.filter((s) => Object.values(s.names).some((n) => n.toLowerCase().includes(q)))
    .slice(0, 8)
    .map((s) => ({ placeId: PREFIX + s.slug, name: pick(s.names, lang), secondary: pick(REGION_NAMES[s.region], lang) }));
}

export function mockGetPlace(placeId: string, lang: string): Place {
  const s = BY_ID.get(placeId);
  if (!s) throw new Error(`Mock place not found: ${placeId}`);
  return toPlace(s, lang);
}

export function mockTextSearch(query: string, lang: string, max: number) {
  const q = query.toLowerCase();
  const region = (Object.keys(REGION_ALIASES) as Region[]).find((r) => REGION_ALIASES[r].some((a) => q.includes(a.toLowerCase())));
  if (!region) return [];
  return MOCK_SPOTS.filter((s) => s.region === region && s.category === "sightseeing")
    .slice(0, max)
    .map((s) => toPlace(s, lang));
}

export function mockNearbySearch(
  center: { lat: number; lng: number },
  radius: number,
  category: Exclude<SpotCategory, "other">,
  lang: string,
  max: number,
) {
  return MOCK_SPOTS.filter((s) => s.category === category)
    .map((s) => ({ s, d: distanceMeters(center, s) }))
    .filter(({ d }) => d <= radius)
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map(({ s }) => toPlace(s, lang));
}
