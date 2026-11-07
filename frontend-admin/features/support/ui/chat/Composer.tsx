"use client";

/**
 * Поле ответа вопроса поддержки: текст (черновик хранится по вопросу на сессию), вложение
 * (картинка, в том числе вставкой из буфера, или PDF). Enter на ПК отправляет, Shift+Enter — перенос,
 * на сенсорных устройствах Enter — перенос. Кнопка «Отправить ▾» открывает «Отправить и закрыть»
 * (Ctrl+Enter) — только у открытого вопроса. «⚡» и чипы над полем вставляют шаблон ответа (не отправляют).
 */
import { ChevronDown, Lock, Paperclip, Send, Zap } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@shop/ui/admin-button";
import { toast } from "@shop/ui/toast";
import { useCoarsePointer } from "@/lib/use-media";
import { loadDraft, saveDraft, withTemplate } from "../../model/draft";
import { QuickTemplates, TemplatePicker } from "@/features/order/view/ReplyTemplates";
import { useSendSupportFile, useSendSupportMessage, useThreadTemplatesQuery } from "../../queries";

const ACCEPT = "image/*,application/pdf";

export function Composer({ threadId, onSendAndClose }: { threadId: string; onSendAndClose?: () => void }) {
  const coarse = useCoarsePointer();
  const [text, setTextState] = useState(() => loadDraft(threadId));
  const [menu, setMenu] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const templates = useThreadTemplatesQuery(threadId);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /** После успешной отправки ещё и закрыть вопрос (выставляется перед отправкой). */
  const closeAfter = useRef(false);

  const setText = useCallback(
    (v: string) => {
      setTextState(v);
      saveDraft(threadId, v);
    },
    [threadId]
  );

  const sendText = useSendSupportMessage(threadId, () => {
    setText("");
    if (closeAfter.current) onSendAndClose?.();
    closeAfter.current = false;
  });
  const sendFile = useSendSupportFile(threadId);

  function send(andClose = false) {
    const t = text.trim();
    if (!t || sendText.isPending) return;
    closeAfter.current = andClose && !!onSendAndClose;
    setMenu(false);
    sendText.mutate(t);
  }

  function insertTemplate(t: string) {
    setText(withTemplate(text, t));
    requestAnimationFrame(() => inputRef.current?.focus());
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

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    // Ctrl/Cmd+Enter — «Отправить и закрыть» (где есть что закрывать), иначе обычная отправка.
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      send(true);
      return;
    }
    // Desktop: Enter sends, Shift+Enter is a new line. Phone: Enter is a new line.
    if (!e.shiftKey && !coarse) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      <QuickTemplates templates={templates} onPick={insertTemplate} onAll={() => setTemplatesOpen(true)} />
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
        <button
          type="button"
          onClick={() => setTemplatesOpen(true)}
          className="nb-press grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--border-2)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)]"
          aria-label="Шаблоны ответов"
          title="Шаблоны ответов"
        >
          <Zap className="h-5 w-5" />
        </button>
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          onKeyDown={onKeyDown}
          rows={coarse ? 2 : 1}
          placeholder={coarse ? "Ответ клиенту…" : "Ответ клиенту… (Shift+Enter — новая строка, можно вставить фото)"}
          className="thin-scroll max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-[11px] text-[14px] leading-5 text-[var(--text)] outline-none transition-[border-color,box-shadow] placeholder:truncate placeholder:text-[13px] placeholder:text-[var(--text-faint)] hover:border-[var(--border-2)] focus:border-[var(--accent)] focus:shadow-[var(--ring-accent)]"
        />
        <div className="relative flex shrink-0">
          <Button
            variant="accent"
            onClick={() => send()}
            loading={sendText.isPending}
            aria-label="Отправить"
            className={onSendAndClose ? "!h-11 !w-11 shrink-0 !rounded-[var(--r-md)] !rounded-r-none !p-0" : "!h-11 !w-11 shrink-0 !rounded-[var(--r-md)] !p-0"}
            icon={<Send className="h-5 w-5" />}
          />
          {onSendAndClose && (
            <>
              <button
                type="button"
                aria-label="Ещё варианты отправки"
                aria-expanded={menu}
                onClick={() => setMenu((v) => !v)}
                onBlur={(e) => {
                  if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node | null)) setMenu(false);
                }}
                className="nb-press grid h-11 w-8 place-items-center rounded-r-[var(--r-md)] border-l border-[rgba(0,0,0,.25)] bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-110"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              {menu && (
                <div className="elevated absolute bottom-full right-0 z-30 mb-2 w-max min-w-[220px] p-1.5">
                  <button
                    type="button"
                    onClick={() => send(true)}
                    className="focusable flex min-h-11 w-full items-center gap-2 rounded-[var(--r-sm)] px-3 text-left text-[13px] font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
                  >
                    <Lock className="h-4 w-4 text-[var(--accent)]" />
                    Отправить и закрыть
                    <span className="ml-auto pl-3 text-[11px] font-normal text-[var(--text-faint)]">Ctrl+Enter</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <TemplatePicker open={templatesOpen} templates={templates} onClose={() => setTemplatesOpen(false)} onPick={insertTemplate} />
    </>
  );
}
