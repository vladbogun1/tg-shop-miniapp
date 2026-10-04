"use client";

/**
 * NpWarehouseMap — Nova-Poshta-style branch picker on an OpenStreetMap (Leaflet).
 * Opens on the whole of Ukraine, clusters pins, and fetches branches by the
 * current viewport (bbox) so 50k+ points stay fast. No text inputs — people pick
 * by panning/zooming the map and tapping a pin (then a detail sheet with a big
 * "Выбрать"). Only the category tabs (Всі/Відділення/Поштомати/Пункти) filter.
 * No API key / account needed (OSM tiles). Loaded client-only (next/dynamic).
 *
 * ChiSetup (v3): the surrounding chrome (category chips, map frame, detail sheet) uses the dark
 * system — pill chips, a 1px/12px frame, a graphite sheet — and every pin and cluster is orange
 * (the glyph still tells the category apart). OSM tiles stay light on purpose: inverting them
 * with a filter wrecks the street labels. ALL map logic — Leaflet, markercluster,
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
import { createPortal } from "react-dom";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { useT } from "@/i18n/context";
import { customerApi, type NpWarehouse, type NpCategory } from "@/lib/api";
import { sheetVariants } from "@/lib/motion";

const UA_CENTER: [number, number] = [49.0, 31.3];
const UA_ZOOM = 6;

type Cat = "all" | "branch" | "postomat" | "point";

const CAT_TABS: { key: Cat; labelKey: string }[] = [
  { key: "all", labelKey: "np.cat.all" },
  { key: "branch", labelKey: "np.cat.branch" },
  { key: "postomat", labelKey: "np.cat.postomat" },
  { key: "point", labelKey: "np.cat.point" },
];

/** One brand colour for every category — the white glyph inside the pin carries the type. */
const CAT_COLOR: Record<string, string> = {
  BRANCH: "#FF6600",
  POSTOMAT: "#FF6600",
  POINT: "#FF6600",
  OTHER: "#FF6600",
};

function catLabelKey(c?: NpCategory): string {
  return c === "POSTOMAT"
    ? "np.type.postomat"
    : c === "POINT"
      ? "np.type.point"
      : "np.type.branch";
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
        transform:rotate(-45deg);border:2px solid ${active ? "#fff" : "#0E0E10"};
        box-shadow:${active ? "0 0 0 3px rgba(255,102,0,.35),0 0 16px rgba(255,102,0,.8)" : "0 2px 6px rgba(0,0,0,.45)"};"></div>
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
}: {
  onSelect: (w: NpWarehouse) => void;
}) {
  const t = useT();
  const [category, setCategory] = useState<Cat>("all");
  const [items, setItems] = useState<NpWarehouse[]>([]);
  const [active, setActive] = useState<NpWarehouse | null>(null);
  const boundsRef = useRef<L.LatLngBounds | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // document.body only exists once mounted; the detail sheet is portalled into it (see below).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
    [category],
  );

  // Re-fetch the current viewport when the category filter changes.
  useEffect(() => {
    if (boundsRef.current) fetchBox(boundsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  return (
    <div className="flex flex-col gap-2.5">
      {/* Category tabs (pill chips, not inputs) */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1.5 pl-0.5 pt-0.5">
        {CAT_TABS.map((tab) => {
          const on = category === tab.key;
          return (
            <motion.button
              key={tab.key}
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => setCategory(tab.key)}
              className={`nb-chip tap min-h-0 shrink-0 px-3.5 py-1.5 text-[12px] uppercase tracking-[0.06em] ${on ? "nb-chip-active" : ""}`}
            >
              {t(tab.labelKey)}
            </motion.button>
          );
        })}
      </div>

      {/* Map frame — 1px hairline, 12px radius, isolated stacking (iOS) */}
      <div
        className="np-map relative isolate overflow-hidden rounded-[var(--r-card)] border border-[var(--line-strong)] bg-[var(--surface)] shadow-[0_8px_24px_-12px_var(--shadow)]"
        // Fit the map to what is actually left on screen (header ~60px, tabs ~40px, comment box
        // and the action bar ~200px) instead of a flat 62vh that pushed everything below the fold.
        style={{ height: "min(62vh, calc(100dvh - 320px))", minHeight: 300 }}
      >
        <div className="relative h-full w-full overflow-hidden">
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
            <ClusterLayer
              items={items}
              activeRef={active?.ref ?? null}
              onPick={setActive}
            />
          </MapContainer>

          {/* Hint pill (top), hidden once a pin is open */}
          {!active && (
            <div className="pointer-events-none absolute inset-x-0 top-2 z-[1000] flex justify-center px-2">
              <span className="font-display rounded-full border border-[var(--line-strong)] bg-[rgba(14,14,16,.85)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink)] shadow-[0_6px_18px_-6px_rgba(0,0,0,.6)] backdrop-blur-[4px]">
                {t("np.hint")}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Branch detail sheet, docked to the bottom of the SCREEN and rendered into <body>.
          Inside the map frame it landed below the fold as often as not: tapping a pin appeared to
          do nothing, and reaching "Выбрать это отделение" meant scrolling beside the map, because
          the map itself swallows the gesture. The portal is what makes "fixed" mean the viewport —
          the map frame is an isolated stacking context (kept for iOS) and the checkout step is
          animated with a transform, and either one would otherwise trap it. It deliberately covers
          the checkout action bar while open: "Далее" is disabled until a branch is picked anyway. */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {active && (
              <motion.div
                key={active.ref}
                variants={sheetVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="fixed inset-x-3 z-[1200] mx-auto max-w-[456px] rounded-[16px] border border-[var(--line-strong)] bg-[var(--surface)] p-3 shadow-[0_18px_40px_-12px_rgba(0,0,0,.8)]"
                style={{
                  bottom: "calc(var(--tabbar-h) + var(--safe-bottom) + 12px)",
                }}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r)] border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  >
                    {active.category === "POSTOMAT" ? (
                      <Box className="h-4 w-4" strokeWidth={2.25} />
                    ) : (
                      <Store className="h-4 w-4" strokeWidth={2.25} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-[15px] font-bold text-[var(--ink)]">
                      {t(catLabelKey(active.category))}{" "}
                      {active.number != null ? t("np.number", { n: active.number }) : ""}
                    </div>
                    <div className="mt-0.5 flex items-start gap-1 text-[12px] text-[var(--muted)]">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{active.description}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setActive(null)}
                    aria-label={t("common.close")}
                    className="tap grid h-8 w-8 min-h-0 min-w-0 shrink-0 place-items-center rounded-full bg-[var(--surface-3)] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
                  >
                    <X className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                </div>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onSelect(active)}
                  className="nb-accent nb-up tap mt-3 flex w-full items-center justify-center gap-2 py-3 text-[14px]"
                >
                  <Check className="h-5 w-5" strokeWidth={2.75} /> {t("np.confirm")}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
