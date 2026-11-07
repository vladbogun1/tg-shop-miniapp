"use client";

import { ApiError } from "@shop/core/errors";
import { SupportChat } from "./chat/SupportChat";
import { ThreadProductBar } from "./ThreadProductBar";
import type { ThreadController } from "./use-thread-controller";

/**
 * Тело вопроса: плашка товара (+ «Закрыть / Открыть снова») и чат. Один экземпляр чата на `threadId`:
 * на ПК его рисует правая панель, на телефоне — шторка, одновременно оба не монтируются.
 */
export function ThreadView({ threadId, ctl }: { threadId: string; ctl: ThreadController }) {
  const { q, thread, toggle } = ctl;
  const open = thread?.status === "OPEN";
  return (
    <div className="flex h-full min-h-0 flex-col">
      {thread && <ThreadProductBar thread={thread} busy={toggle.isPending} onToggle={() => toggle.mutate(thread)} />}

      {q.isError && !thread ? (
        <div className="p-5 text-[13px] text-[var(--danger-ink)]">
          {q.error instanceof ApiError ? q.error.message : "Не удалось загрузить вопрос"}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 p-3 pb-[calc(12px+var(--safe-bottom))] sm:p-5 sm:pb-[calc(20px+var(--safe-bottom))] lg:pb-4">
          <SupportChat
            key={threadId}
            threadId={threadId}
            closed={thread?.status === "CLOSED"}
            onSendAndClose={open && thread ? () => toggle.mutate(thread) : undefined}
          />
        </div>
      )}
    </div>
  );
}
