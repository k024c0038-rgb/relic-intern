import { NextResponse, type NextRequest } from "next/server";
import { getPhotoUri } from "@/lib/google";

/** Google Places の写真URLを取得してリダイレクトする（APIキーをブラウザに出さないため） */
export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name");
  const w = Math.min(Number(request.nextUrl.searchParams.get("w")) || 800, 1600);
  if (!name || !/^places\/[^/]+\/photos\/[^/]+$/.test(name)) {
    return NextResponse.json({ error: "invalid name" }, { status: 400 });
  }
  const uri = await getPhotoUri(name, w);
  if (!uri) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.redirect(uri, { status: 302, headers: { "Cache-Control": "private, max-age=3600" } });
}
