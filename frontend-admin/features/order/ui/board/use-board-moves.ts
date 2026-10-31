"use client";

import type { DragEndEvent } from "@dnd-kit/core";
import { toast } from "@shop/ui/toast";
import { useState } from "react";
import type { OrderStatus } from "@/lib/api";
import type { AdminBoard, AdminOrderCard } from "../../api";
import { findCard, moveVerdict, sendBackPlan } from "../../model/board";
import { RETURNING, type BoardKey } from "../../model/status";
import { boardKey, useBoardStatusChange } from "../../queries/board";
import type { StatusChangePayload } from "../modals/StatusChangeModal";

export type OpenAction = "return" | "received";

interface Args {
  board: AdminBoard | undefined;
  /** Ключ кэша доски, которую двигаем. */
  queryKey: ReturnType<typeof boardKey>;
  onOpen: (id: string, action?: OpenAction) => void;
}

/**
 * Перенос карточек: что тащим, какое окно подтверждения ждёт («Отправлен» — ТТН, «Отклонён» — причина,
 * «Доставлен» — подтверждение) и сама смена статуса с откатом при отказе.
 */
export function useBoardMoves({ board, queryKey, onOpen }: Args) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ order: AdminOrderCard; to: OrderStatus } | null>(null);
  /** The pending reject comes from a drop on «Едет назад»: «Посылка едет назад» is pre-ticked. */
  const [pendingInTransit, setPendingInTransit] = useState(false);
  const change = useBoardStatusChange();

  const activeOrder = findCard(board, activeId);

  async function commitStatus(payload: StatusChangePayload, id: string): Promise<boolean> {
    try {
      const done = await change.mutateAsync({ id, payload, boardKey: queryKey });
      if (done === null) return false; // declined — the card is already back
      setPending(null);
      setPendingInTransit(false);
      return true;
    } catch {
      return false; // toast + rollback happened in the mutation
    }
  }

  function requestMove(id: string, from: OrderStatus, to: OrderStatus) {
    const verdict = moveVerdict(from, to);
    if (verdict.kind === "refuse") {
      toast.error(verdict.text);
      return;
    }
    if (verdict.kind === "commit") {
      void commitStatus({ status: to }, id);
      return;
    }
    const card = findCard(board, id);
    if (card) setPending({ order: card, to });
    else toast.error("Заказ не найден на доске — обновите");
  }

  /** A card dropped on «Едет назад»: not taken at the post office, or a return of a delivered one. */
  function sendBack(id: string, from: OrderStatus) {
    const card = findCard(board, id);
    const plan = sendBackPlan(from, !!card);
    if (plan === "reject-in-transit" && card) {
      setPendingInTransit(true);
      setPending({ order: card, to: "REJECTED" });
    } else if (plan === "return") {
      onOpen(id, "return");
    } else {
      toast.error("Назад едет только отправленный или доставленный заказ");
    }
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const from = (active.data.current?.status as OrderStatus) ?? null;
    const to = over.id as BoardKey;
    if (!from || from === to) return;
    if (to === RETURNING) sendBack(String(active.id), from);
    else requestMove(String(active.id), from, to);
  }

  function closeModal() {
    setPending(null);
    setPendingInTransit(false);
  }

  return {
    activeId,
    activeOrder,
    pending,
    pendingInTransit,
    changing: change.isPending,
    onDragStart: (id: string) => setActiveId(id),
    onDragCancel: () => setActiveId(null),
    onDragEnd,
    requestMove,
    commitStatus,
    closeModal,
  };
}
