"use client";

import { MessageSquareText } from "lucide-react";
import { UserProfileDrawer } from "@/features/customer";
import type { SupportThread } from "../model/types";
import { ThreadHeader } from "./ThreadHeader";
import { ThreadView } from "./ThreadView";
import { useNowMs } from "./use-now";
import { useThreadController } from "./use-thread-controller";

/** Правая панель мастер-детали на ПК: вопрос рядом со списком, без затемнения. */
export function ThreadPane({ threadId, initial }: { threadId: string | null; initial?: SupportThread }) {
  const ctl = useThreadController(threadId, initial);
  const nowMs = useNowMs();

  if (!threadId) {
    // Первый вопрос сам не открываем: открытие помечает сообщения прочитанными, а оператор их не видел.
    return (
      <div className="panel grid h-full min-h-0 place-items-center p-8 text-center">
        <div className="flex flex-col items-center gap-2 text-[var(--text-faint)]">
          <MessageSquareText className="h-8 w-8" />
          <div className="font-display text-[14px] font-semibold uppercase tracking-[0.06em]">Выберите вопрос</div>
          <div className="text-[12px]">Alt+↓ / Alt+↑ — следующий и предыдущий</div>
        </div>
      </div>
    );
  }
  return (
    <section className="panel flex h-full min-h-0 flex-col" aria-label="Вопрос покупателя" data-testid="support-detail">
      <div className="shrink-0 border-b border-[var(--line)] px-4 py-3 sm:px-5">
        <ThreadHeader thread={ctl.thread} nowMs={nowMs} onOpenCustomer={ctl.openCustomer} />
      </div>
      <div className="min-h-0 flex-1">
        <ThreadView threadId={threadId} ctl={ctl} />
      </div>
      <UserProfileDrawer user={ctl.profile} onClose={ctl.closeProfile} />
    </section>
  );
}
