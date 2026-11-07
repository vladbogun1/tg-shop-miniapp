"use client";

import { ApiError } from "@shop/core/errors";
import { toast } from "@shop/ui/toast";
import { useState } from "react";
import { customerApi, stubUserCard, type UserCardDto } from "@/features/customer";
import type { SupportThread } from "../model/types";
import { useSupportThread, useToggleThreadStatus } from "../queries";

/**
 * Один вопрос: сам вопрос (со строкой списка, пока грузится), «Закрыть / Открыть снова»
 * и профиль клиента поверх. Общий для правой панели на ПК и шторки на телефоне.
 */
export function useThreadController(threadId: string | null, initial: SupportThread | undefined) {
  const [profile, setProfile] = useState<UserCardDto | null>(null);
  const q = useSupportThread(threadId, initial);
  const toggle = useToggleThreadStatus();
  const thread = q.data;

  async function openCustomer() {
    if (!thread?.userId) return;
    const tgId = thread.userId;
    try {
      const found = await customerApi.findUser(tgId);
      // Клиента ещё нет в базе — профиль-заглушка с тем, что знает вопрос.
      setProfile(found ?? stubUserCard({ telegramUserId: tgId, username: null, firstName: thread.customerName ?? null }));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Не удалось открыть профиль");
    }
  }

  return { q, thread, toggle, profile, closeProfile: () => setProfile(null), openCustomer };
}

export type ThreadController = ReturnType<typeof useThreadController>;
