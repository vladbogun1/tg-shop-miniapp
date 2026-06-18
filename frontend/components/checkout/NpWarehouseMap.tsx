"use client";

/**
 * NpWarehouseMap — pick a Nova Poshta branch by tapping a pin on an OpenStreetMap
 * (Leaflet) map. No API key / account needed (OSM tiles). Loaded client-only via
 * next/dynamic(ssr:false) because Leaflet touches `window`.
 *
 * Markers are rendered with a CSS divIcon (no marker image assets to bundle).
 * Caps at MAX pins for performance; the parent's search box narrows the set.
 */
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import type { NpWarehouse } from "@/lib/api";

const MAX = 400;
const DEFAULT_CENTER: [number, number] = [49.0, 31.5]; // Ukraine
const DEFAULT_ZOOM = 6;

type WithCoords = NpWarehouse & { lat: number; lng: number };

function hasCoords(w: NpWarehouse): w is WithCoords {
  return typeof w.lat === "number" && typeof w.lng === "number";
}

function pinIcon(active: boolean): L.DivIcon {
  const size = active ? 30 : 20;
  const color = active ? "var(--accent, #5ac8fa)" : "#0ea5e9";
  return L.divIcon({
    className: "np-pin",
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;
      background:${color};transform:rotate(-45deg);
      border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45);
      ${active ? "z-index:1000;" : ""}"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
}

/** Fit the map to the current warehouse set whenever it changes. */
function FitBounds({ points }: { points: WithCoords[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 15);
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [points, map]);
  return null;
}

export default function NpWarehouseMap({
  warehouses,
  selected,
  onSelect,
}: {
  warehouses: NpWarehouse[];
  selected: NpWarehouse | null;
  onSelect: (w: NpWarehouse) => void;
}) {
  const points = useMemo(() => warehouses.filter(hasCoords).slice(0, MAX), [warehouses]);
  const normalIcon = useMemo(() => pinIcon(false), []);
  const activeIcon = useMemo(() => pinIcon(true), []);

  return (
    <div className="relative overflow-hidden rounded-[var(--r-md)]" style={{ height: 320 }}>
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={points} />
        {points.map((w) => {
          const active = selected?.ref === w.ref;
          return (
            <Marker
              key={w.ref}
              position={[w.lat, w.lng]}
              icon={active ? activeIcon : normalIcon}
              eventHandlers={{ click: () => onSelect(w) }}
            >
              <Popup>
                <div style={{ minWidth: 160 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {w.number != null ? `№ ${w.number}` : "Отделение"}
                  </div>
                  <div style={{ fontSize: 12, marginBottom: 8 }}>{w.description}</div>
                  <button
                    type="button"
                    onClick={() => onSelect(w)}
                    style={{
                      width: "100%",
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: "none",
                      background: "#0ea5e9",
                      color: "#fff",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Выбрать это отделение
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
      {points.length >= MAX && (
        <div className="pointer-events-none absolute left-2 top-2 z-[1000] rounded-[var(--r-pill)] bg-black/60 px-2.5 py-1 text-[11px] text-white">
          Показаны первые {MAX}. Уточните поиск.
        </div>
      )}
    </div>
  );
}
