"use client";

/**
 * ORDER CHAT (design doc §6) — ChiSetup (v3).
 * A full-screen, Telegram-style chat for a single order.
 *  - GET  /api/me/orders/{id}/messages           (history)
 *  - GET  /api/me/orders/{id}                     (order status for the header)
 *  - POST /api/me/orders/{id}/messages            (send)
 *  - POST /api/me/orders/{id}/messages/read       (mark read)
 *  - POST /api/me/uploads                         (attachment, multipart)
 *  - WS   /topic/orders/{id}/chat                 (realtime append)
 *
 * The layout (frame, header, list, composer, picture viewer) is features/chat; this file holds what
 * is specific to an order: the endpoints, the header and the unread marking.
 */
import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { StatusChip } from "@shop/ui/primitives";
import { customerApi, type Message, type SendMessageRequest } from "@/lib/api";
import { useT } from "@/i18n/context";
import { dayLabel, shortOrderId } from "@/lib/format";
import { hasUnreadFromShop } from "@shop/customer/chat/model";
import { useThread } from "@shop/customer/chat/use-thread";
import { orderKeys } from "@shop/customer/order/keys";
import { connectOrderChat } from "@/lib/ws";
import { ChatComposer, ChatFrame, ChatHeader, ChatLightbox, ChatMessages, useChatToken } from "@/features/chat";

export function OrderChatScreen() {
  const t = useT();
  const router = useRouter();
  const id = useParams<{ id: string }>().id;

  const [connected, setConnected] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const token = useChatToken();

  // Gated on the token, not just the id: opening the chat from a deep link regularly beat the
  // initData exchange, the history request came back 403, and the screen settled on "не удалось
  // загрузить переписку" — the "didn't load the first time" the shop kept seeing.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: orderKeys.messages(id),
    queryFn: () => customerApi.getMessages(id),
    enabled: !!id && !!token,
  });

  // Order detail — only used to surface the status chip in the header.
  const { data: order } = useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: () => customerApi.getOrder(id),
    enabled: !!id && !!token,
  });

  const { messages, appendMessage, hasMore, loadingEarlier, loadEarlier, byId, days } = useThread<Message>({
    history: data,
    fetchOlder: (before) => customerApi.getMessages(id, before),
    scrollRef,
    dayLabel,
  });

  // A query disabled while the token is still on its way is "pending, not fetching", so the
  // screen would flash its empty state before the first request even goes out.
  const loading = isLoading || !token;

  // WebSocket realtime — (re)connects whenever the order or the token changes.
  useEffect(() => {
    if (!id || !token) return;
    const conn = connectOrderChat(id, appendMessage, setConnected);
    return () => conn.disconnect();
  }, [id, token, appendMessage]);

  // Mark admin messages read (on load + when new admin msg arrives).
  useEffect(() => {
    if (!id || messages.length === 0) return;
    if (hasUnreadFromShop(messages)) {
      customerApi.markRead(id).catch(() => {});
    }
  }, [id, messages]);

  async function handleSend(req: SendMessageRequest) {
    const sent = await customerApi.sendMessage(id, { ...req, replyToMessageId: replyTo?.id });
    appendMessage(sent);
    setReplyTo(null);
  }

  return (
    <ChatFrame>
      <ChatHeader onBack={() => router.push(`/account/orders/${id}`)}>
        {/* order avatar tile */}
        <div
          className="font-display grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] text-[13px] font-bold text-[var(--accent)]"
          aria-hidden
        >
          {id.slice(0, 2).toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-display truncate text-[15px] font-bold uppercase tracking-[0.04em] text-[var(--ink)]">
            {t("inbox.orderNumber", { id: shortOrderId(id) })}
          </p>
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--muted)]">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{
                background: connected ? "var(--ok)" : "var(--faint)",
                boxShadow: connected ? "0 0 6px var(--ok)" : "none",
              }}
            />
            {connected ? t("chat.online") : t("chat.connecting")}
          </p>
        </div>

        {order && <StatusChip status={order.status} label={t(`status.${order.status}`)} />}
      </ChatHeader>

      <ChatMessages
        scrollRef={scrollRef}
        loading={loading}
        skeletonCount={4}
        isError={isError}
        onRetry={() => refetch()}
        empty={
          !loading && !isError && messages.length === 0 ? (
            <div className="mt-12 flex flex-col items-center gap-3 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-[var(--r-card)] border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--accent)]">
                <MessageCircle className="h-6 w-6" strokeWidth={2.25} />
              </div>
              <p className="max-w-[15rem] text-[13px] text-[var(--muted)]">{t("chat.empty")}</p>
            </div>
          ) : null
        }
        hasMore={hasMore}
        loadingEarlier={loadingEarlier}
        onLoadEarlier={() => void loadEarlier()}
        days={days}
        renderMessage={(msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            outgoing={msg.senderType === "CUSTOMER"}
            repliedTo={msg.replyToMessageId ? byId.get(msg.replyToMessageId) ?? null : null}
            onImageClick={setLightbox}
          />
        )}
      />

      <ChatComposer
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSend={handleSend}
        sendWhileUploading
        orderId={id}
      />

      <ChatLightbox src={lightbox} onClose={() => setLightbox(null)} />
    </ChatFrame>
  );
}
