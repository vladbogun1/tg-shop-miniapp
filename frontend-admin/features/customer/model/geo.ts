import type { GeoPoint } from "./types";

export const GEO_DAY_OPTIONS = [
  { value: "1", label: "24 ч" },
  { value: "7", label: "7 дн" },
  { value: "30", label: "30 дн" },
  { value: "90", label: "90 дн" },
] as const;
export type GeoDaysOption = (typeof GEO_DAY_OPTIONS)[number]["value"];

export function pointKey(p: { lat: number; lon: number }): string {
  return `${p.lat},${p.lon}`;
}

export function placeName(p: { city: string | null; country: string | null }): string {
  return [p.city, p.country].filter(Boolean).join(", ") || "Неизвестно";
}

export function locatedVisitors(points: GeoPoint[]): number {
  return points.reduce((a, p) => a + p.visitors, 0);
}

export function countryCount(points: GeoPoint[]): number {
  return new Set(points.map((p) => p.countryCode).filter(Boolean)).size;
}
