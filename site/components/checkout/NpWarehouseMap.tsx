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
 * bbox fetching (@shop/customer/delivery/map: useWarehouseMapData), category filtering,
 * pin-by-category, the detail sheet and "Выбрать" confirm — is unchanged. iOS
 * scroll handling preserved (scrollWheelZoom + isolated frame). Leaflet tiles
 * stay as-is.
 */
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import L from "leaflet";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { MapContainer, TileLayer } from "react-leaflet";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/context";
import type { NpCategory, NpWarehouse } from "@shop/core/types";
import { api } from "@/lib/api";
import { BoundsWatcher, ClusterLayer, FocusController } from "@shop/customer/delivery/map/parts";
import { CAT_TABS, UA_CENTER, UA_ZOOM, useWarehouseMapData, type MapFocus } from "@shop/customer/delivery/map/model";

export type { MapFocus };

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
  const { category, setCategory, fetchBox, pins } = useWarehouseMapData(api.checkout, selected);

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
            <FocusController focus={focus} instantFirst={false} />
            <ClusterLayer items={pins} activeRef={selected?.ref ?? null} onPick={onSelect} pinIcon={pinIcon} />
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

