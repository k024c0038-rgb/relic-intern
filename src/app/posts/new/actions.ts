"use server";

import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { LOCALES, TRANSPORTS } from "@/lib/types";

const Int = z.number().int().min(0).max(100_000_000).nullable();

const PostInputSchema = z
  .object({
    type: z.enum(["food", "stay", "route"]),
    title: z.string().trim().min(1).max(100),
    region: z.string().trim().min(1).max(50),
    body: z.string().max(5000),
    language: z.enum(LOCALES),
    placeName: z.string().max(100).nullable(),
    placeId: z.string().max(300).nullable(),
    dishName: z.string().max(100).nullable(),
    highlights: z.string().max(1000).nullable(),
    price: Int,
    rating: z.number().int().min(1).max(5).nullable(),
    days: z.number().int().min(1).max(30).nullable(),
    transport: z.enum(TRANSPORTS).nullable(),
    planId: z.string().uuid().nullable(),
    routeSpots: z
      .array(
        z.object({
          name: z.string().min(1).max(100),
          placeId: z.string().max(300).nullable(),
          day: z.number().int().min(1).max(30),
          travelMinutes: z.number().int().min(0).max(1440).nullable(),
        }),
      )
      .max(50),
    photos: z.array(z.object({ path: z.string().max(500), takenAt: z.string().nullable() })).max(10),
  })
  .refine((v) => v.type !== "route" || v.routeSpots.length >= 2, { message: "route_needs_spots" });

export type PostInput = z.infer<typeof PostInputSchema>;

export async function createPost(input: PostInput) {
  const { supabase, user } = await getUser();
  if (!user) return { error: "login_required" as const };
  const parsed = PostInputSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" as const };
  const v = parsed.data;
  if (v.photos.some((p) => !p.path.startsWith(`${user.id}/`))) return { error: "invalid" as const };

  const isRoute = v.type === "route";
  const { data: post, error } = await supabase
    .from("posts")
    .insert({
      user_id: user.id,
      type: v.type,
      title: v.title,
      region: v.region,
      body: v.body,
      language: v.language,
      place_name: isRoute ? null : v.placeName,
      google_place_id: isRoute ? null : v.placeId,
      dish_name: v.type === "food" ? v.dishName : null,
      highlights: v.type === "stay" ? v.highlights : null,
      price: v.price,
      rating: isRoute ? null : v.rating,
      days: isRoute ? v.days : null,
      transport: isRoute ? v.transport : null,
      plan_id: isRoute ? v.planId : null,
    })
    .select("id")
    .single();
  if (error || !post) return { error: "failed" as const };

  if (isRoute) {
    const counters = new Map<number, number>();
    const { error: e } = await supabase.from("post_route_spots").insert(
      v.routeSpots.map((s) => {
        const idx = counters.get(s.day) ?? 0;
        counters.set(s.day, idx + 1);
        return {
          post_id: post.id,
          day: s.day,
          order_index: idx,
          name: s.name,
          google_place_id: s.placeId,
          travel_minutes: s.travelMinutes,
        };
      }),
    );
    if (e) return { error: "failed" as const };
  }
  if (v.photos.length) {
    const { error: e } = await supabase
      .from("post_photos")
      .insert(v.photos.map((p) => ({ post_id: post.id, storage_path: p.path, taken_at: p.takenAt })));
    if (e) return { error: "failed" as const };
  }
  return { id: post.id as string };
}
