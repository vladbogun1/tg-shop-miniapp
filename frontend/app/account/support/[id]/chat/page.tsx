"use client";

/**
 * SUPPORT THREAD — a full-screen chat with the shop about a product or a general question (V43).
 * Same look and behaviour as the order chat (bubbles, day separators, image attach + paste,
 * load-earlier, realtime), different endpoints:
 *  - GET  /api/me/support/threads/{id}             (header: product / status)
 *  - GET  /api/me/support/threads/{id}/messages    (history)
 *  - POST /api/me/support/threads/{id}/messages    (send; reopens a closed thread)
 *  - POST /api/me/support/threads/{id}/read        (mark the shop's answers read)
 *  - POST /api/me/support/threads/{id}/close
 *  - WS   /topic/support/{id}
 *
 * `id = "new"` is a draft: nothing exists until the first message, which POSTs
 * /api/me/support/threads (with `?product=<id>` when asked from a product) and swaps the URL to the
 * real thread. The TabBar hides itself on any /chat route.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, CheckCheck, ImagePlus, LifeBuoy, Send, WifiOff, X } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { useT } from "@/i18n/context";
import { ApiError, customerApi, getAccessToken, onAccessToken, type SendMessageRequest } from "@/lib/api";
import { dayLabel } from "@/lib/format";
import { Image } from "@/lib/image";
import { spring } from "@/lib/motion";
import { connectSupportChat, supportApi, type SupportMessage } from "@/lib/support";
import { haptic } from "@/lib/telegram";
import { dayKey, supportAsChatMessage } from "@shop/shared";

/** Must match SupportService.DEFAULT_PAGE on the backend. */
const PAGE_SIZE = 50;

export default function SupportChatPage() {
  // useSearchParams needs a Suspense boundary, or the whole route bails out of static rendering.
  return (
    <Suspense fallback={null}>
      <SupportChat />
    </Suspense>
  );
}

/** Server message for the support limit codes (already in the customer's language), else a fallback. */
function errorText(e: unknown, fallback: string): string {
  if (e instanceof ApiError && e.code?.startsWith("SUPPORT_") && e.message) return e.message;
  if (e instanceof ApiError && e.status === 400 && e.message) return e.message;
  return fallback;
}

