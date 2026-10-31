"use client";

/**
 * SupportChat — the chat of one support thread. Same look and habits as the order chat
 * (components/orders/OrderChat.tsx, whose bubbles it reuses), but its own endpoints:
 *  - latest page on open, «Загрузить ранее» pages back with before=;
 *  - mark read on open and for customer messages arriving while the chat is visible;
 *  - realtime via STOMP /topic/support/{threadId}, sent messages appended right away (dedupe by id);
 *  - attachments: a picture (also pasted from the clipboard) or a PDF;
 *  - draft kept per thread for the session.
 * Answering a closed thread reopens it (server side) — the hint above the composer says so.
 */
import { supportAsChatMessage } from "@shop/core/support";
import { useState } from "react";
import { Bubble } from "@/features/order";
import { ChatDaySection, useChatDays } from "@/components/ui/ChatDays";
import { Button } from "@shop/ui/admin-button";
import { Lightbox } from "@shop/ui/overlay";
import type { SupportMessage } from "../../model/types";
import { Composer } from "./Composer";
import { useSupportChat } from "./use-support-chat";

const messageTime = (m: SupportMessage) => m.createdAt;

export function SupportChat({ threadId, closed }: { threadId: string; closed?: boolean }) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const chat = useSupportChat(threadId);
  const days = useChatDays(chat.messages, messageTime);

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div ref={chat.scrollRef} className="thin-scroll flex flex-1 flex-col gap-2 overflow-y-auto p-1">
        {chat.showLoadOlder && (
          <div className="flex justify-center">
            <Button size="sm" variant="ghost" loading={chat.loadingOlder} onClick={chat.loadOlder}>
              Загрузить ранее
            </Button>
          </div>
        )}
        {!chat.isLoading && chat.messages.length === 0 && (
          <div className="font-display my-auto text-center text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">
            Сообщений пока нет
          </div>
        )}
        {days.map((day) => (
          <ChatDaySection key={day.key} label={day.label}>
            {day.items.map((m) => (
              <Bubble key={m.id} m={supportAsChatMessage(m)} onOpenImage={setLightbox} />
            ))}
          </ChatDaySection>
        ))}
      </div>

      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />

      {closed && (
        <p className="mt-2 text-center text-[12px] text-[var(--text-faint)]">Вопрос закрыт. Ответ откроет его снова.</p>
      )}

      <Composer threadId={threadId} />
    </div>
  );
}
