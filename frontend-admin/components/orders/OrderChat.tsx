"use client";

/**
 * OrderChat — embedded admin-side chat (design doc §6ter.2, SPEC chat).
 *  - GET /api/admin/orders/{id}/messages on open, mark read.
 *  - Telegram-style bubbles (ADMIN outgoing = accent, CUSTOMER incoming = glass).
 *  - Realtime via STOMP /topic/orders/{id}/chat.
 *  - Attachment upload via /api/admin/uploads -> attachmentUrl.
 *  - Send hits POST .../messages (backend pings customer bot).
 */
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Paperclip, Send, FileText, Check, CheckCheck } from "lucide-react";
import { adminApi, ApiError, type MessageDto } from "@/lib/api";
import { subscribeOrderChat } from "@/lib/ws";
import { resolveImageSrc, resolveImageFull } from "@/lib/image";
import { useToast } from "@/lib/toast";
import { GlassButton } from "@/components/ui/GlassButton";
import { Lightbox } from "@/components/ui/Lightbox";

function timeOf(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function Bubble({ m, onOpenImage }: { m: MessageDto; onOpenImage: (src: string) => void }) {
  if (m.senderType === "SYSTEM") {
    return (
      <div className="my-1 text-center text-[12px] text-[var(--text-faint)]">
        {m.text}
      </div>
    );
  }
  const mine = m.senderType === "ADMIN";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-[var(--r-md)] px-3 py-2 text-[14px] ${
          mine
            ? "text-[var(--accent-ink)] [background:var(--accent)]"
            : "glass text-[var(--text)]"
        }`}
      >
        {m.attachmentUrl && m.type === "PHOTO" && (
          <button
            type="button"
            onClick={() => onOpenImage(resolveImageFull(m.attachmentUrl!))}
            className="group relative mb-1 block cursor-zoom-in overflow-hidden rounded-[var(--r-sm)]"
            title="Открыть полностью"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
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
            className="mb-1 flex items-center gap-1.5 underline"
          >
            <FileText className="h-4 w-4" />
            {m.fileName ?? "файл"}
          </a>
        )}
        {m.text && <div className="whitespace-pre-wrap break-words">{m.text}</div>}
        <div
          className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
            mine ? "text-[var(--accent-ink)]/70" : "text-[var(--text-faint)]"
          }`}
        >
          <span>{timeOf(m.createdAt)}</span>
          {mine &&
            (m.readAt ? (
              <CheckCheck className="h-3.5 w-3.5" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            ))}
        </div>
      </div>
    </div>
  );
}

export function OrderChat({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const { push } = useToast();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const key = ["messages", orderId];
  const { data: messages = [] } = useQuery({
    queryKey: key,
    queryFn: () => adminApi.messages(orderId),
  });

  // Mark read on open + subscribe to realtime.
  useEffect(() => {
    adminApi.markRead(orderId).catch(() => {});
    qc.invalidateQueries({ queryKey: ["board"] });
    const off = subscribeOrderChat(orderId, (msg) => {
      qc.setQueryData<MessageDto[]>(key, (prev = []) =>
        prev.some((p) => p.id === msg.id) ? prev : [...prev, msg]
      );
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

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
      const { key: uploadKey } = await adminApi.upload(file);
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
    const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
      i.type.startsWith("image/")
    );
    if (item) {
      const file = item.getAsFile();
      if (file) {
        e.preventDefault();
        uploadImage(file);
      }
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        ref={scrollRef}
        className="thin-scroll flex flex-1 flex-col gap-2 overflow-y-auto p-1"
      >
        {messages.length === 0 && (
          <div className="my-auto text-center text-[13px] text-[var(--text-faint)]">
            Сообщений пока нет
          </div>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} m={m} onOpenImage={setLightbox} />
        ))}
      </div>

      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />

      <div className="mt-2 flex items-end gap-2">
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="glass grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r-md)] text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-50"
          aria-label="Прикрепить"
        >
          <Paperclip className="h-5 w-5" />
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder="Сообщение клиенту… (можно вставить фото из буфера)"
          className="glass thin-scroll max-h-32 flex-1 resize-none rounded-[var(--r-md)] px-3.5 py-3 text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
        />
        <GlassButton
          variant="accent"
          onClick={send}
          loading={sending}
          className="!h-11 !w-11 !rounded-[var(--r-md)] !p-0"
          icon={<Send className="h-5 w-5" />}
        />
      </div>
    </div>
  );
}
