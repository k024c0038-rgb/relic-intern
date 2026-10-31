import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { loadShareData, type ShareType } from "@/lib/share/data";
import { photoUrl } from "@/lib/utils";

const WIDTH = 1080;
const HEIGHT = 1350;
/** 「TabiAIで作成」のロゴ文言（前・後） */
const MADE_WITH: Record<string, [string, string]> = { ja: ["", "で作成"], zh: ["由", "制作"], en: ["Made with", ""] };
const DAY_COLORS = ["#b91c1c", "#2563eb", "#059669", "#d97706", "#7c3aed", "#db2777", "#0891b2"];

/** 画像内の文字だけを含むサブセットフォントを Google Fonts から取得（日本語・中国語の表示用） */
async function loadFont(family: string, text: string) {
  const css = await (
    await fetch(`https://fonts.googleapis.com/css2?family=${family}:wght@700&text=${encodeURIComponent(text)}`)
  ).text();
  const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
  if (!url) throw new Error("font not found");
  return (await fetch(url)).arrayBuffer();
}

/**
 * シェア用画像（1080x1350）。
 * 写真はユーザー自身が撮ったものだけを使い、フィルター・補正はかけない（文字を重ねるだけ）。
 * 写真がない場合は、地図風の図とスポット一覧のレイアウトにする。
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const type: ShareType = request.nextUrl.searchParams.get("type") === "post" ? "post" : "plan";
  const photoId = request.nextUrl.searchParams.get("photo");
  const data = await loadShareData(type, id);
  if (!data) return new Response("Not found", { status: 404 });

  const photo = photoId === "none" ? undefined : (data.photos.find((p) => p.id === photoId) ?? data.photos[0]);
  const allText = [data.title, data.subtitle, ...data.spotNames, ...(MADE_WITH[data.language] ?? MADE_WITH.ja), "TabiAI0123456789·/〜→"].join("");
  const family = data.language === "zh" ? "Noto+Sans+SC" : "Noto+Sans+JP";
  const fonts = await loadFont(family, allText)
    .then((d) => [{ name: "Noto", data: d, weight: 700 as const, style: "normal" as const }])
    .catch(() => undefined);

  const [before, after] = MADE_WITH[data.language] ?? MADE_WITH.ja;
  const footer = (color: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 30, color }}>
      {before && <div style={{ display: "flex" }}>{before}</div>}
      <div style={{ display: "flex", background: "#b91c1c", color: "white", padding: "6px 16px", borderRadius: 12, fontSize: 32 }}>
        TabiAI
      </div>
      {after && <div style={{ display: "flex" }}>{after}</div>}
    </div>
  );

  if (photo) {
    return new ImageResponse(
      (
        <div style={{ width: WIDTH, height: HEIGHT, display: "flex", position: "relative", fontFamily: "Noto" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl(photo.path)} alt="" width={WIDTH} height={HEIGHT} style={{ objectFit: "cover", position: "absolute", inset: 0 }} />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              flexDirection: "column",
              gap: 18,
              padding: "200px 64px 56px",
              backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.75))",
              color: "white",
            }}
          >
            <div style={{ display: "flex", fontSize: 32, opacity: 0.9 }}>{data.subtitle}</div>
            <div style={{ display: "flex", fontSize: 64, lineHeight: 1.2 }}>{data.title}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {data.spotNames.map((n) => (
                <div key={n} style={{ display: "flex", fontSize: 28, border: "2px solid white", borderRadius: 999, padding: "4px 18px" }}>
                  {n}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>{footer("white")}</div>
          </div>
        </div>
      ),
      { width: WIDTH, height: HEIGHT, fonts },
    );
  }

  // 写真なし：スポットの位置関係を図にしたレイアウト
  const pts = data.points;
  const box = { x: 64, y: 330, w: WIDTH - 128, h: 560 };
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const spanLat = Math.max(maxLat - minLat, 0.005);
  const spanLng = Math.max(maxLng - minLng, 0.005);
  const project = (p: { lat: number; lng: number }) => ({
    x: 40 + ((p.lng - minLng) / spanLng) * (box.w - 80),
    y: 40 + ((maxLat - p.lat) / spanLat) * (box.h - 80),
  });

  return new ImageResponse(
    (
      <div style={{ width: WIDTH, height: HEIGHT, display: "flex", flexDirection: "column", background: "#fafaf9", padding: 64, fontFamily: "Noto" }}>
        <div style={{ display: "flex", fontSize: 32, color: "#78716c" }}>{data.subtitle}</div>
        <div style={{ display: "flex", fontSize: 64, lineHeight: 1.2, color: "#1c1917", marginTop: 12 }}>{data.title}</div>
        <div
          style={{
            display: "flex",
            position: "relative",
            width: box.w,
            height: box.h,
            marginTop: 40,
            borderRadius: 32,
            background: "#e7f0e8",
            border: "4px solid #d6d3d1",
          }}
        >
          <svg width={box.w} height={box.h} style={{ position: "absolute", inset: 0 }}>
            {pts.slice(1).map((p, i) => {
              const a = project(pts[i]);
              const b = project(p);
              return (
                <line
                  key={i}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={DAY_COLORS[(p.day - 1) % DAY_COLORS.length]}
                  strokeWidth={6}
                  strokeDasharray={pts[i].day !== p.day ? "12 10" : undefined}
                />
              );
            })}
            {pts.map((p, i) => {
              const { x, y } = project(p);
              return <circle key={i} cx={x} cy={y} r={16} fill={DAY_COLORS[(p.day - 1) % DAY_COLORS.length]} stroke="white" strokeWidth={5} />;
            })}
          </svg>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 36, flex: 1 }}>
          {data.spotNames.map((n, i) => (
            <div key={n} style={{ display: "flex", fontSize: 34, color: "#1c1917" }}>
              {`${i + 1}. ${n}`}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>{footer("#1c1917")}</div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT, fonts },
  );
}
