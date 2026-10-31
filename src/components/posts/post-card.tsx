import Link from "next/link";
import { useTranslations } from "next-intl";
import { Heart, MapPin } from "lucide-react";
import type { DbPostWithStats } from "@/lib/types";
import { formatYen, photoUrl } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export function PostCard({ post }: { post: DbPostWithStats }) {
  const tc = useTranslations("common");
  return (
    <Link href={`/posts/${post.id}`} className="block">
      <Card className="h-full overflow-hidden transition-shadow hover:shadow-md">
        {post.cover_path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl(post.cover_path)} alt={post.title} loading="lazy" className="aspect-[4/3] w-full object-cover" />
        ) : (
          <div className="grid aspect-[4/3] place-items-center bg-muted text-xs text-muted-foreground">{tc("noPhoto")}</div>
        )}
        <CardContent className="space-y-1 pt-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{tc(`postType.${post.type}`)}</Badge>
            {post.rating && <span className="text-xs text-amber-600">{"★".repeat(post.rating)}</span>}
          </div>
          <p className="line-clamp-2 font-semibold">{post.title}</p>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="size-3" /> {post.region}
            </span>
            <span>{formatYen(post.price)}</span>
            <span className="flex items-center gap-1">
              <Heart className="size-3" /> {post.like_count}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
