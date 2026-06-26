"use client";

/**
 * NpWarehouseMap — Nova-Poshta-style branch picker on an OpenStreetMap (Leaflet).
 * Opens on the whole of Ukraine, clusters pins, and fetches branches by the
 * current viewport (bbox) so 50k+ points stay fast. No text inputs — people pick
 * by panning/zooming the map and tapping a pin (then a detail sheet with a big
 * "Выбрать"). Only the category tabs (Всі/Відділення/Поштомати/Пункти) filter.
 * No API key / account needed (OSM tiles). Loaded client-only (next/dynamic).
 *
 * NEO-BRUTALISM redesign: the surrounding chrome (category chips, map frame,
 * detail sheet) is restyled to the neo system (thick ink borders, hard offset
 * shadows, sharp corners, heavy type). ALL map logic — Leaflet, markercluster,
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
import { AnimatePresence, motion } from "framer-motion";
import { Box, Store, MapPin, X, Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { customerApi, type NpWarehouse, type NpCategory } from "@/lib/api";
import { sheetVariants } from "@/lib/motion";

const UA_CENTER: [number, number] = [49.0, 31.3];
const UA_ZOOM = 6;

type Cat = "all" | "branch" | "postomat" | "point";

const CAT_TABS: { key: Cat; label: string }[] = [
  { key: "all", label: "Всі" },
  { key: "branch", label: "Відділення" },
  { key: "postomat", label: "Поштомати" },
  { key: "point", label: "Пункти" },
];

const CAT_COLOR: Record<string, string> = {
  BRANCH: "#e0322f",
  POSTOMAT: "#16a34a",
  POINT: "#0891b2",
  OTHER: "#6b7280",
};

function catLabel(c?: NpCategory): string {
  return c === "POSTOMAT" ? "Почтомат" : c === "BRANCH" ? "Отделение" : c === "POINT" ? "Пункт" : "Отделение";
}

/** White monochrome glyph per category so the type reads at a glance (not just colour). */
function glyphSvg(category: string | undefined, g: number): string {
  const open = `<svg viewBox="0 0 24 24" width="${g}" height="${g}" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">`;
  const body =
    category === "POSTOMAT"
      ? '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M4 9h16M4 15h16M12 3v18"/>' // locker grid
      : category === "BRANCH"
        ? '<path d="M4 9.5 5.2 4h13.6L20 9.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-5h4v5"/>' // storefront
        : category === "POINT"
          ? '<path d="M5 8 6.5 4h11L19 8"/><path d="M5 8v12h14V8"/><path d="M4 13h5l1 2h4l1-2h5"/>' // pickup box
          : '<circle cx="12" cy="12" r="3.5" fill="#fff" stroke="none"/>';
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
        transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45);
        ${active ? "outline:3px solid var(--accent,#5ac8fa);outline-offset:1px;" : ""}"></div>
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

/** Reports the viewport bounds on move/zoom + once on mount. */
function BoundsWatcher({ onChange }: { onChange: (b: L.LatLngBounds) => void }) {
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

export default function NpWarehouseMap({ onSelect }: { onSelect: (w: NpWarehouse) => void }) {
  const [category, setCategory] = useState<Cat>("all");
  const [items, setItems] = useState<NpWarehouse[]>([]);
  const [active, setActive] = useState<NpWarehouse | null>(null);
  const boundsRef = useRef<L.LatLngBounds | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchBox = useCallback(
    (b: L.LatLngBounds) => {
      boundsRef.current = b;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const sw = b.getSouthWest();
        const ne = b.getNorthEast();
        customerApi
          .getNpWarehousesBbox({
            minLat: sw.lat,
            maxLat: ne.lat,
            minLng: sw.lng,
            maxLng: ne.lng,
            category,
            limit: 1500,
          })
          .then(setItems)
          .catch(() => setItems([]));
      }, 350);
    },
    [category]
  );

  // Re-fetch the current viewport when the category filter changes.
  useEffect(() => {
    if (boundsRef.current) fetchBox(boundsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  return (
    <div className="flex flex-col gap-2.5">
      {/* Category tabs (neo chips, not inputs) */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1.5 pl-0.5 pt-0.5">
        {CAT_TABS.map((t) => {
          const on = category === t.key;
          return (
            <motion.button
              key={t.key}
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => setCategory(t.key)}
              className="tap min-h-0 shrink-0 rounded-[var(--r)] border-[2.5px] border-[var(--line)] px-3.5 py-1.5 text-[12px] font-extrabold uppercase tracking-wide transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              style={{
                background: on ? "var(--accent)" : "var(--surface)",
                color: on ? "var(--accent-ink)" : "var(--ink)",
                boxShadow: on ? "3px 3px 0 var(--shadow)" : "none",
              }}
            >
              {t.label}
            </motion.button>
          );
        })}
      </div>

      {/* Map frame — thick ink border, hard offset shadow, isolated stacking (iOS) */}
      <div
        className="relative isolate overflow-hidden rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--surface)] p-1 shadow-[5px_5px_0_var(--shadow)]"
        style={{ height: "62vh", minHeight: 360 }}
      >
        <div className="relative h-full w-full overflow-hidden rounded-[1px]">
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
            <ClusterLayer items={items} activeRef={active?.ref ?? null} onPick={setActive} />
          </MapContainer>

          {/* Hint pill (top), hidden once a pin is open */}
          {!active && (
            <div className="pointer-events-none absolute inset-x-0 top-2 z-[1000] flex justify-center px-2">
              <span className="rounded-[var(--r)] border-[2.5px] border-[var(--line)] bg-[var(--c3)] px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-[var(--ink)] shadow-[3px_3px_0_var(--shadow)]">
                Тапните по отделению на карте
              </span>
            </div>
          )}

          {/* Branch detail sheet (bottom) */}
          <AnimatePresence>
            {active && (
              <motion.div
                key={active.ref}
                variants={sheetVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="absolute inset-x-2 bottom-2 z-[1000] rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--surface)] p-3 shadow-[5px_5px_0_var(--shadow)]"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r)] border-[2.5px] border-[var(--line)] text-white"
                    style={{ background: CAT_COLOR[active.category ?? "OTHER"] }}
                  >
                    {active.category === "POSTOMAT" ? (
                      <Box className="h-4 w-4" strokeWidth={2.75} />
                    ) : (
                      <Store className="h-4 w-4" strokeWidth={2.75} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-extrabold text-[var(--ink)]">
                      {catLabel(active.category)}{" "}
                      {active.number != null ? `№ ${active.number}` : ""}
                    </div>
                    <div className="mt-0.5 flex items-start gap-1 text-[12px] font-medium text-[var(--muted)]">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{active.description}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setActive(null)}
                    aria-label="Закрыть"
                    className="tap grid h-8 w-8 min-h-0 min-w-0 shrink-0 place-items-center rounded-[var(--r)] border-[2.5px] border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] transition-transform active:translate-x-[2px] active:translate-y-[2px]"
                  >
                    <X className="h-4 w-4" strokeWidth={3} />
                  </button>
                </div>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onSelect(active)}
                  className="tap mt-3 flex w-full items-center justify-center gap-2 rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--accent)] py-3 text-[14px] font-extrabold uppercase tracking-wide text-[var(--accent-ink)] shadow-[4px_4px_0_var(--shadow)] transition-transform active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
                >
                  <Check className="h-5 w-5" strokeWidth={3} /> Выбрать это отделение
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
