"use client";

/**
 * NpWarehouseMap — Nova-Poshta-style branch picker on an OpenStreetMap (Leaflet).
 * Opens on the whole of Ukraine (no city filter required), clusters pins, and
 * fetches branches by the current viewport (bbox) so 50k+ points stay fast.
 *   • category tabs: Всі / Відділення / Поштомати / Пункти
 *   • search box (number / address) + optional "jump to city"
 *   • tap a pin → detail sheet with a big "Выбрать"
 * No API key / account needed (OSM tiles). Loaded client-only (next/dynamic).
 */
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import L from "leaflet";
import "leaflet.markercluster";
import { Box, Search, Store, MapPin, X, Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { customerApi, type NpWarehouse, type NpCity, type NpCategory } from "@/lib/api";
import { GlassAutocomplete } from "@/components/ui/GlassAutocomplete";

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

function pinIcon(category: string | undefined, active: boolean): L.DivIcon {
  const size = active ? 32 : 22;
  const color = CAT_COLOR[category ?? "OTHER"] ?? CAT_COLOR.OTHER;
  return L.divIcon({
    className: "np-pin",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;
      background:${color};transform:rotate(-45deg);border:2px solid #fff;
      box-shadow:0 2px 6px rgba(0,0,0,.45);${active ? "outline:3px solid var(--accent,#5ac8fa);" : ""}"></div>`,
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

/** Imperatively fits the map to a target bounds when it changes (city jump). */
function FlyTo({ target }: { target: L.LatLngBounds | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.fitBounds(target, { padding: [40, 40], maxZoom: 15 });
  }, [target, map]);
  return null;
}

export default function NpWarehouseMap({ onSelect }: { onSelect: (w: NpWarehouse) => void }) {
  const [category, setCategory] = useState<Cat>("all");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<NpWarehouse[]>([]);
  const [active, setActive] = useState<NpWarehouse | null>(null);
  const [flyTarget, setFlyTarget] = useState<L.LatLngBounds | null>(null);
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
            q: q.trim() || undefined,
            limit: 1500,
          })
          .then(setItems)
          .catch(() => setItems([]));
      }, 350);
    },
    [category, q]
  );

  // Re-fetch the current viewport when the filter / query changes.
  useEffect(() => {
    if (boundsRef.current) fetchBox(boundsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, q]);

  // Jump to a city: fit the map to that city's branches.
  const jumpToCity = useCallback(async (c: NpCity) => {
    try {
      const whs = await customerApi.getNpWarehouses(c.ref, "");
      const pts = whs.filter((w) => typeof w.lat === "number" && typeof w.lng === "number");
      if (pts.length) {
        setFlyTarget(
          L.latLngBounds(pts.map((w) => [w.lat as number, w.lng as number] as [number, number]))
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="flex flex-col gap-2">
      {/* City jump + search */}
      <GlassAutocomplete<NpCity>
        label="Город (необязательно)"
        fetchItems={(query) => customerApi.getNpCities(query)}
        itemLabel={(c) => c.name}
        itemSubLabel={(c) => c.area}
        itemKey={(c) => c.ref}
        onSelect={jumpToCity}
        placeholderHint="Начните вводить город, чтобы приблизить карту"
      />
      <div className="glass tap flex items-center gap-2 rounded-[var(--r-md)] px-3.5 py-2.5">
        <Search className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Отделение / почтомат или адрес"
          className="w-full bg-transparent text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
        />
        {q && (
          <button onClick={() => setQ("")} aria-label="Очистить" className="text-[var(--text-muted)]">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Category tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {CAT_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setCategory(t.key)}
            className={`shrink-0 rounded-[var(--r-pill)] px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              category === t.key ? "glossy" : "glass text-[var(--text-muted)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Map */}
      <div className="relative overflow-hidden rounded-[var(--r-md)]" style={{ height: "56vh", minHeight: 340 }}>
        <MapContainer center={UA_CENTER} zoom={UA_ZOOM} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution="&copy; OpenStreetMap"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <BoundsWatcher onChange={fetchBox} />
          <FlyTo target={flyTarget} />
          <ClusterLayer items={items} activeRef={active?.ref ?? null} onPick={setActive} />
        </MapContainer>

        {/* Branch detail sheet (bottom) */}
        {active && (
          <div className="absolute inset-x-2 bottom-2 z-[1000] rounded-[var(--r-md)] bg-[#141a2c] p-3 shadow-[0_-4px_24px_rgba(0,0,0,.5)]">
            <div className="flex items-start gap-2">
              <span
                className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-white"
                style={{ background: CAT_COLOR[active.category ?? "OTHER"] }}
              >
                {active.category === "POSTOMAT" ? <Box className="h-4 w-4" /> : <Store className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold text-white">
                  {catLabel(active.category)} {active.number != null ? `№ ${active.number}` : ""}
                </div>
                <div className="mt-0.5 flex items-start gap-1 text-[12px] text-white/70">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{active.description}</span>
                </div>
              </div>
              <button
                onClick={() => setActive(null)}
                aria-label="Закрыть"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white/60 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => onSelect(active)}
              className="glossy mt-3 flex w-full items-center justify-center gap-2 rounded-[var(--r-md)] py-3 text-[15px] font-semibold"
            >
              <Check className="h-5 w-5" /> Выбрать это отделение
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