function SupportChat() {
  const t = useT();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const id = params.id;
  const isDraft = id === "new";
  const draftProductId = isDraft ? search.get("product") : null;

  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [replyTo, setReplyTo] = useState<SupportMessage | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef<Set<number>>(new Set());
  const [token, setToken] = useState<string | null>(() => getAccessToken());
  useEffect(() => onAccessToken(setToken), []);

  const { data: config } = useQuery({
    queryKey: ["me", "support", "config"],
    queryFn: () => supportApi.config(),
    enabled: !!token,
    staleTime: 60_000,
  });

  const { data: thread, refetch: refetchThread } = useQuery({
    queryKey: ["me", "support", "thread", id],
    queryFn: () => supportApi.thread(id),
    enabled: !!token && !isDraft,
  });

  const { data: draftProduct } = useQuery({
    queryKey: ["product", draftProductId],
    queryFn: () => customerApi.getProduct(draftProductId!),
    enabled: !!draftProductId,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["me", "support", "thread", id, "messages"],
    queryFn: () => supportApi.messages(id),
    enabled: !!token && !isDraft,
  });

  useEffect(() => {
    if (!data) return;
    seenIds.current = new Set(data.map((m) => m.id));
    setMessages(data);
    setHasMore(data.length >= PAGE_SIZE);
  }, [data]);

  const appendMessage = useCallback((m: SupportMessage) => {
    if (seenIds.current.has(m.id)) return;
    seenIds.current.add(m.id);
    setMessages((prev) => [...prev, m]);
  }, []);

  useEffect(() => {
    if (isDraft || !id || !token) return;
    const conn = connectSupportChat(id, appendMessage, setConnected);
    return () => conn.disconnect();
  }, [id, isDraft, token, appendMessage]);

  // Mark the shop's answers read (on load and whenever a new one arrives).
  useEffect(() => {
    if (isDraft || messages.length === 0) return;
    if (messages.some((m) => m.senderType === "ADMIN" && !m.readAt)) {
      supportApi
        .markRead(id)
        .then(() => queryClient.invalidateQueries({ queryKey: ["me", "support", "threads"] }))
        .catch(() => {});
    }
  }, [id, isDraft, messages, queryClient]);

  useEffect(() => {
    if (loadingEarlier) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only on new messages
  }, [messages.length]);

  async function loadEarlier() {
    const oldest = messages[0];
    if (!oldest || loadingEarlier) return;
    setLoadingEarlier(true);
    try {
      const older = await supportApi.messages(id, oldest.id);
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
    const map = new Map<number, SupportMessage>();
    messages.forEach((m) => map.set(m.id, m));
    return map;
  }, [messages]);

  // Grouped by the viewer's calendar day; each day's date chip sticks while it scrolls by.
  const days = useMemo(() => {
    const out: { key: string; label: string; msgs: SupportMessage[] }[] = [];
    for (const m of messages) {
      const key = dayKey(m.createdAt);
      const last = out[out.length - 1];
      if (last && last.key === key) last.msgs.push(m);
      else out.push({ key, label: dayLabel(m.createdAt), msgs: [m] });
    }
    return out;
  }, [messages]);

  async function handleSend(req: SendMessageRequest) {
    if (isDraft) {
      const created = await supportApi.create({
        productId: draftProductId ?? undefined,
        text: req.text,
        type: req.type,
        attachmentUrl: req.attachmentUrl,
        fileName: req.fileName,
        mimeType: req.mimeType,
      });
      void queryClient.invalidateQueries({ queryKey: ["me", "support", "threads"] });
      router.replace(`/account/support/${created.id}/chat`);
      return;
    }
    const sent = await supportApi.send(id, { ...req, replyToMessageId: replyTo?.id });
    appendMessage(sent);
    setReplyTo(null);
    if (thread?.status === "CLOSED") void refetchThread();
    void queryClient.invalidateQueries({ queryKey: ["me", "support", "threads"] });
  }

  async function closeThread() {
    haptic();
    try {
      await supportApi.close(id);
      await refetchThread();
      void queryClient.invalidateQueries({ queryKey: ["me", "support", "threads"] });
    } catch {
      /* the header keeps the old status; nothing else to do */
    }
  }

  const productTitle = thread?.productTitle ?? draftProduct?.title ?? null;
  const productImage = thread?.productImageUrl ?? draftProduct?.images?.[0]?.url ?? null;
  const title = productTitle || thread?.subject || (isDraft ? t("support.newTitle") : t("support.general"));
  const closed = thread?.status === "CLOSED";
  const disabled = config ? !config.enabled : false;
  const loading = !isDraft && (isLoading || !token);

  return (
    <div
      className="scene fixed inset-0 z-30 mx-auto flex max-w-[480px] flex-col bg-[var(--bg)]"
      style={{ paddingTop: "var(--safe-top)" }}
    >
      <header
        className="z-10 flex items-center gap-2.5 border-b border-[var(--line)] px-2.5 py-2.5 backdrop-blur-[12px]"
        style={{ background: "rgba(26,26,26,.92)" }}
      >
        <motion.button
          type="button"
          aria-label={t("common.back")}
          whileTap={{ scale: 0.92 }}
          transition={{ duration: 0.07 }}
          onClick={() => {
            haptic();
            router.push("/account/support");
          }}
          className="tap flex shrink-0 items-center justify-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2.5} />
        </motion.button>

        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-[var(--accent)] bg-[var(--accent-soft)]">
          {productImage ? (
            <Image src={productImage} alt={title} size={96} className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center text-[var(--accent)]">
              <LifeBuoy className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-display truncate text-[15px] font-bold text-[var(--ink)]">{title}</p>
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--muted)]">
            {isDraft ? (
              productTitle ? t("support.aboutProduct") : t("support.title")
            ) : (
              <>
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{
                    background: connected ? "var(--ok)" : "var(--faint)",
                    boxShadow: connected ? "0 0 6px var(--ok)" : "none",
                  }}
                />
                {closed
                  ? t("support.status.CLOSED")
                  : thread?.awaitingSince
                    ? t("support.waiting")
                    : connected
                      ? t("chat.online")
                      : t("chat.connecting")}
              </>
            )}
          </p>
        </div>

        {!isDraft && thread && !closed && (
          <motion.button
            type="button"
            aria-label={t("support.close")}
            title={t("support.close")}
            whileTap={{ scale: 0.92 }}
            transition={{ duration: 0.07 }}
            onClick={() => void closeThread()}
            className="tap flex shrink-0 items-center justify-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted)]"
          >
            <CheckCheck className="h-5 w-5" strokeWidth={2.25} />
          </motion.button>
        )}
      </header>

      <div ref={scrollRef} className="no-scrollbar flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {loading && (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`shimmer h-12 rounded-[var(--r-card)] ${i % 2 ? "w-1/2 self-end" : "w-2/3"}`}
              />
            ))}
          </div>
        )}

        {isError && (
          <div className="nb hud-frame mt-8 flex flex-col items-center gap-3 p-6 text-center">
            <WifiOff className="h-7 w-7 text-[var(--accent)]" strokeWidth={2.25} />
            <p className="text-[13px] text-[var(--muted)]">{t("chat.error")}</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="nb-accent nb-press tap nb-up px-5 py-2 text-[13px]"
            >
              {t("common.retry")}
            </button>
          </div>
        )}

        {(isDraft || (!loading && !isError && messages.length === 0)) && (
          <div className="mt-10 flex flex-col items-center gap-3 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-[var(--r-card)] border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--accent)]">
              <LifeBuoy className="h-6 w-6" strokeWidth={2.25} />
            </div>
            <p className="max-w-[16rem] text-[13px] text-[var(--muted)]">
              {disabled ? t("support.disabled") : t("support.newHint")}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          {hasMore && (
            <div className="mb-3 flex justify-center">
              <button
                type="button"
                onClick={() => void loadEarlier()}
                disabled={loadingEarlier}
                className="font-display tap rounded-full border border-[var(--line)] bg-[var(--surface)] px-3.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)] disabled:opacity-60"
              >
                {loadingEarlier ? t("common.loading") : t("chat.loadEarlier")}
              </button>
            </div>
          )}
          {days.map((day) => (
            <section key={`d-${day.key}`} className="flex flex-col gap-1.5" aria-label={day.label}>
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={spring}
                className="pointer-events-none sticky top-0 z-[2] my-2 flex justify-center"
              >
                <span className="font-display rounded-full bg-[rgba(34,34,34,.85)] px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)] shadow-[0_2px_8px_rgba(0,0,0,.35)] backdrop-blur-[6px]">
                  {day.label}
                </span>
              </motion.div>
              {day.msgs.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={supportAsChatMessage(msg)}
                  outgoing={msg.senderType === "CUSTOMER"}
                  repliedTo={(() => {
                    const r = msg.replyToMessageId ? byId.get(msg.replyToMessageId) : null;
                    return r ? supportAsChatMessage(r) : null;
                  })()}
                  onImageClick={setLightbox}
                />
              ))}
            </section>
          ))}
        </div>
      </div>

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
        <Composer
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onSend={handleSend}
          maxLength={config?.maxLength ?? 2000}
        />
      )}

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
              aria-label={t("common.close")}
              onClick={(e) => {
                e.stopPropagation();
                setLightbox(null);
              }}
              className="tap absolute right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[rgba(26,26,26,.85)] text-[var(--ink)]"
              style={{ top: "calc(16px + var(--safe-top))" }}
            >
              <X className="h-6 w-6" strokeWidth={2.25} />
            </button>
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={spring}
              className="relative z-10 w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src={lightbox}
                alt={t("chat.attachmentAlt")}
                size={1600}
                fit
                className="max-h-[80dvh] max-w-full rounded-[var(--r-card)]"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composer — text + image (picker / paste) + send, with the support length limit.
