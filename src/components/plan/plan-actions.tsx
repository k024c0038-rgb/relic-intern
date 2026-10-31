"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Bookmark, Camera, Footprints, RefreshCw, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { publishPlan, recordSpotPhoto, savePlan } from "@/app/plan/[id]/actions";
import { uploadOriginalPhoto } from "@/lib/upload";
import { MOCK_SUPABASE } from "@/lib/mock/config";

export function PlanActions({
  planId,
  isOwner,
  isSaved,
  spots,
}: {
  planId: string;
  isOwner: boolean;
  isSaved: boolean;
  spots: { id: string; label: string }[];
}) {
  const t = useTranslations("plan");
  const tc = useTranslations("common");
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [spotId, setSpotId] = useState(spots[0]?.id ?? "");
  const [uploading, setUploading] = useState(false);

  if (!isOwner) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href={`/?fromPlan=${planId}`}>
            <RefreshCw /> {t("regenerate")}
          </Link>
        </Button>
      </div>
    );
  }

  async function onFiles(files: FileList | null) {
    if (!files || !spotId) return;
    setUploading(true);
    setMessage(null);
    try {
      for (const file of Array.from(files)) {
        const { path, takenAt } = await uploadOriginalPhoto(file, `plans/${planId}`);
        const res = await recordSpotPhoto({ planId, spotId, storagePath: path, takenAt });
        if ("error" in res) throw new Error(res.error);
      }
      setMessage(t("uploaded"));
      router.refresh();
    } catch {
      setMessage(tc("error"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          variant={isSaved ? "secondary" : "default"}
          disabled={isSaved || pending}
          onClick={() =>
            start(async () => {
              const res = await savePlan(planId);
              setMessage("error" in res ? (res.error === "premium_required" ? t("premiumRequired") : tc("error")) : t("saved"));
            })
          }
        >
          <Bookmark /> {isSaved ? t("saved") : t("save")}
        </Button>
        <Button asChild variant="outline">
          <Link href={`/?fromPlan=${planId}`}>
            <RefreshCw /> {t("regenerate")}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/posts/new?fromPlan=${planId}`}>
            <Footprints /> {t("traveled")}
          </Link>
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await publishPlan(planId);
              if ("error" in res) setMessage(tc("error"));
              else router.push(`/share/${planId}?type=plan`);
            })
          }
        >
          <Share2 /> {t("share")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-background p-3">
        <Camera className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">{t("addPhoto")}</span>
        {MOCK_SUPABASE ? (
          <span className="text-xs text-muted-foreground">{tc("demoPhotos")}</span>
        ) : (
          <>
            <Select className="w-auto max-w-56" value={spotId} onChange={(e) => setSpotId(e.target.value)}>
              {spots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
                multiple
                className="hidden"
                disabled={uploading}
                onChange={(e) => onFiles(e.target.files)}
              />
              <span className="inline-flex h-8 items-center rounded-md border px-3 text-xs hover:bg-muted">
                {uploading ? t("uploading") : "📷 JPG / HEIC"}
              </span>
            </label>
          </>
        )}
      </div>

      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
