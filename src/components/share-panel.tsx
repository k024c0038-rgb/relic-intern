"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Download, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, photoUrl } from "@/lib/utils";

export function SharePanel({
  imageBase,
  pageUrl,
  title,
  photos,
}: {
  imageBase: string;
  pageUrl: string;
  title: string;
  photos: { id: string; path: string }[];
}) {
  const t = useTranslations("share");
  const [photoId, setPhotoId] = useState<string>(photos[0]?.id ?? "none");
  const [copied, setCopied] = useState(false);
  const imageUrl = `${imageBase}&photo=${photoId}`;

  async function nativeShare() {
    try {
      const blob = await (await fetch(imageUrl)).blob();
      const file = new File([blob], "tabiai.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title, text: `${title} ${pageUrl}` });
      } else {
        await navigator.share({ title, url: pageUrl });
      }
    } catch {
      // ユーザーがキャンセルした場合など
    }
  }

  const text = encodeURIComponent(`${title} #TabiAI`);
  const url = encodeURIComponent(pageUrl);

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,420px)_1fr]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt={title} className="w-full rounded-xl border bg-muted shadow" width={1080} height={1350} />
      <div className="space-y-4">
        {photos.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("selectPhoto")}</p>
            <div className="flex flex-wrap gap-2">
              {photos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPhotoId(p.id)}
                  className={cn("overflow-hidden rounded-md border-2", photoId === p.id ? "border-primary" : "border-transparent")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrl(p.path)} alt="" className="h-16 w-16 object-cover" />
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPhotoId("none")}
                className={cn(
                  "grid h-16 w-16 place-items-center rounded-md border-2 bg-muted text-xs",
                  photoId === "none" ? "border-primary" : "border-transparent",
                )}
              >
                Map
              </button>
            </div>
          </div>
        ) : (
          <p className="rounded-md bg-muted p-3 text-sm">{t("noPhotoLayout")}</p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href={imageUrl} download="tabiai.png">
              <Download /> {t("saveImage")}
            </a>
          </Button>
          <Button variant="outline" onClick={nativeShare}>
            <Share2 /> {t("shareNative")}
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(pageUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? <Check /> : <Copy />} {copied ? t("copied") : t("copyLink")}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <a href={`https://x.com/intent/post?text=${text}&url=${url}`} target="_blank" rel="noopener noreferrer">
              X
            </a>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <a href={`https://service.weibo.com/share/share.php?title=${text}&url=${url}`} target="_blank" rel="noopener noreferrer">
              Weibo
            </a>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <a href={`https://social-plugins.line.me/lineit/share?url=${url}`} target="_blank" rel="noopener noreferrer">
              LINE
            </a>
          </Button>
          <Button variant="secondary" size="sm" onClick={nativeShare}>
            Instagram
          </Button>
          <Button variant="secondary" size="sm" onClick={nativeShare}>
            小红书
          </Button>
          <Button variant="secondary" size="sm" onClick={nativeShare}>
            WeChat
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("nativeHint")}</p>
      </div>
    </div>
  );
}