// ---------------------------------------------------------------------------
function Composer({
  replyTo,
  onCancelReply,
  onSend,
  maxLength,
}: {
  replyTo: SupportMessage | null;
  onCancelReply: () => void;
  onSend: (req: SendMessageRequest) => Promise<void>;
  maxLength: number;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const tooLong = text.trim().length > maxLength;

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 112)}px`;
  }, [text]);

  async function sendText() {
    const body = text.trim();
    if (!body || sending || tooLong) return;
    setSending(true);
    setError(null);
    haptic();
    try {
      await onSend({ type: "TEXT", text: body });
      setText("");
    } catch (e) {
      setError(errorText(e, t("chat.sendFailed")));
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
      if (text.trim().length > maxLength) return;
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
      } catch (e) {
        setError(errorText(e, t("chat.uploadFailed")));
      } finally {
        setUploading(false);
      }
    },
    [onSend, text, t, maxLength]
  );

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await uploadAndSend(file);
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const item = Array.from(e.clipboardData.items).find((it) => it.type.startsWith("image/"));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    e.preventDefault();
    void uploadAndSend(file);
  }

  return (
    <div
      className="z-10 border-t border-[var(--line)] bg-[var(--surface)] px-3 pt-2.5"
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
            <div className="mb-2 flex items-center gap-2 rounded-[var(--r)] border-l-2 border-[var(--accent)] bg-[var(--surface-2)] px-2.5 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="font-display block text-[12px] font-semibold text-[var(--accent)]">
                  {t("chat.replyTo", { name: replyTo.senderName ?? "" })}
                </span>
                <span className="line-clamp-1 text-[12px] text-[var(--muted)]">
                  {replyTo.text ??
                    (replyTo.type === "PHOTO" ? t("chat.attachment.photo") : t("chat.attachment.file"))}
                </span>
              </span>
              <button
                type="button"
                aria-label={t("chat.cancelReply")}
                onClick={onCancelReply}
                className="tap flex h-7 w-7 min-h-0 min-w-0 shrink-0 items-center justify-center rounded-full bg-[var(--surface-3)] text-[var(--muted)]"
              >
                <X className="h-4 w-4" strokeWidth={2.75} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && <p className="mb-1.5 px-1 text-[12px] font-bold text-[var(--danger)]">{error}</p>}
      {text.length > maxLength * 0.8 && (
        <p
          className={`mb-1 px-1 text-right text-[11px] tabular-nums ${tooLong ? "font-bold text-[var(--danger)]" : "text-[var(--faint)]"}`}
        >
          {t("support.chars", { n: text.trim().length, max: maxLength })}
        </p>
      )}

      <div className="flex items-end gap-2">
        <motion.button
          type="button"
          aria-label={t("chat.attach")}
          disabled={uploading}
          whileTap={{ scale: 0.92 }}
          transition={{ duration: 0.07 }}
          onClick={() => fileRef.current?.click()}
          className="tap flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted)] disabled:opacity-40"
        >
          <ImagePlus className={`h-5 w-5 ${uploading ? "animate-pulse" : ""}`} strokeWidth={2.5} />
        </motion.button>
        <input ref={fileRef} type="file" hidden accept="image/*" onChange={onPickFile} />

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
          placeholder={t("chat.placeholder")}
          className="max-h-28 min-h-[44px] flex-1 resize-none rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-2.5 text-[15px] text-[var(--ink)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--faint)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
        />

        <motion.button
          type="button"
          aria-label={t("chat.send")}
          disabled={!text.trim() || sending || tooLong}
          whileTap={{ scale: 0.9 }}
          transition={{ duration: 0.07 }}
          onClick={sendText}
          className="tap flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[var(--r)] bg-[var(--accent)] text-[var(--accent-ink)] shadow-[0_0_16px_-2px_rgba(255,102,0,.55)] transition-[opacity,box-shadow] disabled:opacity-40 disabled:shadow-none"
        >
          <Send className="h-5 w-5" strokeWidth={2.5} />
        </motion.button>
      </div>
    </div>
  );
}
