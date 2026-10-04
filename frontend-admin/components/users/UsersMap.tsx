"use client";

/**
 * UsersMap — world atlas of where visitors were last seen from (IP → city), Leaflet + markercluster
 * like the Nova Poshta branch map in the Mini App / site (frontend/components/checkout/NpWarehouseMap):
 * same OSM tiles (darkened with a CSS filter to sit in the graphite theme), same cluster layer.
 * Each point is a city; its dot grows with the number of visitors, and a cluster shows the SUM of
 * the visitors inside it (not the number of cities). Client-only — loaded with next/dynamic.
 */
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import L from "leaflet";
import "leaflet.markercluster";
import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import type { GeoPoint } from "./geo-api";

const WORLD_CENTER: [number, number] = [30, 15];
const WORLD_ZOOM = 2;

type CountedMarker = L.Marker & { options: L.MarkerOptions & { visitors?: number } };

/** Dot diameter by visitor count: 1 → 14px, grows with log so 1 000 stays on screen (~46px). */
function dotSize(n: number): number {
  return Math.round(Math.min(48, 14 + Math.log2(Math.max(1, n)) * 3.2));
}

function label(n: number): string {
  return n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function pointIcon(n: number, active: boolean): L.DivIcon {
  const size = dotSize(n) + (active ? 6 : 0);
  return L.divIcon({
    className: "um-dot-wrap",
    html: `<div class="um-dot${active ? " um-dot--active" : ""}" style="width:${size}px;height:${size}px">${
      n > 1 && size >= 20 ? `<span>${label(n)}</span>` : ""
    }</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function clusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const sum = cluster
    .getAllChildMarkers()
    .reduce((acc, m) => acc + ((m as CountedMarker).options.visitors ?? 1), 0);
  const size = dotSize(sum) + 10;
  return L.divIcon({
    className: "um-dot-wrap",
    html: `<div class="um-cluster" style="width:${size}px;height:${size}px"><span>${label(sum)}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function ClusterLayer({
  points,
  activeKey,
  onPick,
}: {
  points: GeoPoint[];
  activeKey: string | null;
  onPick: (p: GeoPoint) => void;
}) {
  const map = useMap();
  const groupRef = useRef<L.MarkerClusterGroup | null>(null);
  const pickRef = useRef(onPick);
  useEffect(() => {
    pickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    const group = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 50,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      iconCreateFunction: clusterIcon,
    });
    groupRef.current = group;
    map.addLayer(group);
    return () => {
      map.removeLayer(group);
      groupRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.clearLayers();
    const markers = points.map((p) => {
      const m = L.marker([p.lat, p.lon], {
        icon: pointIcon(p.visitors, activeKey === pointKey(p)),
        keyboard: true,
        title: `${p.city ?? p.country ?? "?"} — ${p.visitors}`,
        riseOnHover: true,
      }) as CountedMarker;
      m.options.visitors = p.visitors;
      m.on("click", () => pickRef.current(p));
      return m;
    });
    group.addLayers(markers);
  }, [points, activeKey]);

  return null;
}

/** Fits the points once (first load) so the owner lands on where the users are, not on the ocean. */
function FitOnce({ points, resetKey }: { points: GeoPoint[]; resetKey: number }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number]));
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 5, animate: false });
    fitted.current = true;
  }, [map, points]);
  useEffect(() => {
    if (resetKey > 0) map.flyTo(WORLD_CENTER, WORLD_ZOOM, { duration: 0.6 });
  }, [map, resetKey]);
  return null;
}

export function pointKey(p: { lat: number; lon: number }): string {
  return `${p.lat},${p.lon}`;
}

export default function UsersMap({
  points,
  activeKey,
  onPick,
  resetKey,
}: {
  points: GeoPoint[];
  activeKey: string | null;
  onPick: (p: GeoPoint) => void;
  /** Bumped by «Весь мир» to fly back to the whole world. */
  resetKey: number;
}) {
  return (
    <MapContainer
      center={WORLD_CENTER}
      zoom={WORLD_ZOOM}
      minZoom={2}
      maxZoom={14}
      worldCopyJump
      scrollWheelZoom
      className="um-map"
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · IP → город: <a href="https://db-ip.com">DB-IP</a> (CC BY 4.0)'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClusterLayer points={points} activeKey={activeKey} onPick={onPick} />
      <FitOnce points={points} resetKey={resetKey} />
    </MapContainer>
  );
}
