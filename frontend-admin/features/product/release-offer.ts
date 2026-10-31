import { QUERY_PRESETS } from "@shop/core/query";
import { toast } from "@shop/ui/toast";
import type { QueryClient } from "@tanstack/react-query";
import { plural } from "@/features/catalog";
import { ApiError } from "@/lib/api";
import { peopleOfRows, preordersApi, releaseSummary, sumReleases, type Demand } from "@/features/procurement";
import { productKeys } from "./keys";

/** Раздать брони по строкам: одна строка — один запрос, строго по очереди. */
async function releaseRows(rows: Demand[]) {
  const results = [];
  for (const r of rows) results.push(await preordersApi.release(r.productId, r.variantId ?? null));
  return sumReleases(results);
}

/**
 * Остаток подняли вручную, а люди ждут: предложить (но не делать сам) раздать брони.
 * Запускается после сохранения; нет эндпоинта (старый бэкенд) — просто нет предложения.
 */
export async function offerRelease(qc: QueryClient, productId: string, raised: (string | null)[]): Promise<void> {
  if (raised.length === 0) return;
  let demand: Demand[];
  try {
    demand = await qc.fetchQuery({ queryKey: productKeys.demand(), queryFn: preordersApi.demand, staleTime: QUERY_PRESETS.live.staleTime });
  } catch {
    return;
  }
  const rows = demand.filter((d) => d.productId === productId && raised.includes(d.variantId ?? null));
  const people = peopleOfRows(rows);
  if (people === 0) return;
  toast.info(`${people} ${plural(people, "человек ждёт", "человека ждут", "человек ждут")} этот товар. Раздать брони?`, {
    action: {
      label: "Раздать брони",
      onClick: () => {
        releaseRows(rows)
          .then((res) => {
            (res.heldPeople > 0 ? toast.success : toast.info)(releaseSummary(res));
            qc.invalidateQueries({ queryKey: productKeys.preordersRoot() });
            qc.invalidateQueries({ queryKey: productKeys.root() });
          })
          .catch((e) => toast.error(e instanceof ApiError ? e.message : "Не удалось раздать брони"));
      },
    },
  });
}
