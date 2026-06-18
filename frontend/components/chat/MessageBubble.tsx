"use client";

/**
 * Telegram-style chat bubble (design doc §6.3): incoming left, outgoing right
 * (accent glass). Reply quote, attachment preview (photo via Image / file row),
 * time, and read ticks for outgoing messages.
 */
import { Check, CheckCheck, FileText } from "lucide-react";
import type { Message } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { Image } from "@/lib/image";

export function MessageBubble({
  msg,
  outgoing,
  repliedTo,
  onImageClick,
}: {
  msg: Message;
  outgoing: boolean;
  repliedTo?: Message | null;
  onImageClick?: (url: string) => void;
}) {
  if (msg.type === "SYSTEM") {
    return (
      <div className="my-2 flex justify-center">
        <span className="glass rounded-[var(--r-pill)] px-3 py-1 text-[12px] text-[var(--text-muted)]">
          {msg.text}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
      <div
        className={`relative max-w-[78%] rounded-[var(--r-md)] px-3 py-2 ${
          outgoing
            ? "[background:color-mix(in_srgb,var(--accent)_88%,transparent)] text-[var(--accent-ink)]"
            : "glass glass--strong text-[var(--text)]"
        }`}
        style={{
          borderBottomRightRadius: outgoing ? 6 : undefined,
          borderBottomLeftRadius: outgoing ? undefined : 6,
        }}
      >
        {!outgoing && msg.senderName && (
          <p className="mb-0.5 text-[12px] font-semibold text-[var(--accent)]">
            {msg.senderName}
          </p>
        )}

        {repliedTo && (
          <div
            className={`mb-1.5 rounded-[var(--r-sm)] border-l-2 px-2 py-1 text-[12px] ${
              outgoing ? "border-black/30 bg-black/10" : "border-[var(--accent)] bg-white/5"
            }`}
          >
            <span className="block font-semibold opacity-80">
              {repliedTo.senderName ?? "Сообщение"}
            </span>
            <span className="line-clamp-1 opacity-70">
              {repliedTo.text ?? (repliedTo.type === "PHOTO" ? "Фото" : "Файл")}
            </span>
          </div>
        )}

        {msg.type === "PHOTO" && msg.attachmentUrl && (
          <button
            type="button"
            onClick={() => onImageClick?.(msg.attachmentUrl!)}
            className="mb-1 block overflow-hidden rounded-[var(--r-sm)]"
          >
            <Image
              src={msg.attachmentUrl}
              alt={msg.fileName ?? "Фото"}
              size={500}
              className="max-h-60 w-full"
            />
          </button>
        )}

        {msg.type === "FILE" && msg.attachmentUrl && (
          <a
            href={msg.attachmentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`mb-1 flex items-center gap-2 rounded-[var(--r-sm)] px-2 py-1.5 ${
              outgoing ? "bg-black/10" : "bg-white/5"
            }`}
          >
            <FileText className="h-5 w-5 shrink-0" />
            <span className="truncate text-[13px]">{msg.fileName ?? "Файл"}</span>
          </a>
        )}

        {msg.text && (
          <p className="whitespace-pre-wrap break-words text-[14px] leading-snug">
            {msg.text}
          </p>
        )}

        <div
          className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${
            outgoing ? "opacity-70" : "text-[var(--text-faint)]"
          }`}
        >
          <span>{formatTime(msg.createdAt)}</span>
          {outgoing &&
            (msg.readAt ? (
              <CheckCheck className="h-3.5 w-3.5" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            ))}
        </div>
      </div>
    </div>
  );
}
