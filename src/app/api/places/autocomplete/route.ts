import { NextResponse, type NextRequest } from "next/server";
import { autocomplete } from "@/lib/google";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const lang = request.nextUrl.searchParams.get("lang") ?? "ja";
  const session = request.nextUrl.searchParams.get("session") ?? undefined;
  if (!q) return NextResponse.json({ suggestions: [] });
  try {
    return NextResponse.json({ suggestions: await autocomplete(q.slice(0, 100), lang, session) });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ suggestions: [], error: "failed" }, { status: 502 });
  }
}
