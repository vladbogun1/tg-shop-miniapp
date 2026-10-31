"use client";

/** Пузырь сообщения чата (v3: свои — оранжевая полоса слева, покупателя — hairline, системное — чип по центру). */
import { motion } from "framer-motion";
import { FileText, Check, CheckCheck } from "lucide-react";
import { formatTime } from "@shop/core/time";
import { resolveImageSrc, resolveImageFull } from "@/lib/image";
import { cn } from "@/lib/cn";
import type { MessageDto } from "@/lib/api";

function timeOf(iso: string | null | undefined): string {
  if (!iso) return "";
  return formatTime(iso);
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
