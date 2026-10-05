/**
 * Coordinates of Nova Poshta branches, made safe to frame a map with.
 *
 * The NP directory is not clean: a branch can come with latitude and longitude swapped (Kharkiv's
 * postomat №23338 sits at 36.37 / 49.95 — that is northern Iran), with zeros, or with a stray point
 * far outside its city. Fitting the map to min/max of such a list flew "Харків" to the Caucasus.
 * Everything here is pure and cheap so the city search and the map can share it.
 */
import type { NpWarehouse } from "@shop/shared";

/** Ukraine with a margin — anything outside is a typo in the NP directory. */
const UA = { minLat: 44, maxLat: 52.6, minLng: 22, maxLng: 40.5 };

function inUa(lat: number, lng: number): boolean {
  return lat >= UA.minLat && lat <= UA.maxLat && lng >= UA.minLng && lng <= UA.maxLng;
}

/** A usable [lat, lng] for the branch, un-swapping obviously swapped pairs; null if there is none. */
export function npLatLng(w: Pick<NpWarehouse, "lat" | "lng">): [number, number] | null {
  const { lat, lng } = w;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (inUa(lat, lng)) return [lat, lng];
  if (inUa(lng, lat)) return [lng, lat];
  return null;
}

/** The same branch with its coordinates repaired (or dropped), so a pin lands where it really is. */
export function withSaneCoords<T extends NpWarehouse>(w: T): T {
  const p = npLatLng(w);
  if (!p) return w.lat == null && w.lng == null ? w : { ...w, lat: undefined, lng: undefined };
  return p[0] === w.lat && p[1] === w.lng ? w : { ...w, lat: p[0], lng: p[1] };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Rough distance in km — plenty for "is this point part of the city". */
function km(a: [number, number], b: [number, number]): number {
  const dLat = (a[0] - b[0]) * 111;
  const dLng = (a[1] - b[1]) * 111 * Math.cos(((a[0] + b[0]) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLng);
}

/**
 * Bounds of a city's branches: only sane points, and only those within `radiusKm` of the median
 * centre (one mis-geocoded branch must not stretch the frame across the country). Null when there
 * is nothing to frame.
 */
export function npCityBounds(
  warehouses: NpWarehouse[],
  radiusKm = 35
): [[number, number], [number, number]] | null {
  const pts = warehouses.map(npLatLng).filter((p): p is [number, number] => p !== null);
  if (pts.length === 0) return null;
  const c: [number, number] = [median(pts.map((p) => p[0])), median(pts.map((p) => p[1]))];
  const near = pts.filter((p) => km(p, c) <= radiusKm);
  const use = near.length > 0 ? near : [c];
  const lats = use.map((p) => p[0]);
  const lngs = use.map((p) => p[1]);
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}

/**
 * Search a city's branches by number ("23", "№ 23") or by address words, best matches first:
 * exact number, then numbers starting with the query, then address matches.
 */
export function searchWarehouses(warehouses: NpWarehouse[], query: string, limit = 30): NpWarehouse[] {
  const q = query.trim().toLowerCase().replace(/[№#]/g, " ").replace(/\s+/g, " ").trim();
  if (!q) return sortByNumber(warehouses).slice(0, limit);
  const words = q.split(" ");
  const numQ = /^\d+$/.test(q) ? q : null;
  const scored: { w: NpWarehouse; s: number }[] = [];
  for (const w of warehouses) {
    const num = w.number != null ? String(w.number) : "";
    const text = `${num} ${w.description ?? ""}`.toLowerCase();
    let s = -1;
    if (numQ && num === numQ) s = 0;
    else if (numQ && num.startsWith(numQ)) s = 1;
    else if (words.every((x) => text.includes(x))) s = 2;
    if (s >= 0) scored.push({ w, s });
  }
  scored.sort((a, b) => a.s - b.s || numOf(a.w) - numOf(b.w));
  return scored.slice(0, limit).map((x) => x.w);
}

function numOf(w: NpWarehouse): number {
  const n = Number(w.number);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

function sortByNumber(ws: NpWarehouse[]): NpWarehouse[] {
  return [...ws].sort((a, b) => numOf(a) - numOf(b));
}
