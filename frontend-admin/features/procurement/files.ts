import { COSTING_PATH, PREORDERS_PATH, fetchWithToken } from "./api";
import type { ExpenseFile } from "./model/types";

/**
 * Скачать CSV ждущих (по поставке или по товару/варианту). Файл отдаётся только с токеном,
 * поэтому через fetch + blob, а не ссылкой.
 */
export async function downloadSubscribersCsv(scope: { batchId: number } | { productId?: string; variantId?: string | null }): Promise<void> {
  let path: string;
  let fallback: string;
  if ("batchId" in scope) {
    path = `${PREORDERS_PATH}/batches/${scope.batchId}/subscribers.csv`;
    fallback = `ozhidayut-postavka-${scope.batchId}.csv`;
  } else {
    const q = new URLSearchParams();
    if (scope.productId) q.set("productId", scope.productId);
    if (scope.variantId) q.set("variantId", scope.variantId);
    const qs = q.toString();
    path = `${PREORDERS_PATH}/subscribers.csv${qs ? `?${qs}` : ""}`;
    fallback = "ozhidayut.csv";
  }
  const res = await fetchWithToken(path);
  if (!res.ok) throw new Error(res.status === 404 ? "Выгрузка пока недоступна на сервере" : res.status === 403 ? "Недостаточно прав" : "Не удалось скачать CSV");
  const name = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(res.headers.get("Content-Disposition") ?? "")?.[1];
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name ? decodeURIComponent(name) : fallback;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Открыть документ расхода в новой вкладке. Файл отдаётся только с токеном (права «Финансы»), поэтому
 * не ссылкой, а через blob; вкладку открываем сразу по клику, иначе её заблокирует браузер.
 */
export async function openExpenseFile(file: ExpenseFile): Promise<void> {
  const tab = window.open("", "_blank");
  try {
    const res = await fetchWithToken(`${COSTING_PATH}/expense-files/${file.id}`);
    if (!res.ok) throw new Error(res.status === 403 ? "Нет права «Финансы»" : "Документ не открылся");
    const url = URL.createObjectURL(await res.blob());
    if (tab) tab.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    tab?.close();
    throw e;
  }
}
