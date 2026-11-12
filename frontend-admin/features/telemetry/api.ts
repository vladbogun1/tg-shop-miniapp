/**
 * Телеметрия админки: POST /api/admin/telemetry (V101). Отправка — keepalive-запросом с Bearer-токеном в заголовке:
 * `sendBeacon` заголовки ставить не умеет, а токен админки лежит в localStorage, не в cookie. Ошибки глотаются,
 * 401 не разлогинивает (это не обычный клиент `apiPost`).
 */
import type { Schemas } from "@shop/core/api/schemas";
import { apiPostOnUnload } from "@/lib/http";
import { getAccessToken } from "@/lib/session";

export type TelemetryBatchBody = Schemas["TelemetryBatch"];

export const TELEMETRY_PATH = "/api/admin/telemetry";

/** `false` — нет токена (сессия закончилась), отправлять нечем. */
export function sendTelemetry(body: TelemetryBatchBody): boolean {
  if (!getAccessToken()) return false;
  apiPostOnUnload(TELEMETRY_PATH, body);
  return true;
}
