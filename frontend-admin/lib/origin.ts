import { normalizeBaseUrl } from "@shop/core/http";

/** Origin бэкенда без `/api` (NEXT_PUBLIC_API_BASE_URL; локально — :8080). */
export const apiOrigin = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL, "http://localhost:8080");
