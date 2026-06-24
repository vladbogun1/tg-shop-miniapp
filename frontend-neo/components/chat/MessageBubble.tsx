"use client";

/**
 * NEO-BRUTALISM chat bubble (design doc §6.3).
 * - outgoing (CUSTOMER): accent fill + ink border aligned right, read ticks
 *   (✓ pending / ✓✓ read by `readAt`).
 * - incoming (ADMIN): surface + ink border aligned left with sender name.
 * - SYSTEM: centered bordered pill.
 * PHOTO messages render the image (via `Image`) and open a lightbox on tap.
 * Reply quote, file row, time via `formatTime` preserved from the original.
 * Sharp corners, thick borders, hard offset shadow.
 */
import { motion } from "framer-motion";
import { Check, CheckCheck, FileText } from "lucide-react";
import type { Message } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { Image } from "@/lib/image";
import { spring } from "@/lib/motion";

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
        <span className="rounded-[var(--r)] border-[2.5px] border-[var(--line)] bg-[var(--surface-2)] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
          {msg.text}
        </span>
      </div>
    );
  }

  const isPhoto = msg.type === "PHOTO" && !!msg.attachmentUrl;
  // A photo with no other content: let the image fill the bubble, overlay the time.
  const photoOnly = isPhoto && !msg.text && !repliedTo && !msg.senderName;

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={spring}
      className={`flex ${outgoing ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`relative max-w-[80%] overflow-hidden rounded-[var(--r)] border-[3px] border-[var(--line)] shadow-[4px_4px_0_var(--shadow)] ${
          photoOnly ? "p-1" : "px-3 py-2"
        } ${
          outgoing
            ? "bg-[var(--accent)] text-[var(--accent-ink)]"
            : "bg-[var(--surface)] text-[var(--ink)]"
        }`}
      >
        {!outgoing && msg.senderName && (
          <p className="mb-0.5 text-[12px] font-black uppercase tracking-wide text-[var(--accent)]">
            {msg.senderName}
          </p>
        )}

        {repliedTo && (
          <div
            className={`mb-1.5 rounded-[var(--r)] border-l-[3px] px-2 py-1 text-[12px] ${
              outgoing
                ? "border-[var(--accent-ink)] bg-[color-mix(in_srgb,var(--accent-ink)_14%,transparent)]"
                : "border-[var(--accent)] bg-[var(--surface-2)]"
            }`}
          >
            <span className="block font-extrabold opacity-90">
              {repliedTo.senderName ?? "Сообщение"}
            </span>
            <span className="line-clamp-1 opacity-75">
              {repliedTo.text ?? (repliedTo.type === "PHOTO" ? "Фото" : "Файл")}
            </span>
          </div>
        )}

        {isPhoto && (
          <button
            type="button"
            onClick={() => onImageClick?.(msg.attachmentUrl!)}
            className={`block w-full overflow-hidden rounded-[var(--r)] border-[2.5px] border-[var(--line)] ${
              photoOnly ? "" : "mb-1"
            }`}
          >
            <Image
              src={msg.attachmentUrl}
              alt={msg.fileName ?? "Фото"}
              size={1000}
              fit
              className="max-h-72 max-w-full"
            />
          </button>
        )}

        {msg.type === "FILE" && msg.attachmentUrl && (
          <a
            href={msg.attachmentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`mb-1 flex items-center gap-2 rounded-[var(--r)] border-[2.5px] border-[var(--line)] px-2 py-1.5 ${
              outgoing
                ? "bg-[color-mix(in_srgb,var(--accent-ink)_12%,transparent)]"
                : "bg-[var(--surface-2)]"
            }`}
          >
            <FileText className="h-5 w-5 shrink-0" strokeWidth={2.5} />
            <span className="truncate text-[13px] font-bold">{msg.fileName ?? "Файл"}</span>
          </a>
        )}

        {msg.text && (
          <p className="whitespace-pre-wrap break-words text-[14px] font-medium leading-snug">
            {msg.text}
          </p>
        )}

        <div
          className={`flex items-center justify-end gap-1 text-[10px] font-bold ${
            photoOnly
              ? "absolute bottom-2 right-2 rounded-[var(--r)] border-[2px] border-[var(--line)] bg-[var(--surface)] px-1.5 py-0.5 text-[var(--ink)]"
              : `mt-0.5 ${outgoing ? "opacity-80" : "text-[var(--faint)]"}`
          }`}
        >
          <span>{formatTime(msg.createdAt)}</span>
          {outgoing &&
            (msg.readAt ? (
              <CheckCheck className="h-3.5 w-3.5" strokeWidth={3} />
            ) : (
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            ))}
        </div>
      </div>
    </motion.div>
  );
}
