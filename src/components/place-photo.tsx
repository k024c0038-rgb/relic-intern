import type { PlacePhoto as PlacePhotoType } from "@/lib/google";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Google Places の実際の写真と、撮影者のクレジットを表示する。
 * 写真自体は保存せず、/api/photo 経由で表示のたびに取得する。
 */
export function PlacePhoto({
  photo,
  alt,
  className,
  width = 800,
}: {
  photo?: PlacePhotoType;
  alt: string;
  className?: string;
  width?: number;
}) {
  const t = useTranslations("common");
  if (!photo) {
    return (
      <div className={cn("grid aspect-[4/3] place-items-center bg-muted text-xs text-muted-foreground", className)}>
        {t("noPhoto")}
      </div>
    );
  }
  const authors = photo.authorAttributions ?? [];
  return (
    <figure className={cn("relative overflow-hidden bg-muted", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/photo?name=${encodeURIComponent(photo.name)}&w=${width}`}
        alt={alt}
        loading="lazy"
        className="aspect-[4/3] h-full w-full object-cover"
      />
      <figcaption className="absolute inset-x-0 bottom-0 bg-black/50 px-2 py-0.5 text-[10px] text-white">
        {authors.length > 0
          ? authors.map((a, i) => (
              <span key={i}>
                {i > 0 && ", "}
                {a.uri ? (
                  <a href={a.uri} target="_blank" rel="noopener noreferrer" className="underline">
                    {t("photoBy", { name: a.displayName })}
                  </a>
                ) : (
                  t("photoBy", { name: a.displayName })
                )}
              </span>
            ))
          : t("photoGoogle")}
        <span className="ml-1 opacity-80">· Google</span>
      </figcaption>
    </figure>
  );
}
