/**
 * デモモード（モック）の判定。
 * 外部サービスのキーが設定されていない場合、そのサービスだけ自動でモックに切り替える。
 * NEXT_PUBLIC_MOCK_MODE=true にすると、キーがあってもすべてモックで動かす。
 */
const forceMock = process.env.NEXT_PUBLIC_MOCK_MODE === "true";

/** Supabase（DB・認証・Storage）。NEXT_PUBLIC_ なのでブラウザ側でも判定できる */
export const MOCK_SUPABASE =
  forceMock || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Maps JavaScript API（ブラウザの地図） */
export const MOCK_MAP = forceMock || !process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;

/** Google Places / Routes API（サーバー側でのみ判定） */
export function isMockGoogle() {
  return forceMock || !process.env.GOOGLE_MAPS_SERVER_KEY;
}

/** Claude API（サーバー側でのみ判定） */
export function isMockAi() {
  return forceMock || !process.env.ANTHROPIC_API_KEY;
}

/** モックになっているサービス名（画面上部の案内表示用。サーバー側で呼ぶ） */
export function mockedServices() {
  const list: string[] = [];
  if (MOCK_SUPABASE) list.push("Supabase");
  if (isMockGoogle()) list.push("Google Places / Routes");
  if (MOCK_MAP) list.push("Google Maps");
  if (isMockAi()) list.push("Claude API");
  return list;
}
