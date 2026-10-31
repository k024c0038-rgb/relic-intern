"use server";

import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/supabase/server";

export async function savePlan(planId: string) {
  const { supabase, user } = await getUser();
  if (!user) return { error: "login_required" as const };
  const { error } = await supabase.from("trip_plans").update({ is_saved: true }).eq("id", planId).eq("user_id", user.id);
  if (error) return { error: error.message.includes("premium_required") ? ("premium_required" as const) : ("failed" as const) };
  revalidatePath(`/plan/${planId}`);
  return { ok: true };
}

/** シェア用に公開する */
export async function publishPlan(planId: string) {
  const { supabase, user } = await getUser();
  if (!user) return { error: "login_required" as const };
  const { error } = await supabase.from("trip_plans").update({ is_public: true }).eq("id", planId).eq("user_id", user.id);
  if (error) return { error: "failed" as const };
  return { ok: true };
}

export async function recordSpotPhoto(input: { planId: string; spotId: string; storagePath: string; takenAt: string | null }) {
  const { supabase, user } = await getUser();
  if (!user) return { error: "login_required" as const };
  if (!input.storagePath.startsWith(`${user.id}/`)) return { error: "invalid_path" as const };
  const { error } = await supabase.from("spot_photos").insert({
    user_id: user.id,
    plan_id: input.planId,
    spot_id: input.spotId,
    storage_path: input.storagePath,
    taken_at: input.takenAt,
  });
  if (error) return { error: "failed" as const };
  revalidatePath(`/plan/${input.planId}`);
  return { ok: true };
}
