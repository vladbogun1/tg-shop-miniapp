"use client";

/**
 * NpWarehouseMap — copied from the Mini App (frontend/components/checkout/NpWarehouseMap.tsx) and
 * adapted for the website: a `focus` prop lets the city / branch inputs fly the map to a city or to
 * one branch, the picked branch stays highlighted, and tapping a pin picks it straight away (the
 * branch field above the map shows it — no confirm sheet). Coordinates go through `npLatLng`
 * (swapped / junk pairs in the NP directory), and only the latest bbox response is applied.
 *
 * Original notes:
 * NpWarehouseMap — Nova-Poshta-style branch picker on an OpenStreetMap (Leaflet).
 * Opens on the whole of Ukraine, clusters pins, and fetches branches by the
 * current viewport (bbox) so 50k+ points stay fast. No text inputs — people pick
 * by panning/zooming the map and tapping a pin (then a detail sheet with a big
 * "Выбрать"). Only the category tabs (Всі/Відділення/Поштомати/Пункти) filter.
 * No API key / account needed (OSM tiles). Loaded client-only (next/dynamic).
 *
 * v3 (DESIGN-V3 §6): the surrounding chrome (category chips, map frame, detail
 * sheet) follows the dark ChiSetup system; pins and clusters are brand orange. ALL map logic — Leaflet, markercluster,
 * bbox fetching (customerApi.getNpWarehousesBbox), category filtering,
 * pin-by-category, the detail sheet and "Выбрать" confirm — is unchanged. iOS
 * scroll handling preserved (scrollWheelZoom + isolated frame). Leaflet tiles
 * stay as-is.
 */
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import L from "leaflet";
import "leaflet.markercluster";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/context";
import type { NpCategory, NpWarehouse } from "@shop/shared";
import { api } from "@/lib/api";
import { withSaneCoords } from "@shop/shared";

const UA_CENTER: [number, number] = [49.0, 31.3];
const UA_ZOOM = 6;
/** Zoom a single picked branch is shown at (clustering is off from here on). */
const BRANCH_ZOOM = 17;

type Cat = "all" | "branch" | "postomat" | "point";

const CAT_TABS: { key: Cat; labelKey: MessageKey }[] = [
  { key: "all", labelKey: "np.cat.all" },
  { key: "branch", labelKey: "np.cat.branch" },
  { key: "postomat", labelKey: "np.cat.postomat" },
  { key: "point", labelKey: "np.cat.point" },
];

/** v3: every pin is brand orange (DESIGN-V3 §6) — the white glyph tells the types apart. */
const CAT_COLOR: Record<string, string> = {
  BRANCH: "#FF6600",
  POSTOMAT: "#FF6600",
  POINT: "#FF6600",
  OTHER: "#A1A1AA",
};

function catLabelKey(c?: NpCategory): MessageKey {
  return c === "POSTOMAT"
    ? "np.type.postomat"
    : c === "POINT"
      ? "np.type.point"
      : "np.type.branch";
}

/** White monochrome glyph per category so the type reads at a glance (not just colour). */
function glyphSvg(category: string | undefined, g: number): string {
  const open = `<svg viewBox="0 0 24 24" width="${g}" height="${g}" fill="none" stroke="#0E0E10" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">`;
  const body =
    category === "POSTOMAT"
      ? '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M4 9h16M4 15h16M12 3v18"/>' // locker grid
      : category === "BRANCH"
        ? '<path d="M4 9.5 5.2 4h13.6L20 9.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-5h4v5"/>' // storefront
        : category === "POINT"
          ? '<path d="M5 8 6.5 4h11L19 8"/><path d="M5 8v12h14V8"/><path d="M4 13h5l1 2h4l1-2h5"/>' // pickup box
          : '<circle cx="12" cy="12" r="3.5" fill="#0E0E10" stroke="none"/>';
  return open + body + "</svg>";
}

