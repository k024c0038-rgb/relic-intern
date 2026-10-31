import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { PlanRequestSchema } from "@/lib/types";
import { createPlan, PlannerError } from "@/lib/planner";
import { AiError } from "@/lib/ai";

// 周辺検索・AI・移動時間計算をまとめて行うため、長めに許可する
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "login_required" }, { status: 401 });

  const parsed = PlanRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });

  try {
    const id = await createPlan(supabase, user.id, parsed.data);
    return NextResponse.json({ id });
  } catch (e) {
    console.error("createPlan failed", e);
    if (e instanceof PlannerError) return NextResponse.json({ error: e.message }, { status: 422 });
    if (e instanceof AiError) return NextResponse.json({ error: `ai_${e.message}` }, { status: 502 });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
