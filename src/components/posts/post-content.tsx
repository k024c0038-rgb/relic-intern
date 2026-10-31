"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Bookmark, Heart, Languages, Loader2, Share2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LOCALES, type Locale } from "@/lib/types";
import { toggleLike, toggleSave } from "@/app/posts/[id]/actions";

type Text = { title: string; body: string; dish_name: string | null; highlights: string | null };

/** 本文の表示（翻訳切り替え）と、いいね・保存・シェアなどの操作 */
export function PostContent({
  postId,
  isRoute,
  original,
  originalLanguage,
  likeCount,
  liked,
  saved,
  children,
}: {
  postId: string;
  isRoute: boolean;
  original: Text;
  originalLanguage: Locale;
  likeCount: number;
  liked: boolean;
  saved: boolean;
  children?: React.ReactNode;
}) {
  const t = useTranslations("postDetail");
  const tc = useTranslations("common");
  const router = useRouter();
  const [text, setText] = useState<Text>(original);
  const [translatedTo, setTranslatedTo] = useState<Locale | null>(null);
  const [translating, setTranslating] = useState(false);
  const [state, setState] = useState({ liked, saved, likeCount });
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function translate(target: Locale) {
    setTranslating(true);
    setError(null);
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId, target }),
    });
    setTranslating(false);
    if (!res.ok) return setError(tc("error"));
    setText(((await res.json()) as { translation: Text }).translation);
    setTranslatedTo(target);
  }

  function act(kind: "like" | "save") {
    start(async () => {
      const res = kind === "like" ? await toggleLike(postId) : await toggleSave(postId);
      if ("error" in res) {
        if (res.error === "login_required") router.push(`/login?next=/posts/${postId}`);
        else setError(tc("error"));
        return;
      }
      setState((s) =>
        kind === "like"
          ? { ...s, liked: res.active, likeCount: s.likeCount + (res.active ? 1 : -1) }
          : { ...s, saved: res.active },
      );
    });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{text.title}</h1>
      {children}
      {text.dish_name && <p className="font-medium">🍽 {text.dish_name}</p>}
      {text.body && <p className="whitespace-pre-wrap leading-relaxed">{text.body}</p>}
      {text.highlights && <p className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">👍 {text.highlights}</p>}

      <div className="flex flex-wrap gap-2">
        {LOCALES.filter((l) => l !== originalLanguage && l !== translatedTo).map((l) => (
          <Button key={l} size="sm" variant="outline" disabled={translating} onClick={() => translate(l)}>
            {translating ? <Loader2 className="animate-spin" /> : <Languages />}
            {translating ? t("translating") : t("translate", { lang: tc(`language.${l}`) })}
          </Button>
        ))}
        {translatedTo && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setText(original);
              setTranslatedTo(null);
            }}
          >
            {t("showOriginal")}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button variant={state.liked ? "default" : "outline"} disabled={pending} onClick={() => act("like")}>
          <Heart className={state.liked ? "fill-current" : ""} /> {t("like")} {state.likeCount}
        </Button>
        <Button variant={state.saved ? "secondary" : "outline"} disabled={pending} onClick={() => act("save")}>
          <Bookmark className={state.saved ? "fill-current" : ""} /> {state.saved ? t("saved") : t("save")}
        </Button>
        <Button asChild variant="outline">
          <Link href={`/share/${postId}?type=post`}>
            <Share2 /> {t("share")}
          </Link>
        </Button>
        {isRoute && (
          <Button asChild>
            <Link href={`/?fromPost=${postId}`}>
              <Sparkles /> {t("createFromRoute")}
            </Link>
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