function pinIcon(category: string | undefined, active: boolean): L.DivIcon {
  const size = active ? 36 : 28;
  const color = CAT_COLOR[category ?? "OTHER"] ?? CAT_COLOR.OTHER;
  const g = active ? 20 : 15;
  return L.divIcon({
    className: "np-pin",
    html: `<div style="position:relative;width:${size}px;height:${size}px;">
      <div style="position:absolute;inset:0;border-radius:50% 50% 50% 0;background:${color};
        transform:rotate(-45deg);border:2px solid #0E0E10;box-shadow:0 2px 8px rgba(0,0,0,.5)${active ? ",0 0 16px rgba(255,102,0,.9)" : ""};
        ${active ? "outline:2px solid #fff;outline-offset:1px;" : ""}"></div>
      <div style="position:absolute;left:0;top:0;width:${size}px;height:${Math.round(size * 0.78)}px;
        display:flex;align-items:center;justify-content:center;">${glyphSvg(category, g)}</div>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  });
}

/** Cluster layer driven by the warehouse list (leaflet.markercluster). */
function ClusterLayer({
  items,
  activeRef,
  onPick,
}: {
  items: NpWarehouse[];
  activeRef: string | null;
  onPick: (w: NpWarehouse) => void;
}) {
  const map = useMap();
  const groupRef = useRef<L.MarkerClusterGroup | null>(null);

  useEffect(() => {
    const group = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 55,
      showCoverageOnHover: false,
      // A branch picked in the field is flown to at BRANCH_ZOOM — it must show as its own pin there.
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
        const m = L.marker([w.lat as number, w.lng as number], {
          icon: pinIcon(w.category, activeRef === w.ref),
        });
        m.on("click", () => onPick(w));
        return m;
      });
    group.addLayers(markers);
  }, [items, activeRef, onPick]);

  return null;
}

/** Moves the map when the parent asks (city / branch fields, a tapped pin). */
function FocusController({ focus }: { focus: MapFocus | null }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    // The map may have been laid out while its frame was still settling (dynamic import, the
    // delivery block expanding): fly with stale size and Leaflet centres on the wrong point.
    map.invalidateSize({ animate: false });
    if (focus.bounds) {
      map.flyToBounds(focus.bounds, { padding: [24, 24], maxZoom: 14, duration: 0.8 });
    } else if (focus.center) {
      const zoom = focus.zoom ?? Math.max(map.getZoom(), BRANCH_ZOOM);
      map.flyTo(focus.center, zoom, { duration: 0.8 });
    }
  }, [focus, map]);
  return null;
}

export interface MapFocus {
  /** Changes on every request so the same city can be focused twice. */
  key: number;
  center?: [number, number];
  /** Defaults to BRANCH_ZOOM (or closer, if the map already is). */
  zoom?: number;
  bounds?: [[number, number], [number, number]];
}

/** Reports the viewport bounds on move/zoom + once on mount. */
function BoundsWatcher({
  onChange,
}: {
  onChange: (b: L.LatLngBounds) => void;
}) {
  const map = useMapEvents({
    moveend: () => onChange(map.getBounds()),
    zoomend: () => onChange(map.getBounds()),
  });
  useEffect(() => {
    onChange(map.getBounds());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export default function NpWarehouseMap({
  onSelect,
  focus = null,
  selected = null,
}: {
  /** A tapped pin — picked straight away; the branch field above shows it. */
  onSelect: (w: NpWarehouse) => void;
  focus?: MapFocus | null;
  selected?: NpWarehouse | null;
}) {
  const t = useT();
  const [category, setCategory] = useState<Cat>("all");
  const [items, setItems] = useState<NpWarehouse[]>([]);
  const boundsRef = useRef<L.LatLngBounds | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Only the newest bbox response may land: a slow one for an older viewport would otherwise
  // replace the pins of the city the map has just flown to.
  const seq = useRef(0);

  const fetchBox = useCallback(
    (b: L.LatLngBounds) => {
      boundsRef.current = b;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const sw = b.getSouthWest();
        const ne = b.getNorthEast();
        const mine = ++seq.current;
        api
          .npWarehousesBbox({
            minLat: sw.lat,
            maxLat: ne.lat,
            minLng: sw.lng,
            maxLng: ne.lng,
            category,
            limit: 1500,
          })
          .then((list) => {
            if (mine === seq.current) setItems(list);
          })
          .catch(() => {
            if (mine === seq.current) setItems([]);
          });
      }, 350);
    },
    [category],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Re-fetch the current viewport when the category filter changes.
  useEffect(() => {
    if (boundsRef.current) fetchBox(boundsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // Repaired coordinates, plus the picked branch even before (or without) its viewport response,
  // so it is highlighted the moment the map arrives.
  const pins = useMemo(() => {
    const list = items.map(withSaneCoords);
    if (selected && !list.some((w) => w.ref === selected.ref)) list.push(withSaneCoords(selected));
    return list;
  }, [items, selected]);

  return (
    <div className="flex flex-col gap-2.5">
      {/* Category tabs (chips, not inputs) */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1.5 pl-0.5 pt-0.5">
        {CAT_TABS.map((tab) => {
          const on = category === tab.key;
          return (
            <motion.button
              key={tab.key}
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => setCategory(tab.key)}
              className={`nb-chip tap min-h-0 shrink-0 px-3.5 py-1.5 text-[12px] uppercase tracking-[.06em] transition-colors ${
                on ? "nb-chip-active" : "text-[var(--muted)] hover:text-[var(--ink)]"
              }`}
            >
              {t(tab.labelKey)}
            </motion.button>
          );
        })}
      </div>

      {/* Map frame — hairline border, 12px radius, isolated stacking (iOS). Tiles stay light. */}
      <div
        className="relative isolate overflow-hidden rounded-[var(--r-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-1"
        style={{ height: "min(520px, 62vh)", minHeight: 320 }}
      >
        <div className="relative h-full w-full overflow-hidden rounded-[8px]">
          <MapContainer
            center={UA_CENTER}
            zoom={UA_ZOOM}
            scrollWheelZoom
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution="&copy; OpenStreetMap"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <BoundsWatcher onChange={fetchBox} />
            <FocusController focus={focus} />
            <ClusterLayer items={pins} activeRef={selected?.ref ?? null} onPick={onSelect} />
          </MapContainer>

          {/* Top pill: the hint, or the picked branch once there is one */}
          <div className="pointer-events-none absolute inset-x-0 top-2 z-[1000] flex justify-center px-2">
            {selected ? (
              <span className="flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-[var(--accent)] bg-[rgba(14,14,16,.88)] px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--ink)] backdrop-blur-sm">
                <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent-hi)]" strokeWidth={3} />
                <span className="truncate">
                  {t(catLabelKey(selected.category))}
                  {selected.number != null ? ` ${t("np.number", { n: selected.number })}` : ""}
                </span>
              </span>
            ) : (
              <span className="rounded-full border border-[var(--line-strong)] bg-[rgba(14,14,16,.88)] px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--ink)] backdrop-blur-sm">
                {t("np.hint")}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

