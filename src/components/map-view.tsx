"use client";

import { APIProvider, AdvancedMarker, Map, Pin, Polyline, useMap } from "@vis.gl/react-google-maps";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { MOCK_MAP } from "@/lib/mock/config";

export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  title: string;
  kind?: "main" | "sightseeing" | "food" | "stay" | "other";
};

const COLORS: Record<NonNullable<MapPoint["kind"]>, string> = {
  main: "#f59e0b",
  sightseeing: "#b91c1c",
  food: "#ea580c",
  stay: "#2563eb",
  other: "#57534e",
};

function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map || points.length === 0) return;
    if (points.length === 1) {
      map.setCenter(points[0]);
      map.setZoom(15);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 40);
  }, [map, points]);
  return null;
}

/** Maps JavaScript API のキーがないとき（デモモード）に、位置関係だけを図で表示する */
function SimpleMap({ points, route, className }: { points: MapPoint[]; route?: { lat: number; lng: number }[][]; className: string }) {
  const t = useTranslations("common");
  const W = 600;
  const H = 360;
  const pad = 36;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const spanLat = Math.max(maxLat - minLat, 0.004);
  const spanLng = Math.max(maxLng - minLng, 0.004);
  const scale = Math.min((W - pad * 2) / spanLng, (H - pad * 2) / spanLat);
  const project = (p: { lat: number; lng: number }) => ({
    x: W / 2 + (p.lng - (minLng + maxLng) / 2) * scale,
    y: H / 2 - (p.lat - (minLat + maxLat) / 2) * scale,
  });
  return (
    <div className={`${className} relative overflow-hidden rounded-xl border bg-[#e8f0e6]`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label={t("demoMap")}>
        {route?.map((path, i) => (
          <polyline
            key={i}
            points={path.map((p) => `${project(p).x},${project(p).y}`).join(" ")}
            fill="none"
            stroke={i % 2 ? "#2563eb" : "#b91c1c"}
            strokeWidth={3}
            strokeOpacity={0.7}
          />
        ))}
        {points.map((p) => {
          const { x, y } = project(p);
          return (
            <g key={p.id}>
              <title>{p.title}</title>
              <circle cx={x} cy={y} r={11} fill={COLORS[p.kind ?? "other"]} stroke="#fff" strokeWidth={2} />
              {p.label && (
                <text x={x} y={y + 3.5} textAnchor="middle" fontSize={9} fontWeight={700} fill="#fff">
                  {p.label}
                </text>
              )}
              <text x={x + 14} y={y + 4} fontSize={11} fill="#1c1917">
                {p.title.length > 12 ? `${p.title.slice(0, 12)}…` : p.title}
              </text>
            </g>
          );
        })}
      </svg>
      <span className="absolute bottom-1 right-2 text-[10px] text-muted-foreground">{t("demoMap")}</span>
    </div>
  );
}

/** スポットとルートを地図に表示する（Maps JavaScript API） */
export function MapView({
  points,
  route,
  className = "h-72 w-full",
}: {
  points: MapPoint[];
  /** 線で結ぶ順番（省略時は線を引かない） */
  route?: { lat: number; lng: number }[][];
  className?: string;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
  if (points.length > 0 && (MOCK_MAP || !apiKey)) return <SimpleMap points={points} route={route} className={className} />;
  if (!apiKey || points.length === 0) {
    return <div className={`${className} grid place-items-center rounded-xl bg-muted text-sm text-muted-foreground`}>Map</div>;
  }
  return (
    <div className={`${className} overflow-hidden rounded-xl`}>
      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={points[0]}
          defaultZoom={13}
          mapId={process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "DEMO_MAP_ID"}
          gestureHandling="cooperative"
          disableDefaultUI
          zoomControl
        >
          <FitBounds points={points} />
          {route?.map((path, i) => (
            <Polyline key={i} path={path} strokeColor={i % 2 ? "#2563eb" : "#b91c1c"} strokeOpacity={0.8} strokeWeight={4} />
          ))}
          {points.map((p) => (
            <AdvancedMarker key={p.id} position={p} title={p.title}>
              <Pin background={COLORS[p.kind ?? "other"]} borderColor="#ffffff" glyphColor="#ffffff">
                {p.label ? <span className="text-xs font-bold text-white">{p.label}</span> : undefined}
              </Pin>
            </AdvancedMarker>
          ))}
        </Map>
      </APIProvider>
    </div>
  );
}
