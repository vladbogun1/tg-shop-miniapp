import type { Schemas } from "@shop/core/api/schemas";
import { apiGet, apiPost } from "@/lib/api";

export type RevalidateResult = Schemas["RevalidateResult"];
/** Итог последнего обновления сайта: `enabled=false` — SITE_REVALIDATE_URL не задан. */
/**
 * Поля, которых бэкенд сейчас не шлёт (форма до слияния эндпоинта), читаются терпимо — как раньше в админке.
 */
export type RevalidateStatus = Schemas["Status"] & {
  configured?: boolean;
  lastAt?: string | null;
  lastRunAt?: string | null;
  ok?: boolean | null;
  success?: boolean | null;
  error?: string | null;
  message?: string | null;
};

export const siteApi = {
  /** 200 даже если сайт не ответил: тогда `ok: false` + `error`. */
  revalidate: () => apiPost<RevalidateResult>("/api/admin/site/revalidate", {}),
  status: () => apiGet<RevalidateStatus>("/api/admin/site/revalidate/status"),
};
