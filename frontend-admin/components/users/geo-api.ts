/**
 * Users map API (GET /api/admin/users/geo*): visitors' last IP → city (offline DB-IP base on the
 * backend) and "online now" from the event journal. Kept next to the map so lib/api.ts stays as is.
 */
import { apiGet, type UserCardDto } from "@/lib/api";

export type GeoChannel = "MINIAPP" | "WEB";

export interface GeoOnline {
  miniapp: number;
  web: number;
  total: number;
  windowMinutes: number;
  at: string;
}

export interface GeoPoint {
  lat: number;
  lon: number;
  city: string | null;
  country: string | null;
  countryCode: string | null;
  visitors: number;
  users: number;
  anonymous: number;
  miniapp: number;
  web: number;
  lastSeen: string | null;
}

export interface GeoOverview {
  /** false = the server has no GeoIP base, so nobody has coordinates. */
  geoAvailable: boolean;
  days: number;
  visitors: number;
  withoutLocation: number;
  points: GeoPoint[];
  online: GeoOnline;
}

export interface GeoPointUser {
  user: UserCardDto & { locale?: string | null };
  ip: string;
  channel: GeoChannel;
  city: string | null;
  country: string | null;
  seenAt: string | null;
}

export interface GeoPointDetails {
  lat: number;
  lon: number;
  city: string | null;
  country: string | null;
  users: GeoPointUser[];
  anonymous: { ip: string; seenAt: string | null }[];
  anonymousTotal: number;
}

export const geoApi = {
  overview: (days: number) => apiGet<GeoOverview>(`/api/admin/users/geo?days=${days}`),
  online: () => apiGet<GeoOnline>("/api/admin/users/geo/online"),
  point: (lat: number, lon: number, days: number) =>
    apiGet<GeoPointDetails>(`/api/admin/users/geo/point?lat=${lat}&lon=${lon}&days=${days}`),
};
