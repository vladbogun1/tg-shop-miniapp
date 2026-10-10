"use client";

/**
 * /account/support/[id] — one support thread: topic card (product or general question), status,
 * «Close», and the chat. Same patterns as the order chat (components/chat/OrderChat.tsx, left
 * untouched): paged history, STOMP realtime with the access cookie, text + one image (picker or
 * paste), the same MessageBubble. Differences: support endpoints, a client-side length counter, the
 * server's localized refusal (cooldown, hourly limit, too long) shown inline, and a closed state —
 * writing into a CLOSED thread reopens it.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ImagePlus, Lock, Send, WifiOff, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  dayKey,
  type Message,
  noFadeFlash,
  type SendMessageRequest,
  type SupportThread,
} from "@shop/shared";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/i18n/context";
import { ApiError, refreshSession } from "@/lib/api";
import { useEscape } from "@/lib/hooks";
import { Image } from "@/lib/image";
import {
  connectSupportChat,
  SUPPORT_DEFAULTS,
  SUPPORT_KEYS,
  SUPPORT_PAGE_SIZE,
  supportApi,
  supportErrorText,
  toChatMessage,
  useSupportConfig,
} from "@/lib/support";
import { useFmt } from "@/lib/use-fmt";
import { SupportStatusChip, SupportTopicCard, threadTitle } from "./parts";

export function SupportThreadView({ id }: { id: string }) {
  const { t, href } = useI18n();
  const qc = useQueryClient();
  const thread = useQuery({
    queryKey: SUPPORT_KEYS.thread(id),
    queryFn: () => supportApi.thread(id),
    retry: (n, e) => !(e instanceof ApiError && (e.status === 404 || e.status === 400)) && n < 2,
  });
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  const setThread = useCallback(
    (th: SupportThread) => {
      qc.setQueryData(SUPPORT_KEYS.thread(id), th);
      void qc.invalidateQueries({ queryKey: SUPPORT_KEYS.threads });
    },
    [qc, id]
  );

  async function onClose() {
    if (closing || !window.confirm(t("support.closeConfirm"))) return;
    setClosing(true);
    setCloseError(null);
    try {
      setThread(await supportApi.close(id));
    } catch (e) {
      setCloseError(supportErrorText(e, t));
    } finally {
      setClosing(false);
    }
  }

  const back = (
    <Link
      href={href("/account/support")}
      className="inline-flex min-h-11 items-center gap-2 self-start font-display text-[13px] font-semibold uppercase tracking-[.08em] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
    >
      <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
      {t("support.back")}
    </Link>
  );

  if (thread.isPending) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <div className="shimmer h-20" />
        <div className="shimmer h-[420px]" />
      </div>
    );
  }
  if (thread.isError || !thread.data) {
    const notFound = thread.error instanceof ApiError && (thread.error.status === 404 || thread.error.status === 400);
    return (
      <div className="flex flex-col gap-4">
        {back}
        <div className="nb flex flex-col items-start gap-3 p-6">
          <p className="text-[15px] font-semibold text-[var(--danger)]">
            {notFound ? t("support.error.notFound") : t("support.error.load")}
          </p>
          {!notFound && (
            <Button variant="accent" size="sm" onClick={() => void thread.refetch()}>
              {t("common.retry")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  const th = thread.data;
  const isProduct = !!th.productId;
  const closed = th.status === "CLOSED";

  return (
    <div className="flex flex-col gap-4">
      {back}
      <SupportTopicCard
        eyebrow={isProduct ? t("support.product") : t("support.general")}
        title={threadTitle(th, t)}
        imageUrl={th.productImageUrl}
        productPath={isProduct ? `/product/${th.productSlug ?? th.productId}` : null}
      >
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <SupportStatusChip status={th.status} />
          {!closed && th.awaitingSince && (
            <span className="text-[12px] font-medium text-[var(--faint)]">{t("support.awaiting")}</span>
          )}
        </div>
      </SupportTopicCard>

      {!closed && (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="surface" loading={closing} onClick={() => void onClose()} icon={<Lock className="h-4 w-4" strokeWidth={2.25} />}>
            {t("support.close")}
          </Button>
          {closeError && <p className="text-[13px] font-semibold text-[var(--danger)]">{closeError}</p>}
        </div>
      )}

      <SupportChat
        threadId={id}
        closed={closed}
        onThreadChanged={() => void qc.invalidateQueries({ queryKey: SUPPORT_KEYS.thread(id) })}
      />
    </div>
  );
}

function SupportChat({
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef<Set<number>>(new Set());
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

  useEffect(() => {
    if (!data) return;
    seenIds.current = new Set(data.map((m) => m.id));
    setMessages(data);
    setHasMore(data.length >= SUPPORT_PAGE_SIZE);
  }, [data]);

  const appendMessage = useCallback((m: Message) => {
    if (seenIds.current.has(m.id)) return;
    seenIds.current.add(m.id);
    setMessages((prev) => [...prev, m]);
    // An admin answer or a system line (closed/reopened) can change the thread card.
    if (m.senderType !== "CUSTOMER") changed.current();
  }, []);

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
      const older = (await supportApi.messages(threadId, oldest.id)).map(toChatMessage);
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
      setHasMore(older.length >= SUPPORT_PAGE_SIZE);
    } catch {
      /* the button stays; the customer can try again */
    } finally {
      setLoadingEarlier(false);
    }
  }

  const byId = useMemo(() => {
    const map = new Map<number, Message>();
    messages.forEach((m) => map.set(m.id, m));
    return map;
  }, [messages]);

  // Grouped by the viewer's calendar day (browser time zone), Telegram-style: each day is a
  // section whose date chip sticks to the top of the chat while that day scrolls by.
  const days = useMemo(() => {
    const out: { key: string; label: string; msgs: Message[] }[] = [];
    for (const m of messages) {
      const key = dayKey(m.createdAt);
      const last = out[out.length - 1];
      if (last && last.key === key) last.msgs.push(m);
      else out.push({ key, label: fmt.dayLabel(m.createdAt), msgs: [m] });
    }
    return out;
  }, [messages, fmt]);

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

