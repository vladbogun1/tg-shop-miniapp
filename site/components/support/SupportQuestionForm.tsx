"use client";

/**
 * The first message of a support thread: optional subject (general questions only), the question
 * with a character counter, and one optional image (picker or paste). Used by the "Ask about this
 * product" dialog and by /account/support/new. On success the thread is returned to the caller
 * (for a product with an OPEN thread the server appends to it and returns that one).
 */
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Send, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { CreateSupportThreadRequest, SupportThread } from "@shop/shared";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useT } from "@/i18n/context";
import { SUPPORT_DEFAULTS, SUPPORT_KEYS, supportApi, supportErrorText, useSupportConfig } from "@/lib/support";

const SUBJECT_MAX = 200;

export function SupportQuestionForm({
  productId,
  showSubject = false,
  autoFocus = false,
  onCreated,
}: {
  productId?: string | null;
  showSubject?: boolean;
  autoFocus?: boolean;
  onCreated: (thread: SupportThread) => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const { config } = useSupportConfig();
  const maxLength = config?.maxLength ?? SUPPORT_DEFAULTS.maxLength;
  const textId = useId();
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pick(f: File | null | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError(t("chat.imagesOnly"));
      return;
    }
    setError(null);
    setFile(f);
  }

  const length = text.trim().length;
  const tooLong = length > maxLength;
  const canSend = (length > 0 || !!file) && !tooLong && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (length === 0 && !file) {
      setError(t("support.needText"));
      return;
    }
    if (tooLong) {
      setError(t("support.tooLong", { max: maxLength }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: CreateSupportThreadRequest = { type: "TEXT" };
      if (productId) body.productId = productId;
      if (showSubject && subject.trim()) body.subject = subject.trim();
      if (length > 0) body.text = text.trim();
      if (file) {
        let key: string;
        try {
          key = (await supportApi.upload(file)).url;
        } catch {
          setError(t("chat.uploadFailed"));
          return;
        }
        body.type = "PHOTO";
        body.attachmentUrl = key;
        body.fileName = file.name;
        body.mimeType = file.type;
      }
      const thread = await supportApi.create(body);
      qc.setQueryData(SUPPORT_KEYS.thread(thread.id), thread);
      void qc.invalidateQueries({ queryKey: SUPPORT_KEYS.threads });
      onCreated(thread);
    } catch (err) {
      setError(supportErrorText(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3" noValidate>
      {showSubject && (
        <Input
          label={t("support.subject")}
          value={subject}
          maxLength={SUBJECT_MAX}
          onChange={(e) => setSubject(e.target.value)}
        />
      )}

      <div>
        <label htmlFor={textId} className="eyebrow mb-1.5 block text-[11px]">
          {t("support.text")}
        </label>
        <textarea
          id={textId}
          value={text}
          autoFocus={autoFocus}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const item = Array.from(e.clipboardData.items).find((it) => it.type.startsWith("image/"));
            const f = item?.getAsFile();
            if (!f) return;
            e.preventDefault();
            pick(f);
          }}
          rows={5}
          placeholder={t("support.textPlaceholder")}
          aria-invalid={tooLong || undefined}
          className={`block min-h-[120px] w-full resize-y rounded-[var(--r)] border bg-[var(--surface-2)] px-3.5 py-2.5 text-[15px] text-[var(--ink)] outline-none placeholder:text-[var(--faint)] focus:shadow-[0_0_0_3px_var(--accent-soft)] ${
            tooLong ? "border-[var(--danger)]" : "border-[var(--line-strong)] focus:border-[var(--accent)]"
          }`}
        />
        <p
          className={`mt-1 text-right font-display text-[11px] font-semibold tabular-nums ${
            tooLong ? "text-[var(--danger)]" : "text-[var(--faint)]"
          }`}
          aria-live="polite"
        >
          {t("support.counter", { n: length, max: maxLength })}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {preview ? (
          <div className="relative">
            <img
              src={preview}
              alt={file?.name ?? t("support.photo")}
              className="h-20 w-20 rounded-[var(--r)] border border-[var(--line)] object-cover"
            />
            <button
              type="button"
              onClick={() => setFile(null)}
              aria-label={t("support.removeImage")}
              title={t("support.removeImage")}
              className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--danger)] hover:text-[var(--danger)]"
            >
              <X className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex min-h-11 items-center gap-2 rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-3.5 font-display text-[13px] font-semibold uppercase tracking-[.06em] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
          >
            <ImagePlus className="h-4 w-4" strokeWidth={2.25} />
            {t("support.attach")}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          hidden
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            pick(f);
          }}
        />
      </div>

      {error && (
        <p role="alert" className="text-[13px] font-semibold text-[var(--danger)]">
          {error}
        </p>
      )}

      <Button
        type="submit"
        variant="accent"
        size="md"
        loading={busy}
        disabled={!canSend}
        icon={<Send className="h-4 w-4" strokeWidth={2.25} />}
        className="self-start"
      >
        {t("support.submit")}
      </Button>
    </form>
  );
}
