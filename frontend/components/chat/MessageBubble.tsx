"use client";

/**
 * ChiSetup chat bubble (design doc §6.3, DESIGN-V3 §6).
 * - outgoing (CUSTOMER): --accent-soft with a 2px orange left edge, aligned right, read ticks
 *   (✓ pending / ✓✓ read by `readAt`).
 * - incoming (ADMIN): --surface-2 aligned left with sender name.
 * - SYSTEM: centered pill.
 * PHOTO messages render the image (via `Image`) and open a lightbox on tap.
 * Reply quote, file row, time via `formatTime` preserved from the original.
 * 12px corners, hairline borders, no hard shadows.
 */
import { motion } from "framer-motion";
import { Check, CheckCheck, FileText } from "lucide-react";
import { mediaUrl, type Message } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { useT } from "@/i18n/context";
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
  const t = useT();
  if (msg.type === "SYSTEM") {
    return (
      <div className="my-2 flex justify-center">
        <span className="font-display rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">
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
        className={`relative max-w-[80%] overflow-hidden rounded-[var(--r-card)] text-[var(--ink)] ${
          photoOnly ? "p-1" : "px-3 py-2"
        } ${
          outgoing
            ? "rounded-br-[4px] border border-l-2 border-[rgba(255,102,0,.28)] border-l-[var(--accent)] bg-[#2A1A0F]"
            : "rounded-bl-[4px] border border-[var(--line)] bg-[var(--surface-2)]"
        }`}
      >
        {!outgoing && msg.senderName && (
          <p className="font-display mb-0.5 text-[12px] font-semibold text-[var(--accent)]">
            {msg.senderName}
          </p>
        )}

        {repliedTo && (
          <div
            className={`mb-1.5 rounded-[var(--r)] border-l-2 px-2 py-1 text-[12px] ${
              outgoing
                ? "border-[var(--accent-hi)] bg-[rgba(0,0,0,.25)]"
                : "border-[var(--accent)] bg-[var(--surface-3)]"
            }`}
          >
            <span className="block font-semibold text-[var(--accent-hi)]">
              {repliedTo.senderName ?? t("chat.reply.fallbackSender")}
            </span>
            <span className="line-clamp-1 text-[var(--muted)]">
              {repliedTo.text ??
                (repliedTo.type === "PHOTO" ? t("chat.attachment.photo") : t("chat.attachment.file"))}
            </span>
          </div>
        )}

        {isPhoto && (
          <button
            type="button"
            onClick={() => onImageClick?.(msg.attachmentUrl!)}
            className={`block w-full overflow-hidden rounded-[calc(var(--r-card)-4px)] ${
              photoOnly ? "" : "mb-1"
            }`}
          >
            <Image
              src={msg.attachmentUrl}
              alt={msg.fileName ?? t("chat.attachment.photo")}
              // A bubble is ~260px wide; asking for the stored original here is what made chat
              // photos crawl. The lightbox asks for the big one.
              size={480}
              fit
              className="max-h-72 max-w-full"
            />
          </button>
        )}

        {msg.type === "FILE" && msg.attachmentUrl && (
          // attachmentUrl is a server-relative signed link, so it needs the API origin to open
          // in a new tab (the chat pages and the Mini App can be served from different hosts).
          <a
            href={mediaUrl(msg.attachmentUrl) ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className={`mb-1 flex items-center gap-2 rounded-[var(--r)] border border-[var(--line)] px-2 py-1.5 ${
              outgoing ? "bg-[rgba(0,0,0,.25)]" : "bg-[var(--surface-3)]"
            }`}
          >
            <FileText className="h-5 w-5 shrink-0 text-[var(--accent)]" strokeWidth={2.25} />
            <span className="truncate text-[13px] font-semibold">{msg.fileName ?? t("chat.attachment.file")}</span>
          </a>
        )}

        {msg.text && (
          <p className="whitespace-pre-wrap break-words text-[14px] leading-snug">
            {msg.text}
          </p>
        )}

        <div
          className={`flex items-center justify-end gap-1 text-[10px] font-medium tabular-nums ${
            photoOnly
              ? "absolute bottom-2 right-2 rounded-full bg-[rgba(14,14,16,.75)] px-1.5 py-0.5 text-[var(--ink)]"
              : `mt-0.5 ${outgoing ? "text-[var(--accent-hi)]/80" : "text-[var(--faint)]"}`
          }`}
        >
          <span>{formatTime(msg.createdAt)}</span>
          {outgoing &&
            (msg.readAt ? (
              <CheckCheck className="h-3.5 w-3.5" strokeWidth={2.5} />
            ) : (
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            ))}
        </div>
      </div>
    </motion.div>
  );
}
