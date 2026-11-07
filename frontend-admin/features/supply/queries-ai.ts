"use client";

import { hasErrorCode } from "@shop/core/errors";
import { useApiMutation } from "@shop/ui/mutation";
import { aiApi, aiKeys, newIdemKey, type AiJob } from "@/features/ai";
import { supplyAiApi, type SupplyJobStart } from "./api-ai";

/**
 * Старт чтения: «уже идёт» (409 AI_JOB_ACTIVE — тот же набор файлов) не плодит вторую задачу, а возвращает идущую,
 * чтобы экран просто продолжил её показывать. Ключ идемпотентности — на каждое нажатие свой.
 */
export function useStartSupplyJob() {
  return useApiMutation<AiJob, SupplyJobStart>({
    mutationFn: async (body) => {
      try {
        return await supplyAiApi.start(body, newIdemKey());
      } catch (e) {
        if (hasErrorCode(e, "AI_JOB_ACTIVE")) {
          const running = (await aiApi.active().catch(() => [])).find((j) => j.feature === "SUPPLY_EXTRACT");
          if (running) return running;
        }
        throw e;
      }
    },
    invalidate: [aiKeys.active(), aiKeys.summary(), aiKeys.tasksAll(), aiKeys.widget()],
    errorFallback: "Не удалось запустить чтение",
  });
}
