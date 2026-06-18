"use client";

/**
 * ORDER CHAT (design doc §6): Telegram-style chat for an order.
 *  - GET  /api/me/orders/{id}/messages          (history)
 *  - POST /api/me/orders/{id}/messages          (send)
 *  - POST /api/me/orders/{id}/messages/read      (mark read)
 *  - POST /api/me/uploads                        (attachment, multipart)
 *  - WS   /topic/orders/{id}/chat                (realtime append)
 *
 * Bubbles (incoming left / outgoing accent right), reply quotes, day separators,
 * read ticks, photo/file attachments, image lightbox, autoscroll.
 */
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Paperclip, Send, WifiOff, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageBubble } from "@/components/chat/MessageBubble";
import {
  customerApi,
  getAccessToken,
  type Message,
  type SendMessageRequest,
} from "@/lib/api";
import { dayLabel, shortOrderId } from "@/lib/format";
import { Image } from "@/lib/image";
import { connectOrderChat } from "@/lib/ws";

export default function OrderChatPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef<Set<string>>(new Set());

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["me", "orders", id, "messages"],
    queryFn: () => customerApi.getMessages(id),
    enabled: !!id,
  });

  // Seed state from REST history.
  useEffect(() => {
    if (!data) return;
    seenIds.current = new Set(data.map((m) => m.id));
    setMessages(data);
  }, [data]);

  const appendMessage = useCallback((m: Message) => {
    if (seenIds.current.has(m.id)) return;
    seenIds.current.add(m.id);
    setMessages((prev) => [...prev, m]);
  }, []);

  // WebSocket realtime.
  useEffect(() => {
    if (!id) return;
    const conn = connectOrderChat(id, getAccessToken(), appendMessage, setConnected);
    return () => conn.disconnect();
  }, [id, appendMessage]);

  // Mark admin messages read (on load + when new admin msg arrives).
  useEffect(() => {
    if (!id || messages.length === 0) return;
    const hasUnreadAdmin = messages.some(
      (m) => m.senderType === "ADMIN" && !m.readAt
    );
    if (hasUnreadAdmin) {
      customerApi.markRead(id).catch(() => {});
    }
  }, [id, messages]);

  // Autoscroll to bottom on new messages.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const byId = useMemo(() => {
    const map = new Map<string, Message>();
    messages.forEach((m) => map.set(m.id, m));
    return map;
  }, [messages]);

  // Group with day separators.
  const items = useMemo(() => {
    const out: ({ kind: "day"; label: string } | { kind: "msg"; msg: Message })[] =
      [];
    let lastDay = "";
    for (const m of messages) {
      const d = dayLabel(m.createdAt);
      if (d !== lastDay) {
        out.push({ kind: "day", label: d });
        lastDay = d;
      }
      out.push({ kind: "msg", msg: m });
    }
    return out;
  }, [messages]);

  async function handleSend(req: SendMessageRequest) {
    const sent = await customerApi.sendMessage(id, {
      ...req,
      replyToMessageId: replyTo?.id,
    });
    appendMessage(sent);
    setReplyTo(null);
  }

  return (
    <div
      className="fixed inset-0 z-30 mx-auto flex max-w-[480px] flex-col"
      style={{ paddingTop: "var(--safe-top)" }}
    >
      {/* header */}
      <header className="glass glass--floating z-10 flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          aria-label="Назад"
          onClick={() => router.push(`/account/orders/${id}`)}
          className="tap flex items-center justify-center rounded-full text-[var(--text-muted)]"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-[var(--text)]">
            Чат заказа {shortOrderId(id)}
          </p>
          <p className="text-[11px] text-[var(--text-muted)]">
            {connected ? "В сети" : "Подключение…"}
          </p>
        </div>
      </header>

      {/* messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain px-3 py-3"
      >
        {isLoading && (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`shimmer h-12 w-1/2 rounded-[var(--r-md)] ${
                  i % 2 ? "self-end" : ""
                }`}
              />
            ))}
          </div>
        )}

        {isError && (
          <div className="glass mt-8 flex flex-col items-center gap-3 rounded-[var(--r-md)] p-6 text-center">
            <WifiOff className="h-7 w-7 text-[var(--text-muted)]" />
            <p className="text-[13px] text-[var(--text-muted)]">
              Не удалось загрузить переписку.
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="glossy tap rounded-[var(--r-pill)] px-4 py-2 text-[13px] font-semibold"
            >
              Повторить
            </button>
          </div>
        )}

        {!isLoading && !isError && messages.length === 0 && (
          <div className="mt-10 text-center text-[13px] text-[var(--text-faint)]">
            Сообщений пока нет. Напишите магазину по этому заказу.
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          {items.map((it, i) =>
            it.kind === "day" ? (
              <div key={`d-${i}`} className="my-2 flex justify-center">
                <span className="glass rounded-[var(--r-pill)] px-3 py-1 text-[11px] text-[var(--text-muted)]">
                  {it.label}
                </span>
              </div>
            ) : (
              <MessageBubble
                key={it.msg.id}
                msg={it.msg}
                outgoing={it.msg.senderType === "CUSTOMER"}
                repliedTo={
                  it.msg.replyToMessageId
                    ? byId.get(it.msg.replyToMessageId) ?? null
                    : null
                }
                onImageClick={setLightbox}
              />
            )
          )}
        </div>
      </div>

      <Composer
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSend={handleSend}
        orderId={id}
      />

      {/* lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          >
            <button
              type="button"
              aria-label="Закрыть"
              className="absolute right-4 top-4 text-white"
              style={{ top: "calc(16px + var(--safe-top))" }}
            >
              <X className="h-7 w-7" />
            </button>
            <Image src={lightbox} alt="Вложение" size={1000} className="max-h-[80dvh] w-full" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composer — text input + attachment upload + send.
// ---------------------------------------------------------------------------
function Composer({
  replyTo,
  onCancelReply,
  onSend,
  orderId,
}: {
  replyTo: Message | null;
  onCancelReply: () => void;
  onSend: (req: SendMessageRequest) => Promise<void>;
  orderId: string;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function sendText() {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend({ type: "TEXT", text: t });
      setText("");
    } catch {
      setError("Не удалось отправить");
    } finally {
      setSending(false);
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { url } = await customerApi.uploadAttachment(file);
      const isImage = file.type.startsWith("image/");
      await onSend({
        type: isImage ? "PHOTO" : "FILE",
        attachmentUrl: url,
        fileName: file.name,
        mimeType: file.type,
        text: text.trim() || undefined,
      });
      setText("");
    } catch {
      setError("Не удалось загрузить вложение");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className="glass glass--floating z-10 px-3 pt-2"
      style={{ paddingBottom: "calc(10px + var(--safe-bottom))" }}
    >
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded-[var(--r-sm)] border-l-2 border-[var(--accent)] bg-white/5 px-2 py-1.5">
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-semibold text-[var(--accent)]">
              Ответ · {replyTo.senderName ?? ""}
            </span>
            <span className="line-clamp-1 text-[12px] text-[var(--text-muted)]">
              {replyTo.text ?? (replyTo.type === "PHOTO" ? "Фото" : "Файл")}
            </span>
          </span>
          <button
            type="button"
            aria-label="Отменить ответ"
            onClick={onCancelReply}
            className="tap flex h-7 w-7 min-h-0 min-w-0 items-center justify-center rounded-full text-[var(--text-muted)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {error && (
        <p className="mb-1 px-1 text-[12px] text-[var(--danger)]">{error}</p>
      )}
      <div className="flex items-end gap-2">
        <button
          type="button"
          aria-label="Вложение"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="tap flex shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] disabled:opacity-40"
        >
          <Paperclip className={`h-5 w-5 ${uploading ? "animate-pulse" : ""}`} />
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept="image/*,application/pdf,.doc,.docx,.zip"
          onChange={onPickFile}
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendText();
            }
          }}
          rows={1}
          placeholder="Сообщение…"
          className="glass max-h-28 min-h-[44px] flex-1 resize-none rounded-[var(--r-md)] px-3 py-2.5 text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
        />
        <button
          type="button"
          aria-label="Отправить"
          disabled={(!text.trim() && !uploading) || sending}
          onClick={sendText}
          data-order={orderId}
          className="tap flex shrink-0 items-center justify-center rounded-full text-[var(--accent-ink)] transition-opacity disabled:opacity-40"
          style={{ background: "var(--accent)" }}
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
