"use client";

/**
 * Состояние «Новой Почты» на «Отправке»: галочки (только среди показанных), формат этикеток, отделение
 * отправки (по умолчанию — у отправителя), результат последнего пакета и заказ, для которого открыто окно ТТН.
 */
import { useMemo, useState } from "react";
import { useBatchShipments, useSenderQuery, type BatchResult, type LabelFormat, type ShipmentMode } from "@/features/delivery";
import type { AdminDispatchOrder } from "@/features/order";
import { batchScope, pickBranch } from "../model/batch";
import { useRefreshAfterShipments } from "../queries";

export function useNpBatch(visible: AdminDispatchOrder[]) {
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set());
  const [format, setFormat] = useState<LabelFormat>("100x100");
  const [chosenBranch, setBranch] = useState<string | null>(null);
  const [results, setResults] = useState<BatchResult[] | null>(null);
  const [ttnFor, setTtnFor] = useState<{ id: string; mode: ShipmentMode } | null>(null);
  const refresh = useRefreshAfterShipments();

  const scope = useMemo(() => batchScope(visible, ticked), [visible, ticked]);
  const sender = useSenderQuery(scope.np.length > 0).data?.sender;
  const branches = sender?.warehouses ?? [];
  const branch = pickBranch(chosenBranch, branches, sender?.defaultWarehouseRef);
  const batch = useBatchShipments((rows) => {
    setResults(rows);
    refresh();
  });

  const toggle = (id: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allTicked = scope.selected.length > 0 && scope.selected.length === scope.np.length;

  return {
    scope,
    ticked,
    toggle,
    toggleAll: () => setTicked(allTicked ? new Set() : new Set(scope.np.map((o) => o.id))),
    format,
    setFormat,
    branches,
    branch,
    setBranch,
    creating: batch.isPending,
    createAll: () => batch.mutate({ orderIds: scope.toCreate.map((o) => o.id), senderRef: branch }),
    results,
    clearResults: () => setResults(null),
    ttnFor,
    openTtn: (id: string, mode: ShipmentMode) => setTtnFor({ id, mode }),
    closeTtn: () => setTtnFor(null),
    ttnDone: () => {
      setTtnFor(null);
      refresh();
    },
  };
}

export type NpBatch = ReturnType<typeof useNpBatch>;
