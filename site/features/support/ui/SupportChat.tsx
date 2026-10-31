"use client";

/**
 * The support thread chat. Same patterns as the order chat (components/chat/OrderChat.tsx): paged
 * history, STOMP realtime with the access cookie, text + one image, the same MessageBubble.
 * Differences: support endpoints, a client-side length counter, the server's localized refusal
 * shown inline, and a closed state — writing into a CLOSED thread reopens it.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Lock, WifiOff, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useThread } from "@shop/customer/chat/use-thread";
import { type Message, type SendMessageRequest } from "@shop/core/types";
import { noFadeFlash } from "@shop/ui/motion";
import { MessageBubble } from "@/features/chat/view/MessageBubble";
import { Button } from "@shop/ui/primitives";
import { useI18n } from "@/i18n/context";
import { useEscape } from "@/lib/hooks";
import { Image } from "@/lib/image";
import { connectSupportChat, SUPPORT_DEFAULTS, SUPPORT_KEYS, supportApi, toChatMessage, useSupportConfig } from "../queries";
import { useFmt } from "@/lib/use-fmt";
import { refreshSession } from "@/lib/api";
import { Composer } from "./SupportComposer";

export function SupportChat({
  threadId,
  closed,
  onThreadChanged,
}: {
  threadId: string;
  closed: boolean;
  /** Something that may change the thread's status/preview happened (sent, system message). */
  onThreadChanged: () => void;
}) {
  const { t } = useI18n();
  const fmt = useFmt();
  const qc = useQueryClient();
  const { config } = useSupportConfig();
  const maxLength = config?.maxLength ?? SUPPORT_DEFAULTS.maxLength;
  const [connected, setConnected] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Highest shop message id already reported as read. */
  const readUpTo = useRef(0);
  const closeLightbox = useCallback(() => setLightbox(null), []);
  useEscape(!!lightbox, closeLightbox);

  const changed = useRef(onThreadChanged);
  useEffect(() => {
    changed.current = onThreadChanged;
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: SUPPORT_KEYS.messages(threadId),
    queryFn: async () => (await supportApi.messages(threadId)).map(toChatMessage),
  });

  const dayLabel = useCallback((iso: string) => fmt.dayLabel(iso), [fmt]);
  const { messages, appendMessage, hasMore, loadingEarlier, loadEarlier, byId, days } = useThread<Message>({
    history: data,
    fetchOlder: async (before) => (await supportApi.messages(threadId, before)).map(toChatMessage),
    scrollRef,
    dayLabel,
    // An admin answer or a system line (closed/reopened) can change the thread card.
    onAppend: (m) => {
      if (m.senderType !== "CUSTOMER") changed.current();
    },
    swallowLoadErrors: true,
  });

  // Realtime once the history is in (that request also refreshed an expired access cookie).
  const historyReady = !!data;
  useEffect(() => {
    if (!historyReady) return;
    let wasUp = false;
    const conn = connectSupportChat(threadId, appendMessage, (up) => {
      setConnected(up);
      if (up) wasUp = true;
      else if (wasUp) {
        wasUp = false;
        void refreshSession();
      }
    });
    return () => conn.disconnect();
  }, [threadId, historyReady, appendMessage]);

  // Mark read on open and whenever a new shop message arrives.
  useEffect(() => {
    if (!historyReady) return;
    const lastShop = messages.reduce((max, m) => (m.senderType !== "CUSTOMER" && m.id > max ? m.id : max), 0);
    const unread = messages.some((m) => m.senderType === "ADMIN" && !m.readAt && m.id > readUpTo.current);
    if (readUpTo.current === 0 || unread) {
      readUpTo.current = Math.max(lastShop, 1);
      supportApi
        .markRead(threadId)
        .then(() => {
          void qc.invalidateQueries({ queryKey: SUPPORT_KEYS.unread });
          void qc.invalidateQueries({ queryKey: SUPPORT_KEYS.threads });
        })
        .catch(() => {});
    }
  }, [threadId, messages, historyReady, qc]);

  async function handleSend(req: SendMessageRequest) {
    const sent = await supportApi.send(threadId, req);
    appendMessage(toChatMessage(sent));
    changed.current();
    void qc.invalidateQueries({ queryKey: SUPPORT_KEYS.threads });
  }

  return (
    <section className="nb flex flex-col overflow-hidden" aria-labelledby="support-chat-title">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-3">
        <h2 id="support-chat-title" className="font-display text-[16px] font-bold uppercase tracking-[.06em] text-[var(--ink)]">
          {t("support.chat.title")}
        </h2>
        <p className="flex items-center gap-1.5 font-display text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]" aria-live="polite">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: connected ? "var(--ok)" : "var(--faint)" }} />
          {connected ? t("chat.online") : t("chat.connecting")}
        </p>
      </header>

      <div
        ref={scrollRef}
        className="h-[min(520px,60vh)] overflow-y-auto overscroll-contain bg-[#121214] px-3 py-3"
        role="log"
        aria-live="polite"
      >
        {isLoading && (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`shimmer h-12 ${i % 2 ? "ml-auto w-1/2" : "w-2/3"}`} />
            ))}
          </div>
        )}
        {isError && (
          <div className="mt-6 flex flex-col items-center gap-3 text-center">
            <WifiOff className="h-7 w-7 text-[var(--muted)]" strokeWidth={2.5} />
            <p className="text-[13px] font-semibold text-[var(--muted)]">{t("chat.error")}</p>
            <Button size="sm" variant="accent" onClick={() => void refetch()}>
              {t("common.retry")}
            </Button>
          </div>
        )}
        {!isLoading && !isError && messages.length === 0 && (
          <p className="mx-auto mt-10 max-w-xs text-center text-[13px] font-semibold text-[var(--muted)]">{t("support.chat.empty")}</p>
        )}
        <div className="flex flex-col gap-1.5">
          {hasMore && (
            <div className="mb-3 flex justify-center">
              <button
                type="button"
                onClick={() => void loadEarlier()}
                disabled={loadingEarlier}
                className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 font-display text-[12px] font-semibold uppercase tracking-[.08em] text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-60"
              >
                {loadingEarlier ? t("common.loading") : t("chat.loadEarlier")}
              </button>
            </div>
          )}
          {days.map((day) => (
            <section key={`d-${day.key}`} className="flex flex-col gap-1.5" aria-label={day.label}>
              <div className="pointer-events-none sticky top-0 z-[2] my-2 flex justify-center">
                <span className="rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1 font-display text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--muted)] shadow-[0_2px_8px_rgba(0,0,0,.35)]">
                  {day.label}
                </span>
              </div>
              {day.msgs.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  outgoing={msg.senderType === "CUSTOMER"}
                  repliedTo={msg.replyToMessageId ? byId.get(msg.replyToMessageId) ?? null : null}
                  onImageClick={setLightbox}
                />
              ))}
            </section>
          ))}
        </div>
      </div>

      {closed && (
        <p className="flex items-start gap-2 border-t border-[var(--line)] bg-[var(--surface-2)] px-4 py-2.5 text-[13px] font-medium text-[var(--muted)]">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
          {t("support.closed.note")}
        </p>
      )}

      <Composer onSend={handleSend} maxLength={maxLength} />

      <AnimatePresence>
        {lightbox && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t("chat.attachmentAlt")}
            {...noFadeFlash}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeLightbox}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(8,8,10,.94)] p-4 backdrop-blur-[6px]"
          >
            <button
              type="button"
              autoFocus
              aria-label={t("common.close")}
              onClick={closeLightbox}
              className="absolute right-4 top-4 grid h-12 w-12 place-items-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]"
            >
              <X className="h-6 w-6" strokeWidth={2.5} />
            </button>
            <div onClick={(e) => e.stopPropagation()} className="max-w-[min(92vw,1100px)]">
              <Image src={lightbox} alt={t("chat.attachmentAlt")} size={1600} fit className="max-h-[86dvh] max-w-full rounded-[var(--r-card)] border border-[var(--line)]" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
