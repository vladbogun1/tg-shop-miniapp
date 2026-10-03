"use client";

/**
 * Order chat embedded in the order page — the Mini App's chat (frontend/app/account/orders/[id]/
 * chat/page.tsx) as a panel: paged history, realtime via STOMP over /ws, mark-read, text + image
 * (picker or paste). Same endpoints; the WebSocket authenticates with the `access` cookie.
 */
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ImagePlus, Send, WifiOff, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Message, SendMessageRequest } from "@shop/shared";
import { Button } from "@/components/ui/Button";
import { useT } from "@/i18n/context";
import { api, refreshSession } from "@/lib/api";
import { useEscape } from "@/lib/hooks";
import { Image } from "@/lib/image";
import { useFmt } from "@/lib/use-fmt";
import { connectOrderChat } from "@/lib/ws";
import { MessageBubble } from "./MessageBubble";

/** Must match MessageService.DEFAULT_PAGE on the backend. */
const PAGE_SIZE = 50;

export function OrderChat({ orderId }: { orderId: string }) {
  const t = useT();
  const fmt = useFmt();
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef<Set<number>>(new Set());
  const closeLightbox = useCallback(() => setLightbox(null), []);
  useEscape(!!lightbox, closeLightbox);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["me", "orders", orderId, "messages"],
    queryFn: () => api.messages(orderId),
  });

  useEffect(() => {
    if (!data) return;
    seenIds.current = new Set(data.map((m) => m.id));
    setMessages(data);
    setHasMore(data.length >= PAGE_SIZE);
  }, [data]);

  const appendMessage = useCallback((m: Message) => {
    if (seenIds.current.has(m.id)) return;
    seenIds.current.add(m.id);
    setMessages((prev) => [...prev, m]);
  }, []);

  // Realtime. Starts after the history loaded (that request also refreshed the session cookie if
  // it had expired, so the handshake carries a valid one). A dropped socket refreshes the session
  // before STOMP's own reconnect, because the 15-minute access cookie may be what it died of.
  const historyReady = !!data;
  useEffect(() => {
    if (!historyReady) return;
    let wasUp = false;
    const conn = connectOrderChat(orderId, appendMessage, (up) => {
      setConnected(up);
      if (up) wasUp = true;
      else if (wasUp) {
        wasUp = false;
        void refreshSession();
      }
    });
    return () => conn.disconnect();
  }, [orderId, historyReady, appendMessage]);

  useEffect(() => {
    if (messages.some((m) => m.senderType === "ADMIN" && !m.readAt)) {
      api.markRead(orderId).catch(() => {});
    }
  }, [orderId, messages]);

  useEffect(() => {
    if (loadingEarlier) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on new messages
  }, [messages.length]);

  async function loadEarlier() {
    const oldest = messages[0];
    if (!oldest || loadingEarlier) return;
    setLoadingEarlier(true);
    try {
      const older = await api.messages(orderId, oldest.id);
      if (older.length === 0) {
        setHasMore(false);
        return;
      }
      const fresh = older.filter((m) => !seenIds.current.has(m.id));
      fresh.forEach((m) => seenIds.current.add(m.id));
      const el = scrollRef.current;
      const before = el?.scrollHeight ?? 0;
      setMessages((prev) => [...fresh, ...prev]);
      requestAnimationFrame(() => {
        if (el) el.scrollTop += el.scrollHeight - before;
      });
      setHasMore(older.length >= PAGE_SIZE);
    } finally {
      setLoadingEarlier(false);
    }
  }

  const byId = useMemo(() => {
    const map = new Map<number, Message>();
    messages.forEach((m) => map.set(m.id, m));
    return map;
  }, [messages]);

  const items = useMemo(() => {
    const out: ({ kind: "day"; label: string; key: string } | { kind: "msg"; msg: Message })[] = [];
    let lastDay = "";
    for (const m of messages) {
      const at = new Date(m.createdAt);
      const key = Number.isNaN(at.getTime()) ? m.createdAt : `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`;
      if (key !== lastDay) {
        out.push({ kind: "day", label: fmt.dayLabel(m.createdAt), key });
        lastDay = key;
      }
      out.push({ kind: "msg", msg: m });
    }
    return out;
  }, [messages, fmt]);

  async function handleSend(req: SendMessageRequest) {
    const sent = await api.sendMessage(orderId, req);
    appendMessage(sent);
  }

  return (
    <section id="chat" className="nb flex flex-col overflow-hidden" aria-labelledby="chat-title">
      <header className="flex items-center justify-between gap-3 border-b-[3px] border-[var(--line)] bg-[var(--surface)] px-4 py-3">
        <h2 id="chat-title" className="text-[16px] font-black uppercase tracking-wide text-[var(--ink)]">
          {t("order.chat")}
        </h2>
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]" aria-live="polite">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full border-[1.5px] border-[var(--line)]"
            style={{ background: connected ? "var(--ok)" : "var(--faint)" }}
          />
          {connected ? t("chat.online") : t("chat.connecting")}
        </p>
      </header>

      <div
        ref={scrollRef}
        className="h-[min(520px,60vh)] overflow-y-auto overscroll-contain bg-[var(--bg)] px-3 py-3"
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
          <p className="mx-auto mt-10 max-w-xs text-center text-[13px] font-semibold text-[var(--muted)]">{t("chat.empty")}</p>
        )}
        <div className="flex flex-col gap-1.5">
          {hasMore && (
            <div className="mb-3 flex justify-center">
              <button
                type="button"
                onClick={() => void loadEarlier()}
                disabled={loadingEarlier}
                className="rounded-[var(--r)] border-[2.5px] border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[12px] font-black uppercase tracking-wide text-[var(--muted)] shadow-[3px_3px_0_var(--shadow)] hover:text-[var(--ink)] disabled:opacity-60"
              >
                {loadingEarlier ? t("common.loading") : t("chat.loadEarlier")}
              </button>
            </div>
          )}
          {items.map((it) =>
            it.kind === "day" ? (
              <div key={`d-${it.key}`} className="my-2 flex justify-center">
                <span className="rounded-[var(--r)] border-[2.5px] border-[var(--line)] bg-[var(--surface-2)] px-3 py-1 text-[11px] font-black uppercase tracking-wide text-[var(--muted)]">
                  {it.label}
                </span>
              </div>
            ) : (
              <MessageBubble
                key={it.msg.id}
                msg={it.msg}
                outgoing={it.msg.senderType === "CUSTOMER"}
                repliedTo={it.msg.replyToMessageId ? byId.get(it.msg.replyToMessageId) ?? null : null}
                onImageClick={setLightbox}
              />
            )
          )}
        </div>
      </div>

      <Composer onSend={handleSend} />

      <AnimatePresence>
        {lightbox && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t("chat.attachmentAlt")}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeLightbox}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4"
          >
            <button
              type="button"
              autoFocus
              aria-label={t("common.close")}
              onClick={closeLightbox}
              className="absolute right-4 top-4 grid h-12 w-12 place-items-center rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]"
            >
              <X className="h-6 w-6" strokeWidth={3} />
            </button>
            <div onClick={(e) => e.stopPropagation()} className="max-w-[min(92vw,1100px)]">
              <Image src={lightbox} alt={t("chat.attachmentAlt")} size={1600} fit className="max-h-[86dvh] max-w-full border-[3px] border-[var(--line)]" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function Composer({ onSend }: { onSend: (req: SendMessageRequest) => Promise<void> }) {
  const t = useT();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [text]);

  async function sendText() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend({ type: "TEXT", text: body });
      setText("");
    } catch {
      setError(t("chat.sendFailed"));
    } finally {
      setSending(false);
    }
  }

  const uploadAndSend = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setError(t("chat.imagesOnly"));
        return;
      }
      setUploading(true);
      setError(null);
      try {
        const { url } = await api.uploadAttachment(file);
        await onSend({ type: "PHOTO", attachmentUrl: url, fileName: file.name, mimeType: file.type, text: text.trim() || undefined });
        setText("");
      } catch {
        setError(t("chat.uploadFailed"));
      } finally {
        setUploading(false);
      }
    },
    [onSend, text, t]
  );

  return (
    <div className="border-t-[3px] border-[var(--line)] bg-[var(--surface)] px-3 py-3">
      {error && <p className="mb-1.5 px-1 text-[12px] font-bold text-[var(--danger)]">{error}</p>}
      <div className="flex items-end gap-2">
        <button
          type="button"
          aria-label={t("chat.attach")}
          title={t("chat.attach")}
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r)] border-[2.5px] border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] shadow-[3px_3px_0_var(--shadow)] hover:bg-[var(--surface-2)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:opacity-40"
        >
          <ImagePlus className={`h-5 w-5 ${uploading ? "animate-pulse" : ""}`} strokeWidth={2.5} />
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void uploadAndSend(f);
          }}
        />
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const item = Array.from(e.clipboardData.items).find((it) => it.type.startsWith("image/"));
            const file = item?.getAsFile();
            if (!file) return;
            e.preventDefault();
            void uploadAndSend(file);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendText();
            }
          }}
          rows={1}
          aria-label={t("chat.placeholder")}
          placeholder={t("chat.placeholder")}
          className="max-h-[140px] min-h-[44px] flex-1 resize-none rounded-[var(--r)] border-[2.5px] border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-2.5 text-[15px] font-medium text-[var(--ink)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--accent)]"
        />
        <button
          type="button"
          aria-label={t("chat.send")}
          title={t("chat.send")}
          disabled={!text.trim() || sending}
          onClick={() => void sendText()}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r)] border-[2.5px] border-[var(--line)] bg-[var(--accent)] text-[var(--accent-ink)] shadow-[3px_3px_0_var(--shadow)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:opacity-40 disabled:shadow-none"
        >
          <Send className="h-5 w-5" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
