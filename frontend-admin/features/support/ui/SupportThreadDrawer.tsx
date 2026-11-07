"use client";

/**
 * Вопрос в правой шторке (на телефоне/планшете — во весь экран): шапка, плашка товара и чат.
 * «Назад» в браузере/на телефоне закрывает шторку, а не уходит со страницы. На ПК вместо неё —
 * правая панель мастер-детали (ThreadPane).
 */
import { Drawer, useBackToClose } from "@shop/ui/overlay";
import { UserProfileDrawer } from "@/features/customer";
import type { SupportThread } from "../model/types";
import { ThreadHeader } from "./ThreadHeader";
import { ThreadView } from "./ThreadView";
import { useNowMs } from "./use-now";
import { useThreadController } from "./use-thread-controller";

export function SupportThreadDrawer({
  threadId,
  initial,
  onClose,
}: {
  threadId: string | null;
  /** Строка из списка — показываем, пока грузится сам вопрос. */
  initial?: SupportThread;
  onClose: () => void;
}) {
  const close = useBackToClose(!!threadId, onClose, { marker: "supportDrawer" });
  const ctl = useThreadController(threadId, initial);
  const nowMs = useNowMs();

  return (
    <>
      <Drawer
        open={!!threadId}
        onClose={close}
        header={<ThreadHeader thread={ctl.thread} nowMs={nowMs} onOpenCustomer={ctl.openCustomer} />}
        width="max-w-[640px]"
        zClass="z-[120]"
      >
        {threadId && <ThreadView threadId={threadId} ctl={ctl} />}
      </Drawer>

      {/* Профиль клиента открывается ПОВЕРХ вопроса (рисуется позже — значит сверху). */}
      <UserProfileDrawer user={ctl.profile} onClose={ctl.closeProfile} />
    </>
  );
}
