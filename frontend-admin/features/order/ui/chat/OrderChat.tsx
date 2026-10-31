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
import { Paperclip, Send, Zap } from "lucide-react";
import { CHAT_PAGE, type OrderMessage } from "../../api";
import { useCoarsePointer } from "@/lib/use-media";
import { toast } from "@shop/ui/toast";
import { Button } from "@shop/ui/admin-button";
import { Lightbox } from "@shop/ui/overlay";
import { ChatDaySection, useChatDays } from "@/components/ui/ChatDays";
import { loadDraft, mergeOlder, saveDraft } from "../../model/chat";
import {
  useOlderMessagesMutation,
  useOrderChatRealtime,
  useOrderMessagesQuery,
  useSendMessageMutation,
  useSendPhotoMutation,
} from "../../queries/chat";
import { Bubble } from "@/components/ui/Bubble";
import { TemplatePicker } from "./ReplyTemplates";


const messageTime = (m: { createdAt: string }) => m.createdAt;

export function OrderChat({ orderId }: { orderId: string }) {
  const coarse = useCoarsePointer();
  const [text, setTextState] = useState(() => loadDraft(orderId));
  const [older, setOlder] = useState<OrderMessage[]>([]);
  const [olderExhausted, setOlderExhausted] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const sendM = useSendMessageMutation(orderId);
  const photoM = useSendPhotoMutation(orderId);
  const olderM = useOlderMessagesMutation(orderId);
  const sending = sendM.isPending;
  const uploading = photoM.isPending;
  const loadingOlder = olderM.isPending;

  const setText = useCallback(
    (v: string) => {
      setTextState(v);
      saveDraft(orderId, v);
    },
    [orderId]
  );

  const { data: latest = [] } = useOrderMessagesQuery(orderId);
  const messages = useMemo(() => mergeOlder(latest, older), [older, latest]);

  const days = useChatDays(messages, messageTime);

  const canLoadOlder = !olderExhausted && latest.length >= CHAT_PAGE;

  useOrderChatRealtime(orderId);

  // Stick to the bottom when a new message arrives at the END (not when older ones are prepended).
  const lastId = messages.length ? messages[messages.length - 1].id : null;
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lastId]);

  function loadOlder() {
    const first = messages[0];
    if (!first || loadingOlder) return;
    const box = scrollRef.current;
    const prevHeight = box?.scrollHeight ?? 0;
    const prevTop = box?.scrollTop ?? 0;
    olderM.mutate(first.id, {
      onSuccess: (page) => {
        if (page.length < CHAT_PAGE) setOlderExhausted(true);
        setOlder((prev) => [...page, ...prev]);
        // Keep the message the admin was looking at in place.
        requestAnimationFrame(() => {
          if (box) box.scrollTop = box.scrollHeight - prevHeight + prevTop;
        });
      },
    });
  }

  function send() {
    const t = text.trim();
    if (!t) return;
    sendM.mutate(t, { onSuccess: () => setText("") });
  }

  /** Upload + send a single image (only images are allowed in chat). */
  function uploadImage(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Можно отправлять только изображения");
      return;
    }
    photoM.mutate(file);
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
