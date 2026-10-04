"use client";

/**
 * Copied from the Mini App (frontend/components/chat/MessageBubble.tsx); only the imports changed
 * (site i18n/formatters; media links are same-origin, so they are used as they are).
 *
 * Chat bubble (DESIGN-V3 §6).
 * - outgoing (CUSTOMER): soft orange fill with a 2px orange left edge, aligned right, read ticks
 *   (✓ pending / ✓✓ read by `readAt`).
 * - incoming (ADMIN): --surface-2 aligned left with sender name.
 * - SYSTEM: centered pill.
 * PHOTO messages render the image (via `Image`) and open a lightbox on tap.
 * Reply quote, file row, time via `formatTime` preserved from the original.
 * Sharp corners, thick borders, hard offset shadow.
 */
import { motion } from "framer-motion";
import { Check, CheckCheck, FileText } from "lucide-react";
import type { Message } from "@shop/shared";
import { useT } from "@/i18n/context";
import { Image } from "@/lib/image";
import { spring, noFadeFlash } from "@/lib/motion";
import { useFmt } from "@/lib/use-fmt";

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
  const fmt = useFmt();
  if (msg.type === "SYSTEM") {
    return (
      <div className="my-2 flex justify-center">
        <span className="rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1 font-display text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--muted)]">
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
      {...noFadeFlash}
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={spring}
      className={`flex ${outgoing ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`relative max-w-[85%] sm:max-w-[70%] overflow-hidden rounded-[var(--r-card)] border ${
          photoOnly ? "p-1" : "px-3 py-2"
        } ${
          outgoing
            ? "border-[rgba(255,102,0,.28)] border-l-2 border-l-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink)]"
            : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
        }`}
      >
        {!outgoing && msg.senderName && (
          <p className="mb-0.5 font-display text-[12px] font-semibold uppercase tracking-[.08em] text-[var(--accent-hi)]">
            {msg.senderName}
          </p>
        )}

        {repliedTo && (
          <div
            className={`mb-1.5 rounded-[var(--r)] border-l px-2 py-1 text-[12px] ${
              outgoing
                ? "border-[var(--accent)] bg-[rgba(0,0,0,.25)]"
                : "border-[var(--accent)] bg-[var(--surface-3)]"
            }`}
          >
            <span className="block font-semibold opacity-90">
              {repliedTo.senderName ?? t("chat.reply.fallbackSender")}
            </span>
            <span className="line-clamp-1 opacity-75">
              {repliedTo.text ??
                (repliedTo.type === "PHOTO" ? t("chat.attachment.photo") : t("chat.attachment.file"))}
            </span>
          </div>
        )}

        {isPhoto && (
          <button
            type="button"
            onClick={() => onImageClick?.(msg.attachmentUrl!)}
            className={`block w-full overflow-hidden rounded-[var(--r)] border border-[var(--line)] ${
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
            href={msg.attachmentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`mb-1 flex items-center gap-2 rounded-[var(--r)] border border-[var(--line)] px-2 py-1.5 ${
              outgoing
                ? "bg-[rgba(0,0,0,.25)]"
                : "bg-[var(--surface-3)]"
            }`}
          >
            <FileText className="h-5 w-5 shrink-0" strokeWidth={2.5} />
            <span className="truncate text-[13px] font-semibold">{msg.fileName ?? t("chat.attachment.file")}</span>
          </a>
        )}

        {msg.text && (
          <p className="whitespace-pre-wrap break-words text-[14px] leading-snug">
            {msg.text}
          </p>
        )}

        <div
          className={`flex items-center justify-end gap-1 text-[10px] font-semibold ${
            photoOnly
              ? "absolute bottom-2 right-2 rounded-full bg-[rgba(14,14,16,.8)] px-1.5 py-0.5 text-[var(--ink)]"
              : `mt-0.5 ${outgoing ? "text-[var(--muted)]" : "text-[var(--faint)]"}`
          }`}
        >
          <span>{fmt.time(msg.createdAt)}</span>
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
