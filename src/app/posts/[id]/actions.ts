"use server";

import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/supabase/server";

async function toggle(table: "post_likes" | "post_saves", postId: string) {
  const { supabase, user } = await getUser();
  if (!user) return { error: "login_required" as const };
  const { data: existing } = await supabase
    .from(table)
    .select("id")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) {
    await supabase.from(table).delete().eq("id", existing.id);
  } else {
    const { error } = await supabase.from(table).insert({ post_id: postId, user_id: user.id });
    if (error && error.code !== "23505") return { error: "failed" as const };
  }
  revalidatePath(`/posts/${postId}`);
  return { active: !existing };
}

export async function toggleLike(postId: string) {
  return toggle("post_likes", postId);
}

export async function toggleSave(postId: string) {
  return toggle("post_saves", postId);
}
