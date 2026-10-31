import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { suggestCourses } from "@/lib/planner";
import { LOCALES, TRANSPORTS } from "@/lib/types";

export const maxDuration = 120;

const BodySchema = z.object({
  placeId: z.string().min(1),
  name: z.string().min(1),
  transport: z.enum(TRANSPORTS),
  language: z.enum(LOCALES),
});

/** 周辺おすすめページの「AIおすすめルート」（半日／1日） */
export async function POST(request: NextRequest) {
  const { supabase, user } = await getUser();
  // AI API の利用量を抑えるため、ログインユーザーのみ
  if (!user) return NextResponse.json({ error: "login_required" }, { status: 401 });
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  try {
    const { placeId, name, transport, language } = parsed.data;
    const courses = await suggestCourses(supabase, { placeId, name }, transport, language);
    return NextResponse.json({ courses });
  } catch (e) {
    console.error("suggestCourses failed", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
