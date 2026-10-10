"use client";

/**
 * OrderChat — embedded admin-side chat.
 *  - GET /api/admin/orders/{id}/messages on open (latest page, "Загрузить ранее" pages back with
 *    before=), mark read — also for customer messages arriving while the chat is open.
 *  - v3 bubbles (DESIGN-V3 §6): ADMIN outgoing = --accent-soft + 2px orange bar on the left,
 *    CUSTOMER incoming = --surface-2 + hairline, SYSTEM = centered neutral chip.
 *  - Realtime via STOMP /topic/orders/{id}/chat.
 *  - Attachment upload via /api/admin/uploads -> attachmentUrl.
 *  - Send hits POST .../messages (backend pings customer bot).
 *  - Read receipts (✓/✓✓ by readAt), lightbox on images, paste-to-send.
 *  - Draft kept per order across tab switches; ⚡ reply templates in the customer's language.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Paperclip, Send, FileText, Check, CheckCheck, Zap } from "lucide-react";
import { adminApi, ApiError, type MessageDto } from "@/lib/api";
import { CHAT_PAGE, ordersApi } from "@/lib/orders-api";
import { closeChatNotifications } from "@/lib/push";
import { useCoarsePointer } from "@/lib/use-media";
import { subscribeOrderChat } from "@/lib/ws";
import { resolveImageSrc, resolveImageFull } from "@/lib/image";
import { useToast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";
import { Lightbox } from "@/components/ui/Lightbox";
import { cn } from "@/lib/cn";
import { TemplatePicker } from "./ReplyTemplates";
import { ChatDaySection, useChatDays } from "./ChatDays";

const messageTime = (m: MessageDto) => m.createdAt;

function timeOf(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

/** Exported for the support chat (components/support/SupportChat.tsx) — same bubbles. */
export function Bubble({
  m,
  onOpenImage,
}: {
  m: MessageDto;
  onOpenImage: (src: string) => void;
}) {
  if (m.senderType === "SYSTEM") {
    return (
      <div className="my-1 flex justify-center">
        <span className="font-display max-w-[90%] rounded-full bg-[var(--surface-3)] px-3 py-1 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
          {m.text}
        </span>
      </div>
    );
  }
  const mine = m.senderType === "ADMIN";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={cn("flex", mine ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[78%] px-3 py-2 text-[14px] text-[var(--text)]",
          mine
            ? "rounded-[var(--r-sm)] rounded-tl-[2px] rounded-bl-[2px] border-l-2 border-[var(--accent)] bg-[var(--accent-soft)]"
            : "rounded-[var(--r-lg)] rounded-tl-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)]"
        )}
      >
        {m.attachmentUrl && m.type === "PHOTO" && (
          <button
            type="button"
            onClick={() => onOpenImage(resolveImageFull(m.attachmentUrl!))}
            className="group relative mb-1 block cursor-zoom-in overflow-hidden rounded-[var(--r-sm)] border border-[var(--line)]"
            title="Открыть полностью"
          >
            <img
              src={resolveImageSrc(m.attachmentUrl, 480)}
              alt={m.fileName ?? "вложение"}
              className="max-h-60 object-cover transition-opacity group-hover:opacity-90"
            />
          </button>
        )}
        {m.attachmentUrl && m.type === "FILE" && (
          <a
            href={resolveImageSrc(m.attachmentUrl)}
            target="_blank"
            rel="noreferrer"
            className="mb-1 flex items-center gap-1.5 text-[var(--accent-hi)] underline"
          >
            <FileText className="h-4 w-4" />
            {m.fileName ?? "файл"}
          </a>
        )}
        {m.text && <div className="whitespace-pre-wrap break-words">{m.text}</div>}
        <div
          className={cn(
            "tabular mt-1 flex items-center justify-end gap-1 text-[10px] text-[var(--text-faint)]"
          )}
        >
          <span>{timeOf(m.createdAt)}</span>
          {mine &&
            (m.readAt ? (
              <CheckCheck className="h-3.5 w-3.5 text-[var(--accent-hi)]" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            ))}
        </div>
      </div>
    </motion.div>
  );
}

