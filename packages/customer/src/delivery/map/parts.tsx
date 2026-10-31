"use client";

/**
 * Общие части карты отделений на Leaflet — всё, что не про вид: слой кластеров, слежение за окном и размером,
 * наведение. Пины (`pinIcon`) и рамка у приложений свои: подставляются параметром. Грузится только вместе с картой
 * (`next/dynamic`, ssr: false), в основной бандл не попадает.
 */
import type { NpWarehouse } from "@shop/core/types";
import L from "leaflet";
import "leaflet.markercluster";
import { useEffect, useRef } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import { BRANCH_ZOOM, type MapFocus } from "./model";

/** Слой кластеров по списку отделений (leaflet.markercluster). */
export function ClusterLayer({
  items,
  activeRef,
  onPick,
  pinIcon,
}: {
  items: NpWarehouse[];
  activeRef: string | null;
  onPick: (w: NpWarehouse) => void;
  pinIcon: (category: string | undefined, active: boolean) => L.DivIcon;
}) {
  const map = useMap();
  const groupRef = useRef<L.MarkerClusterGroup | null>(null);

  useEffect(() => {
    const group = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 55,
      showCoverageOnHover: false,
      // Выбранное отделение показано на BRANCH_ZOOM — там оно обязано быть отдельным пином, а не кластером.
      disableClusteringAtZoom: BRANCH_ZOOM,
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
    const markers = items
      .filter((w) => typeof w.lat === "number" && typeof w.lng === "number")
      .map((w) => {
        const m = L.marker([w.lat as number, w.lng as number], { icon: pinIcon(w.category, activeRef === w.ref) });
        m.on("click", () => onPick(w));
        return m;
      });
    group.addLayers(markers);
  }, [items, activeRef, onPick, pinIcon]);

  return null;
}

/**
 * Двигает карту, когда просит родитель. `instantFirst` (Mini App): первое наведение, с которым карта открывается,
 * применяется без анимации — карта не показывает сначала всю страну, а потом летит. Сайт летит всегда.
 */
export function FocusController({ focus, instantFirst }: { focus: MapFocus | null; instantFirst: boolean }) {
  const map = useMap();
  const first = useRef(true);
  useEffect(() => {
    if (!focus) return;
    const instant = instantFirst && first.current;
    first.current = false;
    // Рамку могли измерить, пока она ещё устраивалась: лететь с устаревшим размером — Leaflet центрирует не туда.
    map.invalidateSize({ animate: false });
    if (focus.bounds) {
      if (instant) map.fitBounds(focus.bounds, { padding: [24, 24], maxZoom: 14, animate: false });
      else map.flyToBounds(focus.bounds, { padding: [24, 24], maxZoom: 14, duration: 0.8 });
    } else if (focus.center) {
      const zoom = focus.zoom ?? Math.max(map.getZoom(), BRANCH_ZOOM);
      if (instant) map.setView(focus.center, zoom, { animate: false });
      else map.flyTo(focus.center, zoom, { duration: 0.8 });
    }
  }, [focus, map, instantFirst]);
  return null;
}

/** Перемеряет карту, когда рамка меняет размер (переключение режима, динамический импорт, въезд шага). */
export function SizeWatcher() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

/** Сообщает границы окна при сдвиге/масштабе и один раз при монтировании. */
export function BoundsWatcher({ onChange }: { onChange: (b: L.LatLngBounds) => void }) {
  const map = useMapEvents({
    moveend: () => onChange(map.getBounds()),
    zoomend: () => onChange(map.getBounds()),
  });
  // Первое сообщение — при монтировании; дальше окно сообщают события карты (свежий `onChange` берём из ref).
  const latest = useRef(onChange);
  latest.current = onChange;
  useEffect(() => {
    latest.current(map.getBounds());
  }, [map]);
  return null;
}
