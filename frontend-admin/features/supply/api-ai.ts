/**
 * «Прочитать с ИИ» в поставке: файлы накладной / скринов (`/api/admin/ai/files`) и задача чтения
 * (`/api/admin/ai/supply-jobs`). Любому админу поставок: ответ (закупочные цены) сервер отдаёт тому, кто запустил
 * задачу, и админу с правом «Финансы»; цену задачи — только последнему.
 */
import type { Schemas } from "@shop/core/api/schemas";
import type { AiJob } from "@/features/ai";
import { fetchWithToken } from "@/features/procurement";
import { apiDelete, apiGet, apiPost, uploadFile } from "@/lib/http";

const FILES = "/api/admin/ai/files";

/** Одна картинка на сервере (страница PDF — отдельная картинка). `page` у обычного файла пуст. */
export type AiFile = Omit<Schemas["FileDto"], "page"> & { page: number | null };

export type SupplyJobStart = Required<Schemas["AiAiSupplyJobsStart"]>;

export const supplyAiApi = {
  /** Один файл → его картинки (PDF даёт по картинке на страницу); `onProgress` — доля отправленного, 0…1. */
  upload: (file: File, onProgress?: (sent: number) => void) => uploadFile<AiFile[]>(FILES, file, onProgress),
  /** Загруженное, но ещё не прочитанное — после перезагрузки страницы файлы на месте. */
  waiting: () => apiGet<AiFile[]>(FILES),
  remove: (id: number) => apiDelete<void>(`${FILES}/${id}`),
  /** Картинка только с токеном, поэтому blob, а не ссылка. */
  content: async (id: number): Promise<Blob> => {
    const res = await fetchWithToken(`${FILES}/${id}/content`);
    if (!res.ok) throw new Error(res.status === 409 || res.status === 404 ? "Файл уже удалён" : "Не удалось открыть файл");
    return res.blob();
  },
  /** `idemKey` — один на нажатие: повтор вернёт ту же задачу. */
  start: (body: SupplyJobStart, idemKey: string) => apiPost<AiJob>("/api/admin/ai/supply-jobs", body, { "Idempotency-Key": idemKey }),
};