// ---- drafts -----------------------------------------------------------------
// The input used to live only in component state, so switching "Детали ↔ Чат" or closing the card
// threw the half-written reply away. Drafts are kept per order for the session.
const drafts = new Map<string, string>();
const DRAFT_KEY = (orderId: string) => `tgshop_admin_chat_draft:${orderId}`;

function loadDraft(orderId: string): string {
  if (drafts.has(orderId)) return drafts.get(orderId) ?? "";
  try {
    return sessionStorage.getItem(DRAFT_KEY(orderId)) ?? "";
  } catch {
    return "";
  }
}

function saveDraft(orderId: string, text: string) {
  drafts.set(orderId, text);
  try {
    if (text) sessionStorage.setItem(DRAFT_KEY(orderId), text);
    else sessionStorage.removeItem(DRAFT_KEY(orderId));
  } catch {
    // storage unavailable (private mode) — the in-memory copy still survives tab switches
  }
}

function markCustomerRead(prev: MessageDto[] = []): MessageDto[] {
  const now = new Date().toISOString();
  let changed = false;
  const next = prev.map((m) => {
    if (m.senderType === "CUSTOMER" && !m.readAt) {
      changed = true;
      return { ...m, readAt: now };
    }
    return m;
  });
  return changed ? next : prev;
}

