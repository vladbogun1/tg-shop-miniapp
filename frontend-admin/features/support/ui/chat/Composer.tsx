"use client";

/**
 * Reply box of a support thread: text (draft kept per thread for the session), attachment button
 * (a picture, also pasted from the clipboard, or a PDF). Free text without validation — plain state.
 */
import { Paperclip, Send } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@shop/ui/admin-button";
import { toast } from "@shop/ui/toast";
import { useCoarsePointer } from "@/lib/use-media";
import { loadDraft, saveDraft } from "../../model/draft";
import { useSendSupportFile, useSendSupportMessage } from "../../queries";

const ACCEPT = "image/*,application/pdf";

export function Composer({ threadId }: { threadId: string }) {
  const coarse = useCoarsePointer();
  const [text, setTextState] = useState(() => loadDraft(threadId));
  const fileRef = useRef<HTMLInputElement>(null);

  const setText = useCallback(
    (v: string) => {
      setTextState(v);
      saveDraft(threadId, v);
    },
    [threadId]
  );

  const sendText = useSendSupportMessage(threadId, () => setText(""));
  const sendFile = useSendSupportFile(threadId);

  function send() {
    const t = text.trim();
    if (!t || sendText.isPending) return;
    sendText.mutate(t);
  }

  function uploadFile(file: File) {
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      toast.error("Можно отправить изображение или PDF");
      return;
    }
    sendFile.mutate(file);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) uploadFile(file);
  }

  function onPaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
    const file = item?.getAsFile();
    if (file) {
      e.preventDefault();
      uploadFile(file);
    }
  }

  return (
    <div className="mt-2 flex items-end gap-2">
      <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={onFile} />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={sendFile.isPending}
        className="nb-press grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--border-2)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)] disabled:opacity-50"
        aria-label="Прикрепить фото или PDF"
        title="Прикрепить фото или PDF"
      >
        <Paperclip className="h-5 w-5" />
      </button>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={onPaste}
        onKeyDown={(e) => {
          // Desktop: Enter sends, Shift+Enter is a new line. Phone: Enter is a new line.
          if (e.key === "Enter" && !e.shiftKey && !coarse && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        rows={coarse ? 2 : 1}
        placeholder={coarse ? "Ответ клиенту…" : "Ответ клиенту… (Shift+Enter — новая строка, можно вставить фото)"}
        className="thin-scroll max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-[11px] text-[14px] leading-5 text-[var(--text)] outline-none transition-[border-color,box-shadow] placeholder:truncate placeholder:text-[13px] placeholder:text-[var(--text-faint)] hover:border-[var(--border-2)] focus:border-[var(--accent)] focus:shadow-[var(--ring-accent)]"
      />
      <Button
        variant="accent"
        onClick={send}
        loading={sendText.isPending}
        aria-label="Отправить"
        className="!h-11 !w-11 shrink-0 !rounded-[var(--r-md)] !p-0"
        icon={<Send className="h-5 w-5" />}
      />
    </div>
  );
}
