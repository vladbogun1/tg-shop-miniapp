"use client";

/**
 * ORDER CHAT (design doc §6) — NEO-BRUTALISM redesign.
 * A full-screen, Telegram-style chat for a single order.
 *  - GET  /api/me/orders/{id}/messages           (history)
 *  - GET  /api/me/orders/{id}                     (order status for the header)
 *  - POST /api/me/orders/{id}/messages            (send)
 *  - POST /api/me/orders/{id}/messages/read       (mark read)
 *  - POST /api/me/uploads                         (attachment, multipart)
 *  - WS   /topic/orders/{id}/chat                 (realtime append)
 *
 * Own fixed full-screen layout (the TabBar hides on /chat), safe-area aware:
 * sticky neo top bar + scrollable message list (day separators) + sticky neo
 * composer (text + attach image + paste-to-send + send) above the keyboard.
 */
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ImagePlus, Send, WifiOff, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  customerApi,
  getAccessToken,
  type Message,
  type SendMessageRequest,
} from "@/lib/api";
import { dayLabel, shortOrderId } from "@/lib/format";
import { Image } from "@/lib/image";
import { spring } from "@/lib/motion";
import { haptic } from "@/lib/telegram";
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

  // Order detail — only used to surface the status chip in the header.
  const { data: order } = useQuery({
    queryKey: ["me", "orders", id],
    queryFn: () => customerApi.getOrder(id),
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
      className="scene fixed inset-0 z-30 mx-auto flex max-w-[480px] flex-col bg-[var(--bg)]"
      style={{ paddingTop: "var(--safe-top)" }}
    >
      {/* sticky neo top bar */}
      <header className="z-10 flex items-center gap-2.5 border-b-[3px] border-[var(--line)] bg-[var(--surface)] px-2.5 py-2.5">
        <motion.button
          type="button"
          aria-label="Назад"
          whileTap={{ scale: 0.92 }}
          transition={{ duration: 0.07 }}
          onClick={() => {
            haptic();
            router.push(`/account/orders/${id}`);
          }}
          className="tap flex shrink-0 items-center justify-center rounded-[var(--r)] border-[2.5px] border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] shadow-[3px_3px_0_var(--shadow)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2.75} />
        </motion.button>

        {/* order avatar tile */}
        <div
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r)] border-[2.5px] border-[var(--line)] bg-[var(--c3)] text-[13px] font-black text-[var(--ink)]"
          aria-hidden
        >
          {id.slice(0, 2).toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-black uppercase tracking-wide text-[var(--ink)]">
            Заказ {shortOrderId(id)}
          </p>
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
            <span
              className="inline-block h-2 w-2 rounded-full border-[1.5px] border-[var(--line)]"
              style={{ background: connected ? "var(--ok)" : "var(--faint)" }}
            />
            {connected ? "В сети" : "Подключение…"}
          </p>
        </div>

        {order && <StatusChip status={order.status} />}
      </header>

      {/* messages */}
      <div
        ref={scrollRef}
        className="no-scrollbar flex-1 overflow-y-auto overscroll-contain px-3 py-3"
      >
        {isLoading && (
          <div className="flex flex-col gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`shimmer h-12 rounded-[var(--r)] ${
                  i % 2 ? "w-1/2 self-end" : "w-2/3"
                }`}
              />
            ))}
          </div>
        )}

        {isError && (
          <div className="mt-8 flex flex-col items-center gap-3 rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--surface)] p-6 text-center shadow-[5px_5px_0_var(--shadow)]">
            <WifiOff className="h-7 w-7 text-[var(--muted)]" strokeWidth={2.5} />
            <p className="text-[13px] font-semibold text-[var(--muted)]">
              Не удалось загрузить переписку.
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="tap nb-up rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--accent)] px-4 py-2 text-[13px] font-extrabold text-[var(--accent-ink)] shadow-[4px_4px_0_var(--shadow)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
            >
              Повторить
            </button>
          </div>
        )}

        {!isLoading && !isError && messages.length === 0 && (
          <div className="mt-12 flex flex-col items-center gap-3 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--c3)] text-2xl shadow-[4px_4px_0_var(--shadow)]">
              💬
            </div>
            <p className="max-w-[15rem] text-[13px] font-semibold text-[var(--muted)]">
              Сообщений пока нет. Напишите магазину по этому заказу.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          {items.map((it, i) =>
            it.kind === "day" ? (
              <motion.div
                key={`d-${i}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={spring}
                className="my-2 flex justify-center"
              >
                <span className="rounded-[var(--r)] border-[2.5px] border-[var(--line)] bg-[var(--surface-2)] px-3 py-1 text-[11px] font-black uppercase tracking-wide text-[var(--muted)]">
                  {it.label}
                </span>
              </motion.div>
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
              className="tap absolute right-4 flex items-center justify-center rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] shadow-[4px_4px_0_var(--shadow)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
              style={{ top: "calc(16px + var(--safe-top))" }}
            >
              <X className="h-6 w-6" strokeWidth={2.75} />
            </button>
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={spring}
              className="w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src={lightbox}
                alt="Вложение"
                size={1000}
                className="max-h-[80dvh] w-full rounded-[var(--r)] border-[3px] border-[var(--line)]"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composer — text input + attachment upload + paste-to-send + send.
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
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea up to its max height.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 112)}px`;
  }, [text]);

  async function sendText() {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setError(null);
    haptic();
    try {
      await onSend({ type: "TEXT", text: t });
      setText("");
    } catch {
      setError("Не удалось отправить");
    } finally {
      setSending(false);
    }
  }

  // Upload an image file and send it as a PHOTO (shared by picker + paste).
  const uploadAndSend = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setError("Можно отправлять только изображения");
        return;
      }
      setUploading(true);
      setError(null);
      haptic();
      try {
        const { url } = await customerApi.uploadAttachment(file);
        await onSend({
          type: "PHOTO",
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
    },
    [onSend, text]
  );

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await uploadAndSend(file);
  }

  // Paste-to-send: grab an image from the clipboard and upload it.
  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const item = Array.from(e.clipboardData.items).find((it) =>
      it.type.startsWith("image/")
    );
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    e.preventDefault();
    void uploadAndSend(file);
  }

  return (
    <div
      className="z-10 border-t-[3px] border-[var(--line)] bg-[var(--surface)] px-3 pt-2.5"
      style={{ paddingBottom: "calc(10px + var(--safe-bottom))" }}
    >
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={spring}
            className="overflow-hidden"
          >
            <div className="mb-2 flex items-center gap-2 rounded-[var(--r)] border-[2.5px] border-l-[5px] border-[var(--line)] border-l-[var(--accent)] bg-[var(--surface-2)] px-2 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-black uppercase tracking-wide text-[var(--accent)]">
                  Ответ · {replyTo.senderName ?? ""}
                </span>
                <span className="line-clamp-1 text-[12px] font-medium text-[var(--muted)]">
                  {replyTo.text ?? (replyTo.type === "PHOTO" ? "Фото" : "Файл")}
                </span>
              </span>
              <button
                type="button"
                aria-label="Отменить ответ"
                onClick={onCancelReply}
                className="tap flex h-7 w-7 min-h-0 min-w-0 shrink-0 items-center justify-center rounded-[var(--r)] border-[2px] border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]"
              >
                <X className="h-4 w-4" strokeWidth={2.75} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <p className="mb-1.5 px-1 text-[12px] font-bold text-[var(--danger)]">{error}</p>
      )}

      <div className="flex items-end gap-2">
        <motion.button
          type="button"
          aria-label="Прикрепить изображение"
          disabled={uploading}
          whileTap={{ scale: 0.92 }}
          transition={{ duration: 0.07 }}
          onClick={() => fileRef.current?.click()}
          className="tap flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[var(--r)] border-[2.5px] border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] shadow-[3px_3px_0_var(--shadow)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:opacity-40"
        >
          <ImagePlus
            className={`h-5 w-5 ${uploading ? "animate-pulse" : ""}`}
            strokeWidth={2.5}
          />
        </motion.button>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept="image/*"
          onChange={onPickFile}
        />

        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendText();
            }
          }}
          rows={1}
          placeholder="Сообщение…"
          className="max-h-28 min-h-[44px] flex-1 resize-none rounded-[var(--r)] border-[2.5px] border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-2.5 text-[15px] font-medium text-[var(--ink)] outline-none placeholder:text-[var(--faint)]"
        />

        <motion.button
          type="button"
          aria-label="Отправить"
          disabled={(!text.trim() && !uploading) || sending}
          whileTap={{ scale: 0.9 }}
          transition={{ duration: 0.07 }}
          onClick={sendText}
          data-order={orderId}
          className="tap flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[var(--r)] border-[2.5px] border-[var(--line)] bg-[var(--accent)] text-[var(--accent-ink)] shadow-[3px_3px_0_var(--shadow)] transition-transform active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:opacity-40 disabled:shadow-none"
        >
          <Send className="h-5 w-5" strokeWidth={2.5} />
        </motion.button>
      </div>
    </div>
  );
}