export function OrderChat({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const { push } = useToast();
  const coarse = useCoarsePointer();
  const [text, setTextState] = useState(() => loadDraft(orderId));
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [older, setOlder] = useState<MessageDto[]>([]);
  const [olderExhausted, setOlderExhausted] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const setText = useCallback(
    (v: string) => {
      setTextState(v);
      saveDraft(orderId, v);
    },
    [orderId]
  );

  const key = useMemo(() => ["messages", orderId], [orderId]);
  const { data: latest = [] } = useQuery({
    queryKey: key,
    queryFn: () => ordersApi.messages(orderId),
  });

  const messages = useMemo(() => {
    if (older.length === 0) return latest;
    const seen = new Set(latest.map((m) => m.id));
    return [...older.filter((m) => !seen.has(m.id)), ...latest];
  }, [older, latest]);

  const days = useChatDays(messages, messageTime);

  const canLoadOlder = !olderExhausted && latest.length >= CHAT_PAGE;

  const markRead = useCallback(() => {
    adminApi
      .markRead(orderId)
      .then(() => {
        qc.setQueryData<MessageDto[]>(key, (prev) => markCustomerRead(prev));
        qc.invalidateQueries({ queryKey: ["board"] });
        // «Внимание» (and its badge on the menu / bell) lists unread chats.
        qc.invalidateQueries({ queryKey: ["admin", "inbox"] });
        closeChatNotifications(orderId);
      })
      .catch(() => {});
  }, [orderId, qc, key]);

  // Mark read on open + subscribe to realtime. A customer message that arrives while the chat is
  // open is read right away — it used to stay "unread" on the board and in the bell.
  useEffect(() => {
    markRead();
    const off = subscribeOrderChat(orderId, (msg) => {
      qc.setQueryData<MessageDto[]>(key, (prev = []) =>
        prev.some((p) => p.id === msg.id) ? prev : [...prev, msg]
      );
      if (msg.senderType === "CUSTOMER" && document.visibilityState === "visible") markRead();
    });
    return off;
  }, [orderId, qc, key, markRead]);

  // Stick to the bottom when a new message arrives at the END (not when older ones are prepended).
  const lastId = messages.length ? messages[messages.length - 1].id : null;
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lastId]);

  async function loadOlder() {
    const first = messages[0];
    if (!first || loadingOlder) return;
    const box = scrollRef.current;
    const prevHeight = box?.scrollHeight ?? 0;
    const prevTop = box?.scrollTop ?? 0;
    setLoadingOlder(true);
    try {
      const page = await ordersApi.messages(orderId, first.id);
      if (page.length < CHAT_PAGE) setOlderExhausted(true);
      setOlder((prev) => [...page, ...prev]);
      // Keep the message the admin was looking at in place.
      requestAnimationFrame(() => {
        if (box) box.scrollTop = box.scrollHeight - prevHeight + prevTop;
      });
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось загрузить", "error");
    } finally {
      setLoadingOlder(false);
    }
  }

  async function send() {
    const t = text.trim();
    if (!t) return;
    setSending(true);
    try {
      const msg = await adminApi.sendMessage(orderId, { type: "TEXT", text: t });
      qc.setQueryData<MessageDto[]>(key, (prev = []) =>
        prev.some((p) => p.id === msg.id) ? prev : [...prev, msg]
      );
      setText("");
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось отправить", "error");
    } finally {
      setSending(false);
    }
  }

  /** Upload + send a single image (only images are allowed in chat). */
  async function uploadImage(file: File) {
    if (!file.type.startsWith("image/")) {
      push("Можно отправлять только изображения", "error");
      return;
    }
    setUploading(true);
    try {
      const { key: uploadKey } = await adminApi.uploadChatAttachment(orderId, file);
      const msg = await adminApi.sendMessage(orderId, {
        type: "PHOTO",
        attachmentUrl: uploadKey,
        fileName: file.name,
        mimeType: file.type,
      });
      qc.setQueryData<MessageDto[]>(key, (prev = []) =>
        prev.some((p) => p.id === msg.id) ? prev : [...prev, msg]
      );
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Не удалось загрузить", "error");
    } finally {
      setUploading(false);
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) uploadImage(file);
  }

  /** Ctrl/Cmd+V an image from the clipboard → send it as a photo. */
  function onPaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
    if (item) {
      const file = item.getAsFile();
      if (file) {
        e.preventDefault();
        uploadImage(file);
      }
    }
  }

  function insertTemplate(t: string) {
    setText(text.trim() ? `${text.replace(/\s+$/, "")}\n${t}` : t);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div ref={scrollRef} className="thin-scroll flex flex-1 flex-col gap-2 overflow-y-auto p-1">
        {canLoadOlder && (
          <div className="flex justify-center">
            <Button size="sm" variant="ghost" loading={loadingOlder} onClick={loadOlder}>
              Загрузить ранее
            </Button>
          </div>
        )}
        {messages.length === 0 && (
          <div className="font-display my-auto text-center text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">
            Сообщений пока нет
          </div>
        )}
        {days.map((day) => (
          <ChatDaySection key={day.key} label={day.label}>
            {day.items.map((m) => (
              <Bubble key={m.id} m={m} onOpenImage={setLightbox} />
            ))}
          </ChatDaySection>
        ))}
      </div>

      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />

      <div className="mt-2 flex items-end gap-2">
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="nb-press grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--border-2)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)] disabled:opacity-50"
          aria-label="Прикрепить"
        >
          <Paperclip className="h-5 w-5" />
        </button>
        <button
          onClick={() => setTemplatesOpen(true)}
          className="nb-press grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--border-2)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)]"
          aria-label="Шаблоны ответов"
          title="Шаблоны ответов"
        >
          <Zap className="h-5 w-5" />
        </button>
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            // Desktop: Enter sends, Shift+Enter is a new line. Phone: Enter is always a new line —
            // a multi-line answer could not be typed there — and the button sends.
            if (e.key === "Enter" && !e.shiftKey && !coarse && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          rows={coarse ? 2 : 1}
          placeholder={
            coarse ? "Сообщение клиенту…" : "Сообщение клиенту… (Shift+Enter — новая строка, можно вставить фото)"
          }
          className="thin-scroll max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-[11px] text-[14px] leading-5 text-[var(--text)] outline-none transition-[border-color,box-shadow] placeholder:truncate placeholder:text-[13px] placeholder:text-[var(--text-faint)] hover:border-[var(--border-2)] focus:border-[var(--accent)] focus:shadow-[var(--ring-accent)]"
        />
        <Button
          variant="accent"
          onClick={send}
          loading={sending}
          aria-label="Отправить"
          className="!h-11 !w-11 shrink-0 !rounded-[var(--r-md)] !p-0"
          icon={<Send className="h-5 w-5" />}
        />
      </div>

      <TemplatePicker
        open={templatesOpen}
        orderId={orderId}
        onClose={() => setTemplatesOpen(false)}
        onPick={insertTemplate}
      />
    </div>
  );
}
