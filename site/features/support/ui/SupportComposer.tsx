"use client";

/** Message composer of the support chat: text, one image (picker or paste), length counter. */
import { ImagePlus, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type SendMessageRequest } from "@shop/core/types";
import { useI18n } from "@/i18n/context";
import { supportApi, supportErrorText } from "../queries";

export function Composer({ onSend, maxLength }: { onSend: (req: SendMessageRequest) => Promise<void>; maxLength: number }) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [text]);

  const length = text.trim().length;
  const tooLong = length > maxLength;
  // Show the counter once the text gets near the limit, so short messages stay uncluttered.
  const showCounter = length > maxLength * 0.8;

  async function sendText() {
    const body = text.trim();
    if (!body || sending) return;
    if (tooLong) {
      setError(t("support.tooLong", { max: maxLength }));
      return;
    }
    setSending(true);
    setError(null);
    try {
      await onSend({ type: "TEXT", text: body });
      setText("");
    } catch (e) {
      setError(supportErrorText(e, t, "chat.sendFailed"));
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
      const caption = text.trim();
      if (caption.length > maxLength) {
        setError(t("support.tooLong", { max: maxLength }));
        return;
      }
      setUploading(true);
      setError(null);
      try {
        let key: string;
        try {
          key = (await supportApi.upload(file)).url;
        } catch {
          setError(t("chat.uploadFailed"));
          return;
        }
        await onSend({ type: "PHOTO", attachmentUrl: key, fileName: file.name, mimeType: file.type, text: caption || undefined });
        setText("");
      } catch (e) {
        setError(supportErrorText(e, t, "chat.sendFailed"));
      } finally {
        setUploading(false);
      }
    },
    [onSend, text, t, maxLength]
  );

  return (
    <div className="border-t border-[var(--line)] bg-[var(--surface)] px-3 py-3">
      {error && (
        <p role="alert" className="mb-1.5 px-1 text-[12px] font-semibold text-[var(--danger)]">
          {error}
        </p>
      )}
      <div className="flex items-end gap-2">
        <button
          type="button"
          aria-label={t("chat.attach")}
          title={t("chat.attach")}
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--muted)] transition-colors hover:text-[var(--ink)] active:scale-[.96] disabled:opacity-40"
        >
          <ImagePlus className={`h-5 w-5 ${uploading ? "animate-pulse" : ""}`} strokeWidth={2} />
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void uploadAndSend(f);
          }}
        />
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const item = Array.from(e.clipboardData.items).find((it) => it.type.startsWith("image/"));
            const file = item?.getAsFile();
            if (!file) return;
            e.preventDefault();
            void uploadAndSend(file);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendText();
            }
          }}
          rows={1}
          aria-label={t("chat.placeholder")}
          aria-invalid={tooLong || undefined}
          placeholder={t("chat.placeholder")}
          className={`max-h-[140px] min-h-[44px] min-w-0 flex-1 resize-none rounded-[var(--r)] border bg-[var(--surface-2)] px-3.5 py-2.5 text-[15px] text-[var(--ink)] outline-none placeholder:text-[var(--faint)] ${
            tooLong ? "border-[var(--danger)]" : "border-[var(--line)] focus:border-[var(--accent)]"
          }`}
        />
        <button
          type="button"
          aria-label={t("chat.send")}
          title={t("chat.send")}
          disabled={!text.trim() || sending || tooLong}
          onClick={() => void sendText()}
          className="chamfer grid h-11 w-11 shrink-0 place-items-center bg-[var(--accent)] text-[var(--accent-ink)] transition-colors [--chamfer:7px] hover:bg-[var(--accent-hi)] active:scale-[.96] disabled:opacity-40"
        >
          <Send className="h-5 w-5" strokeWidth={2.25} />
        </button>
      </div>
      {showCounter && (
        <p
          className={`mt-1 px-1 text-right font-display text-[11px] font-semibold tabular-nums ${tooLong ? "text-[var(--danger)]" : "text-[var(--faint)]"}`}
          aria-live="polite"
        >
          {t("support.counter", { n: length, max: maxLength })}
        </p>
      )}
    </div>
  );
}
