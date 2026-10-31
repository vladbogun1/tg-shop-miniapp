"use client";

import { useState } from "react";
import { ApiError } from "@shop/core/errors";
import { toast } from "@shop/ui/toast";
import { customerApi, type UserCardDto } from "@/features/customer";
import { customerLabel } from "../model/labels";
import type { ActivityRow } from "../model/types";

/** Что можно сделать со строкой журнала: открыть заказ, профиль, отфильтровать по покупателю. */
export interface RowActions {
  openOrder: (id: string) => void;
  openCustomer: (r: ActivityRow) => void;
  filterCustomer: (r: ActivityRow) => void;
}

export interface CustomerFilter {
  id: number;
  label: string;
}

/** Профиль без карточки в базе: показываем то, что знает журнал. */
function fallbackCard(r: ActivityRow, tgId: number): UserCardDto {
  return {
    telegramUserId: tgId,
    username: r.customerUsername ?? null,
    firstName: r.customerName ?? null,
    premium: false,
    botBlocked: false,
    ordersCount: 0,
    totalSpentMinor: 0,
  };
}

/**
 * Состояние окон поверх журнала (заказ, профиль) и действия строк. `onFilterCustomer` — выбранный
 * покупатель становится фильтром ленты (экран переключается на ленту сам).
 */
export function useRowActions(onFilterCustomer: (c: CustomerFilter) => void) {
  const [profile, setProfile] = useState<UserCardDto | null>(null);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  async function openCustomer(r: ActivityRow) {
    if (!r.tgUserId) return;
    const tgId = r.tgUserId;
    try {
      const found = await customerApi.findUser(tgId);
      setProfile(found ?? fallbackCard(r, tgId));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Не удалось открыть профиль");
    }
  }

  const actions: RowActions = {
    openOrder: setOpenOrderId,
    openCustomer,
    filterCustomer: (r) => {
      if (!r.tgUserId) return;
      onFilterCustomer({ id: r.tgUserId, label: customerLabel(r) ?? `#${r.tgUserId}` });
    },
  };

  return {
    actions,
    profile,
    closeProfile: () => setProfile(null),
    openOrderId,
    openOrder: setOpenOrderId,
    closeOrder: () => setOpenOrderId(null),
  };
}
