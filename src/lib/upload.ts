"use client";

import exifr from "exifr";
import { createClient } from "@/lib/supabase/client";

/**
 * 撮影したままの写真を Supabase Storage に保存する。
 * リサイズ・圧縮・フィルターなどの加工は一切しない。撮影日時は EXIF から取得する。
 */
export async function uploadOriginalPhoto(file: File, folder: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("login_required");

  let takenAt: string | null = null;
  try {
    const exif = (await exifr.parse(file, ["DateTimeOriginal", "CreateDate"])) as
      | { DateTimeOriginal?: Date; CreateDate?: Date }
      | undefined;
    const date = exif?.DateTimeOriginal ?? exif?.CreateDate;
    if (date instanceof Date && !isNaN(date.getTime())) takenAt = date.toISOString();
  } catch {
    // EXIF がない写真もある
  }

  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${user.id}/${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("photos").upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  return { path, takenAt };
}
