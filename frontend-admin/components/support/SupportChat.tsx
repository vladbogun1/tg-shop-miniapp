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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Paperclip, Send } from "lucide-react";
import { supportAsChatMessage } from "@shop/shared";
import { ApiError } from "@/lib/api";
import {
  refreshSupport,
  subscribeSupportChat,
  SUPPORT_CHAT_PAGE,
  SUPPORT_KEY,
  supportApi,
  type SupportMessage,
} from "@/lib/support-api";
import { useCoarsePointer } from "@/lib/use-media";
import { useToast } from "@/lib/toast";
import { Bubble } from "@/components/orders/OrderChat";
import { Button } from "@/components/ui/Button";
import { Lightbox } from "@/components/ui/Lightbox";

const drafts = new Map<string, string>();
const DRAFT_KEY = (id: string) => `tgshop_admin_support_draft:${id}`;

function loadDraft(id: string): string {
  if (drafts.has(id)) return drafts.get(id) ?? "";
  try {
    return sessionStorage.getItem(DRAFT_KEY(id)) ?? "";
  } catch {
    return "";
  }
}

function saveDraft(id: string, text: string) {
  drafts.set(id, text);
  try {
    if (text) sessionStorage.setItem(DRAFT_KEY(id), text);
    else sessionStorage.removeItem(DRAFT_KEY(id));
  } catch {
    // storage unavailable — the in-memory copy still survives closing the drawer
  }
}

function markCustomerRead(prev: SupportMessage[] = []): SupportMessage[] {
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

function appendUnique(prev: SupportMessage[] = [], msg: SupportMessage): SupportMessage[] {
  return prev.some((p) => p.id === msg.id) ? prev : [...prev, msg];
}

const ACCEPT = "image/*,application/pdf";

export function SupportChat({ threadId, closed }: { threadId: string; closed?: boolean }) {
  const qc = useQueryClient();
  const { push } = useToast();
  const coarse = useCoarsePointer();
  const [text, setTextState] = useState(() => loadDraft(threadId));
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [older, setOlder] = useState<SupportMessage[]>([]);
  const [olderExhausted, setOlderExhausted] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const setText = useCallback(
    (v: string) => {
      setTextState(v);
      saveDraft(threadId, v);
    },
    [threadId]
  );

  const key = useMemo(() => [...SUPPORT_KEY, "messages", threadId], [threadId]);
  const { data: latest = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: () => supportApi.messages(threadId),
  });

  const messages = useMemo(() => {
    if (older.length === 0) return latest;
    const seen = new Set(latest.map((m) => m.id));
    return [...older.filter((m) => !seen.has(m.id)), ...latest];
  }, [older, latest]);

  const canLoadOlder = !olderExhausted && latest.length >= SUPPORT_CHAT_PAGE;

  const markRead = useCallback(() => {
    supportApi
      .markRead(threadId)
      .then(() => {
        qc.setQueryData<SupportMessage[]>(key, (prev) => markCustomerRead(prev));
        // List row, nav badge and «Внимание» drop the unread count.
        refreshSupport(qc);
      })
      .catch(() => {});
  }, [threadId, qc, key]);

  useEffect(() => {
    markRead();
    const off = subscribeSupportChat(threadId, (msg) => {
      qc.setQueryData<SupportMessage[]>(key, (prev) => appendUnique(prev, msg));
      if (msg.senderType === "CUSTOMER" && document.visibilityState === "visible") markRead();
    });
    return off;
  }, [threadId, qc, key, markRead]);

  // Stick to the bottom when a message arrives at the END (not when older ones are prepended).
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
      const page = await supportApi.messages(threadId, first.id);
      if (page.length < SUPPORT_CHAT_PAGE) setOlderExhausted(true);
      setOlder((prev) => [...page, ...prev]);
      requestAnimationFrame(() => {
        if (box) box.scrollTop = box.scrollHeight - prevHeight + prevTop;
      });
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось загрузить", "error");
    } finally {
      setLoadingOlder(false);
    }
  }

  function afterSend(msg: SupportMessage) {
    qc.setQueryData<SupportMessage[]>(key, (prev) => appendUnique(prev, msg));
    // An answer clears «ждёт ответа» and reopens a closed thread.
    refreshSupport(qc);
  }

  async function send() {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      afterSend(await supportApi.send(threadId, { type: "TEXT", text: t }));
      setText("");
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось отправить", "error");
    } finally {
      setSending(false);
    }
  }

  async function uploadFile(file: File) {
    const isImage = file.type.startsWith("image/");
    if (!isImage && file.type !== "application/pdf") {
      push("Можно отправить изображение или PDF", "error");
      return;
    }
    setUploading(true);
    try {
      const { key: uploadKey } = await supportApi.uploadAttachment(threadId, file);
      afterSend(
        await supportApi.send(threadId, {
          type: isImage ? "PHOTO" : "FILE",
          attachmentUrl: uploadKey,
          fileName: file.name,
          mimeType: file.type,
        })
      );
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось загрузить", "error");
    } finally {
      setUploading(false);
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void uploadFile(file);
  }

  function onPaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
    const file = item?.getAsFile();
    if (file) {
      e.preventDefault();
      void uploadFile(file);
    }
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
        {!isLoading && messages.length === 0 && (
          <div className="font-display my-auto text-center text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">
            Сообщений пока нет
          </div>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} m={supportAsChatMessage(m)} onOpenImage={setLightbox} />
        ))}
      </div>

      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />

      {closed && (
        <p className="mt-2 text-center text-[12px] text-[var(--text-faint)]">
          Вопрос закрыт. Ответ откроет его снова.
        </p>
      )}

      <div className="mt-2 flex items-end gap-2">
        <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={onFile} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="nb-press grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--border-2)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)] disabled:opacity-50"
          aria-label="Прикрепить фото или PDF"
          title="Прикрепить фото или PDF"
        >
          <Paperclip className="h-5 w-5" />
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            // Desktop: Enter sends, Shift+Enter is a new line. Phone: Enter is a new line.
            if (e.key === "Enter" && !e.shiftKey && !coarse && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          rows={coarse ? 2 : 1}
          placeholder={
            coarse ? "Ответ клиенту…" : "Ответ клиенту… (Shift+Enter — новая строка, можно вставить фото)"
          }
          className="thin-scroll max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-[11px] text-[14px] leading-5 text-[var(--text)] outline-none transition-[border-color,box-shadow] placeholder:truncate placeholder:text-[13px] placeholder:text-[var(--text-faint)] hover:border-[var(--border-2)] focus:border-[var(--accent)] focus:shadow-[var(--ring-accent)]"
        />
        <Button
          variant="accent"
          onClick={() => void send()}
          loading={sending}
          aria-label="Отправить"
          className="!h-11 !w-11 shrink-0 !rounded-[var(--r-md)] !p-0"
          icon={<Send className="h-5 w-5" />}
        />
      </div>
    </div>
  );
}
