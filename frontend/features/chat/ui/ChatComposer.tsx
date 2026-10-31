"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ImagePlus, Send, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/context";
import { customerApi, type SendMessageRequest } from "@/lib/api";
import { spring } from "@/lib/motion";
import { haptic } from "@/platform/telegram";
import { isSendDisabled, isTooLong, showCounter } from "../model/composer";

/** What the reply strip needs from the message being replied to (order and support messages both fit). */
export interface ReplyPreview {
  senderName?: string | null;
  text?: string | null;
  type: string;
}

function errText(map: ((e: unknown, fallback: string) => string) | undefined, e: unknown, fallback: string) {
  return map ? map(e, fallback) : fallback;
}

/**
 * Composer — text input + attachment upload + paste-to-send + send. One for the order chat and the
 * support thread; the differences are options:
 *  - `maxLength` (support): length limit with a counter from 80 %;
 *  - `mapError` (support): the server's own wording for limit errors;
 *  - `sendWhileUploading` (order chat): the send button stays live while a photo is uploading;
 *  - `orderId`: kept as a `data-order` attribute on the send button.
 */
export function ChatComposer({
  replyTo,
  onCancelReply,
  onSend,
  maxLength,
  mapError,
  sendWhileUploading = false,
  orderId,
}: {
  replyTo: ReplyPreview | null;
  onCancelReply: () => void;
  onSend: (req: SendMessageRequest) => Promise<void>;
  maxLength?: number;
  mapError?: (e: unknown, fallback: string) => string;
  sendWhileUploading?: boolean;
  orderId?: string;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const tooLong = isTooLong(text, maxLength);

  // Auto-grow the textarea up to its max height.
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
      setError(errText(mapError, e, t("chat.sendFailed")));
    } finally {
      setSending(false);
    }
  }

  // Upload an image file and send it as a PHOTO (shared by picker + paste).
  const uploadAndSend = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setError(t("chat.imagesOnly"));
        return;
      }
      if (isTooLong(text, maxLength)) return;
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
        setError(errText(mapError, e, t("chat.uploadFailed")));
      } finally {
        setUploading(false);
      }
    },
    [onSend, text, t, maxLength, mapError]
  );

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await uploadAndSend(file);
  }

  // Paste-to-send: grab an image from the clipboard and upload it.
  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const item = Array.from(e.clipboardData.items).find((it) => it.type.startsWith("image/"));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    e.preventDefault();
    void uploadAndSend(file);
  }

  const sendDisabled = isSendDisabled({ text, sending, uploading, sendWhileUploading, tooLong });

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
      {showCounter(text, maxLength) && (
        <p
          className={`mb-1 px-1 text-right text-[11px] tabular-nums ${tooLong ? "font-bold text-[var(--danger)]" : "text-[var(--faint)]"}`}
        >
          {t("support.chars", { n: text.trim().length, max: maxLength as number })}
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
          disabled={sendDisabled}
          whileTap={{ scale: 0.9 }}
          transition={{ duration: 0.07 }}
          onClick={sendText}
          data-order={orderId}
          className="tap flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[var(--r)] bg-[var(--accent)] text-[var(--accent-ink)] shadow-[0_0_16px_-2px_rgba(255,102,0,.55)] transition-[opacity,box-shadow] disabled:opacity-40 disabled:shadow-none"
        >
          <Send className="h-5 w-5" strokeWidth={2.5} />
        </motion.button>
      </div>
    </div>
  );
}
