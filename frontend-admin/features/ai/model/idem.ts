/** Ключ идемпотентности одного нажатия: повтор того же запроса (сеть, двойной клик) вернёт ту же задачу. */
import { nowMs } from "@shop/core/time";

export function newIdemKey(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && "randomUUID" in c) return c.randomUUID();
  return `k${nowMs().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
