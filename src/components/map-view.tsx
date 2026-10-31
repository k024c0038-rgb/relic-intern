"use client";

import { APIProvider, AdvancedMarker, Map, Pin, Polyline, useMap } from "@vis.gl/react-google-maps";
import { useEffect } from "react";

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
