"use client";

/**
 * SUPPORT THREAD — a full-screen chat with the shop about a product or a general question (V43).
 * Same look and behaviour as the order chat (features/chat), different endpoints:
 *  - GET  /api/me/support/threads/{id}             (header: product / status)
 *  - GET  /api/me/support/threads/{id}/messages    (history)
 *  - POST /api/me/support/threads/{id}/messages    (send; reopens a closed thread)
 *  - POST /api/me/support/threads/{id}/read        (mark the shop's answers read)
 *  - POST /api/me/support/threads/{id}/close
 *  - WS   /topic/support/{id}
 *
 * `id = "new"` is a draft: nothing exists until the first message, which POSTs
 * /api/me/support/threads (with `?product=<id>` when asked from a product) and swaps the URL to the
 * real thread. The TabBar hides itself on any /chat route. State: use-support-thread.
 */
import { LifeBuoy } from "lucide-react";
import { useRouter } from "next/navigation";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { useT } from "@/i18n/context";
import { ApiError } from "@/lib/api";
import { supportAsChatMessage } from "@shop/core/support";
import { ChatComposer, ChatFrame, ChatHeader, ChatLightbox, ChatMessages } from "@/features/chat";
import { threadHeader } from "../model/header";
import { SupportHeader } from "./SupportHeader";
import { useSupportThread } from "./use-support-thread";

/** Server message for the support limit codes (already in the customer's language), else a fallback. */
export function supportErrorText(e: unknown, fallback: string): string {
  if (e instanceof ApiError && e.code?.startsWith("SUPPORT_") && e.message) return e.message;
  if (e instanceof ApiError && e.status === 400 && e.message) return e.message;
  return fallback;
}

export function SupportChatScreen() {
  const t = useT();
  const router = useRouter();
  const s = useSupportThread();
  const { thread, draftProduct, isDraft, config, messages } = s;

  const fallbackTitle = isDraft ? t("support.newTitle") : t("support.general");
  const { productTitle, productImage, title, closed, canClose } = threadHeader(thread, draftProduct, isDraft, fallbackTitle);
  const disabled = config ? !config.enabled : false;
  const loading = !isDraft && (s.isLoading || !s.token);

  return (
    <ChatFrame>
      <ChatHeader onBack={() => router.push("/account/support")}>
        <SupportHeader
          title={title}
          productTitle={productTitle}
          productImage={productImage}
          isDraft={isDraft}
          connected={s.connected}
          closed={closed}
          awaiting={!!thread?.awaitingSince}
          canClose={canClose}
          onClose={() => void s.closeThread()}
        />
      </ChatHeader>

      <ChatMessages
        scrollRef={s.scrollRef}
        loading={loading}
        skeletonCount={3}
        isError={s.isError}
        onRetry={() => s.refetch()}
        empty={
          isDraft || (!loading && !s.isError && messages.length === 0) ? (
            <div className="mt-10 flex flex-col items-center gap-3 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-[var(--r-card)] border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--accent)]">
                <LifeBuoy className="h-6 w-6" strokeWidth={2.25} />
              </div>
              <p className="max-w-[16rem] text-[13px] text-[var(--muted)]">
                {disabled ? t("support.disabled") : t("support.newHint")}
              </p>
            </div>
          ) : null
        }
        hasMore={s.hasMore}
        loadingEarlier={s.loadingEarlier}
        onLoadEarlier={() => void s.loadEarlier()}
        days={s.days}
        renderMessage={(msg) => (
          <MessageBubble
            key={msg.id}
            msg={supportAsChatMessage(msg)}
            outgoing={msg.senderType === "CUSTOMER"}
            repliedTo={(() => {
              const r = msg.replyToMessageId ? s.byId.get(msg.replyToMessageId) : null;
              return r ? supportAsChatMessage(r) : null;
            })()}
            onImageClick={s.setLightbox}
          />
        )}
      />

      {closed && (
        <p className="border-t border-[var(--line)] bg-[var(--surface)] px-4 pt-2 text-center text-[12px] text-[var(--muted)]">
          {t("support.closed")}
        </p>
      )}

      {disabled ? (
        <div
          className="border-t border-[var(--line)] bg-[var(--surface)] px-4 pt-3 text-center text-[13px] text-[var(--muted)]"
          style={{ paddingBottom: "calc(12px + var(--safe-bottom))" }}
        >
          {t("support.disabled")}
        </div>
      ) : (
        <ChatComposer
          replyTo={s.replyTo}
          onCancelReply={() => s.setReplyTo(null)}
          onSend={s.handleSend}
          maxLength={config?.maxLength ?? 2000}
          mapError={supportErrorText}
        />
      )}

      <ChatLightbox src={s.lightbox} onClose={() => s.setLightbox(null)} />
    </ChatFrame>
  );
}