function Composer({ onSend, maxLength }: { onSend: (req: SendMessageRequest) => Promise<void>; maxLength: number }) {
  const { t } = useI18n();
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

  const length = text.trim().length;
  const tooLong = length > maxLength;
  // Show the counter once the text gets near the limit, so short messages stay uncluttered.
  const showCounter = length > maxLength * 0.8;

  async function sendText() {
    const body = text.trim();
    if (!body || sending) return;
    if (tooLong) {
      setError(t("support.tooLong", { max: maxLength }));
      return;
    }
    setSending(true);
    setError(null);
    try {
      await onSend({ type: "TEXT", text: body });
      setText("");
    } catch (e) {
      setError(supportErrorText(e, t, "chat.sendFailed"));
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
      const caption = text.trim();
      if (caption.length > maxLength) {
        setError(t("support.tooLong", { max: maxLength }));
        return;
      }
      setUploading(true);
      setError(null);
      try {
        let key: string;
        try {
          key = (await supportApi.upload(file)).url;
        } catch {
          setError(t("chat.uploadFailed"));
          return;
        }
        await onSend({ type: "PHOTO", attachmentUrl: key, fileName: file.name, mimeType: file.type, text: caption || undefined });
        setText("");
      } catch (e) {
        setError(supportErrorText(e, t, "chat.sendFailed"));
      } finally {
        setUploading(false);
      }
    },
    [onSend, text, t, maxLength]
  );

  return (
    <div className="border-t border-[var(--line)] bg-[var(--surface)] px-3 py-3">
      {error && (
        <p role="alert" className="mb-1.5 px-1 text-[12px] font-semibold text-[var(--danger)]">
          {error}
        </p>
      )}
      <div className="flex items-end gap-2">
        <button
          type="button"
          aria-label={t("chat.attach")}
          title={t("chat.attach")}
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--muted)] transition-colors hover:text-[var(--ink)] active:scale-[.96] disabled:opacity-40"
        >
          <ImagePlus className={`h-5 w-5 ${uploading ? "animate-pulse" : ""}`} strokeWidth={2} />
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
          aria-invalid={tooLong || undefined}
          placeholder={t("chat.placeholder")}
          className={`max-h-[140px] min-h-[44px] min-w-0 flex-1 resize-none rounded-[var(--r)] border bg-[var(--surface-2)] px-3.5 py-2.5 text-[15px] text-[var(--ink)] outline-none placeholder:text-[var(--faint)] ${
            tooLong ? "border-[var(--danger)]" : "border-[var(--line)] focus:border-[var(--accent)]"
          }`}
        />
        <button
          type="button"
          aria-label={t("chat.send")}
          title={t("chat.send")}
          disabled={!text.trim() || sending || tooLong}
          onClick={() => void sendText()}
          className="chamfer grid h-11 w-11 shrink-0 place-items-center bg-[var(--accent)] text-[var(--accent-ink)] transition-colors [--chamfer:7px] hover:bg-[var(--accent-hi)] active:scale-[.96] disabled:opacity-40"
        >
          <Send className="h-5 w-5" strokeWidth={2.25} />
        </button>
      </div>
      {showCounter && (
        <p
          className={`mt-1 px-1 text-right font-display text-[11px] font-semibold tabular-nums ${tooLong ? "text-[var(--danger)]" : "text-[var(--faint)]"}`}
          aria-live="polite"
        >
          {t("support.counter", { n: length, max: maxLength })}
        </p>
      )}
    </div>
  );
}
